// ReportingRoom — tick bookings that already have a referral.
//
// Runs on the Clinic to Cloud scheduler. For each booking row on screen it
// reads the patient's display name and phone number, asks ReportingRoom which
// of them already have a scan request dated for the day being viewed, and draws
// a red tick over the bottom-right of the ones that do.
//
// This overlays a third-party clinical system, and a tick against a booking
// that was never referred would cause staff to skip real work. So:
//
//  * It FAILS CLOSED. If the day being viewed can't be established beyond
//    doubt, if the bookings can't be read, or if the lookup fails, no ticks are
//    drawn at all and the pill in the corner says why. An absence of ticks must
//    never be mistaken for "nothing outstanding".
//  * It never assumes today. A wrong date is a wrong answer, not a near miss.
//  * It never modifies the host page. Ticks live in one overlay layer of our
//    own, positioned over the rows, so the scheduler's own scripts can re-render
//    freely without tripping over foreign nodes.
//
// The scheduler's markup is not published and can change without notice, so row
// detection is structural rather than selector-based.

(() => {
  "use strict";

  const TICK = "\u2713";
  const RESCAN_DEBOUNCE_MS = 600;
  const MAX_ROWS = 300;

  let overlay = null;
  let pill = null;
  let observer = null;
  let sizeObserver = null;
  let rescanTimer = null;
  let repositionQueued = false;
  let lastQueryKey = null;
  let lastMatched = [];
  let tickedRows = [];

  const onSchedulerPage = () => /scheduler/i.test(location.pathname);

  // ---------- dates ----------

  const MONTHS = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };

  const pad = (n) => String(n).padStart(2, "0");
  const toISO = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

  function validISO(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    if (y < 2000 || y > 2100) return null;
    return toISO(y, m, d);
  }

  function prettyDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: "long", day: "numeric", month: "long",
    });
  }

  /** Every date we can read out of a string, as ISO. Australian day-first. */
  function datesIn(text) {
    const out = [];
    let m;

    const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    while ((m = iso.exec(text))) {
      const v = validISO(+m[1], +m[2], +m[3]);
      if (v) out.push(v);
    }

    const dMonY = /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/gi;
    while ((m = dMonY.exec(text))) {
      const v = validISO(+m[3], MONTHS[m[2].toLowerCase().slice(0, 3)], +m[1]);
      if (v) out.push(v);
    }

    const monDY = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi;
    while ((m = monDY.exec(text))) {
      const v = validISO(+m[3], MONTHS[m[1].toLowerCase().slice(0, 3)], +m[2]);
      if (v) out.push(v);
    }

    const numeric = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
    while ((m = numeric.exec(text))) {
      const v = validISO(+m[3], +m[2], +m[1]); // day first
      if (v) out.push(v);
    }

    return out;
  }

  /**
   * Which day is on screen. The address bar is trusted first — it is the one
   * place the scheduler states the selected day unambiguously. Falling back to
   * the page text is only safe when the top of the page mentions exactly one
   * date; two competing dates means we do not know, and we say so.
   */
  function resolveDate() {
    const fromUrl = datesIn(decodeURIComponent(location.href));
    const uniqueUrl = [...new Set(fromUrl)];
    if (uniqueUrl.length === 1) return { date: uniqueUrl[0], source: "url" };

    const header = (document.body.innerText || "").slice(0, 3000);
    const unique = [...new Set(datesIn(header))];
    if (unique.length === 1) return { date: unique[0], source: "page" };
    return { date: null, source: unique.length > 1 ? "ambiguous" : "none" };
  }

  // ---------- reading the booking rows ----------

  function looksLikePhone(text) {
    const t = (text || "").trim();
    if (!t || t.length > 22) return false;
    if (!/^[\d\s+()\-]+$/.test(t)) return false;
    const digits = t.replace(/\D/g, "");
    return digits.length >= 9 && digits.length <= 12;
  }

  function extractName(rowText, phoneText) {
    let s = (rowText || "").replace(phoneText, " ");
    s = s.replace(/\d{1,2}:\d{2}\s*(?:AM|PM)/gi, " ");   // 09:44 AM
    s = s.replace(/\(\s*\d+\s*h[^)]*\)/gi, " ");          // (5h 25m)
    s = s.replace(/\b\d[\d\s.-]*/g, " ");                 // any other digits

    // Prefer a titled name — that is unambiguously the patient.
    let m = s.match(
      /\b(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof)\.?\s+[A-Z][\w'’-]+(?:\s+\([A-Za-z'’-]+\))?(?:\s+[A-Z][\w'’-]+)*/
    );
    if (m) return m[0].trim();

    // Otherwise the first run of two or more capitalised words.
    m = s.match(/\b[A-Z][a-z'’-]+(?:\s+\([A-Za-z'’-]+\))?(?:\s+[A-Z][a-z'’-]+)+/);
    return m ? m[0].trim() : null;
  }

  // Walk up from the phone to the smallest ancestor that also carries a name.
  function findRowContainer(phoneNode, phoneText) {
    let el = phoneNode.parentElement;
    for (let i = 0; i < 6 && el && el !== document.body; i++) {
      const text = el.innerText || "";
      // A booking row is a small amount of text. Anything large means we have
      // climbed past the row into the day column or the whole grid.
      if (text.length > 0 && text.length < 400 && extractName(text, phoneText)) return el;
      el = el.parentElement;
    }
    return null;
  }

  /**
   * One entry per booking on screen. Deliberately NOT de-duplicated by patient:
   * two bookings for the same person on the same day are two rows and must both
   * be ticked, or the second looks outstanding.
   */
  function collectRows() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const rows = [];
    const seenEls = new Set();

    let node;
    while ((node = walker.nextNode())) {
      const raw = node.nodeValue;
      if (!looksLikePhone(raw)) continue;

      const phoneText = raw.trim();
      const container = findRowContainer(node, phoneText);
      if (!container || seenEls.has(container)) continue;

      const name = extractName(container.innerText || "", phoneText);
      if (!name) continue;

      seenEls.add(container);
      rows.push({ name, phone: phoneText, el: container });
    }

    return rows;
  }

  // ---------- drawing ----------

  function ensureOverlay() {
    if (overlay && overlay.isConnected) return overlay;
    overlay = document.createElement("div");
    overlay.className = "rr-overlay";
    document.body.appendChild(overlay);
    return overlay;
  }

  /** Take the ticks off screen right now, keeping nothing that could be stale. */
  function hideTicks() {
    if (sizeObserver) sizeObserver.disconnect();
    tickedRows = [];
    if (overlay) overlay.replaceChildren();
  }

  function clearTicks() {
    hideTicks();
    lastMatched = [];
  }

  function positionTicks() {
    if (!overlay) return;
    overlay.replaceChildren();
    for (const row of tickedRows) {
      if (!row.el.isConnected) continue;
      const rect = row.el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      const tick = document.createElement("span");
      tick.className = "rr-referral-tick";
      tick.textContent = TICK;
      tick.style.left = `${rect.right - 16}px`;
      tick.style.top = `${rect.bottom - 17}px`;
      overlay.appendChild(tick);
    }
  }

  function queueReposition() {
    if (repositionQueued) return;
    repositionQueued = true;
    requestAnimationFrame(() => {
      repositionQueued = false;
      positionTicks();
    });
  }

  function drawTicks(rows, matchedIndexes) {
    ensureOverlay();
    tickedRows = matchedIndexes.map((i) => rows[i]).filter(Boolean);

    // Rows can be moved or resized by the scheduler's own layout without any
    // scroll or resize of the window, so watch the rows themselves too.
    if (!sizeObserver) sizeObserver = new ResizeObserver(queueReposition);
    sizeObserver.disconnect();
    sizeObserver.observe(document.body);
    for (const row of tickedRows) sizeObserver.observe(row.el);

    positionTicks();
  }

  function setPill(state, text) {
    if (!pill || !pill.isConnected) {
      pill = document.createElement("div");
      pill.className = "rr-status-pill";
      document.body.appendChild(pill);
    }
    pill.dataset.state = state;
    pill.textContent = text; // textContent, never innerHTML — this sits in a clinical system
  }

  function removePill() {
    if (pill) pill.remove();
    pill = null;
  }

  /** Every failure path lands here: ticks off, and the reason stated plainly. */
  function failClosed(text) {
    clearTicks();
    lastQueryKey = null;
    setPill("off", text);
  }

  // ---------- the scan ----------

  async function scan() {
    if (!onSchedulerPage()) {
      clearTicks();
      removePill();
      lastQueryKey = null;
      return;
    }

    const rows = collectRows();
    if (!rows.length) {
      failClosed("ReportingRoom: couldn't read any bookings on this page, so no referral ticks are shown.");
      return;
    }
    if (rows.length > MAX_ROWS) {
      failClosed(`ReportingRoom: too many bookings on screen (${rows.length}). No ticks shown — narrow the view to a single day.`);
      return;
    }

    const { date, source } = resolveDate();
    if (!date) {
      failClosed(
        source === "ambiguous"
          ? "ReportingRoom: more than one date on this page, so we can't tell which day you're viewing. No ticks shown."
          : "ReportingRoom: couldn't tell which day this page is showing. No ticks shown."
      );
      return;
    }

    const queryKey = date + "::" + rows.map((r) => `${r.name}|${r.phone}`).join(",");
    if (queryKey === lastQueryKey) {
      // Same day, same bookings — reuse the answer, but redraw against the rows
      // just collected. The old row elements may have been recycled underneath us.
      drawTicks(rows, lastMatched);
      return;
    }

    let reply;
    try {
      reply = await chrome.runtime.sendMessage({
        type: "rr-referral-status",
        date,
        rows: rows.map((r) => ({ name: r.name, phone: r.phone })),
      });
    } catch {
      reply = { ok: false, reason: "unreachable" };
    }

    if (!reply || !reply.ok) {
      failClosed(
        reply && reply.reason === "signed-out"
          ? "ReportingRoom: not signed in — click the extension icon. No referral ticks are shown."
          : "ReportingRoom: couldn't check referrals just now. No ticks are shown."
      );
      return;
    }

    const matched = reply.data.matched || [];
    lastQueryKey = queryKey;
    lastMatched = matched;
    drawTicks(rows, matched);
    setPill(
      "ok",
      `ReportingRoom: ${matched.length} of ${rows.length} bookings referred for ${prettyDate(date)}` +
        (source === "url" ? "." : " (date read off the page — check it matches).")
    );
  }

  function scheduleScan() {
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(() => { scan().catch(() => {}); }, RESCAN_DEBOUNCE_MS);
  }

  // ---------- wiring ----------

  // Ticks sit in our own layer, so host re-renders move the rows out from under
  // them. Follow scroll and resize, and re-scan when the page itself changes.
  addEventListener("scroll", queueReposition, { passive: true, capture: true });
  addEventListener("resize", queueReposition, { passive: true });

  observer = new MutationObserver((mutations) => {
    // Our overlay lives outside the scheduler's tree, but guard anyway.
    const ours = mutations.every((m) => overlay && overlay.contains(m.target));
    if (ours) return;
    // Pull the ticks off screen immediately. The scheduler may have just moved
    // or recycled the rows underneath them, and a tick sitting over the wrong
    // booking for the length of the debounce is exactly the failure to avoid.
    hideTicks();
    scheduleScan();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Single-page navigation between days does not reload the script.
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      lastQueryKey = null;
      scheduleScan();
    }
  }, 1000);

  scheduleScan();
})();
