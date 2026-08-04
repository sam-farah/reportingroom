// ReportingRoom — tick bookings that already have a referral.
//
// Runs on the Clinic to Cloud practice scheduler (a Kendo UI scheduler served by
// their ASP.NET app). For each patient booking on screen it reads the name, date
// of birth and phone, asks ReportingRoom which of them already have a scan
// request dated for the day being viewed, and draws a red tick over the
// bottom-right of the ones that do.
//
// This overlays a third-party clinical system, and a tick against a booking that
// was never referred would cause staff to skip real work. So:
//
//  * It FAILS CLOSED. If the day on screen can't be established beyond doubt, if
//    the bookings can't be read, or if the lookup fails, no ticks are drawn at
//    all and the pill in the corner says why. An absence of ticks must never be
//    mistaken for "nothing outstanding".
//  * It never assumes today. A wrong date is a wrong answer, not a near miss.
//  * It never modifies the host page. Ticks live in one overlay layer of our own,
//    so the scheduler can re-render freely without tripping over foreign nodes.
//
// Selectors below come from the scheduler's actual markup:
//   - each patient booking is `div.appt-tmpl`, whose `data-title` tooltip holds
//     "Full Name:", "Birthday:" and "Phone:" in <strong> tags
//   - a cancelled booking renders a sibling `div.cancelled-appt`
//   - the selected day is on `#location-current-date[data-location-date]`
//     (dd/mm/yyyy) and in the `?date=yyyymmdd` link beside it

(() => {
  "use strict";

  const TICK = "\u2713";
  const RESCAN_DEBOUNCE_MS = 500;
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

  function buildDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    if (y < 2000 || y > 2100) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  function prettyDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: "long", day: "numeric", month: "long",
    });
  }

  /** "04/08/2026" — Australian day-first, as the scheduler writes it. */
  function parseDMY(text) {
    const m = (text || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? buildDate(+m[3], +m[2], +m[1]) : null;
  }

  /** "...?date=20260804" */
  function parseCompact(text) {
    const m = (text || "").match(/(20\d{2})(\d{2})(\d{2})/);
    return m ? buildDate(+m[1], +m[2], +m[3]) : null;
  }

  /** Every date in a free-text label, for Kendo's own current-range caption. */
  function datesIn(text) {
    const out = [];
    let m;

    const dMonY = /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/gi;
    while ((m = dMonY.exec(text))) {
      const v = buildDate(+m[3], MONTHS[m[2].toLowerCase().slice(0, 3)], +m[1]);
      if (v) out.push(v);
    }

    const monDY = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi;
    while ((m = monDY.exec(text))) {
      const v = buildDate(+m[3], MONTHS[m[1].toLowerCase().slice(0, 3)], +m[2]);
      if (v) out.push(v);
    }

    const numeric = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
    while ((m = numeric.exec(text))) {
      const v = buildDate(+m[3], +m[2], +m[1]); // day first
      if (v) out.push(v);
    }

    return out;
  }

  /**
   * Which day is on screen. Several independent places on the page state it, and
   * they must all agree — if the header and the address bar disagree, the page
   * is mid-navigation or we have misread it, and we would rather show nothing.
   */
  function resolveDate() {
    const found = new Set();

    const header = document.querySelector("#location-current-date[data-location-date]");
    if (header) {
      const d = parseDMY(header.getAttribute("data-location-date"));
      if (d) found.add(d);
    }

    const link = document.querySelector("a.js-header-current-date[href*='date=']");
    if (link) {
      const d = parseCompact(link.getAttribute("href"));
      if (d) found.add(d);
    }

    const param = new URLSearchParams(location.search).get("date");
    if (param) {
      const d = parseCompact(param);
      if (d) found.add(d);
    }

    // Kendo's own caption between the prev/next arrows. A range view spells out
    // two dates here, which is positive evidence we are NOT on a single day —
    // treat that as a stop, not as a source to ignore. It is the backstop for
    // schedulerView() failing to recognise the view.
    const nav = document.querySelector(".k-nav-current");
    if (nav) {
      const dates = [...new Set(datesIn(nav.textContent || ""))];
      if (dates.length > 1) return { date: null, state: "range" };
      if (dates.length === 1) found.add(dates[0]);
    }

    const list = [...found];
    if (list.length === 1) return { date: list[0], state: "ok" };
    return { date: null, state: list.length > 1 ? "disagree" : "none" };
  }

  /**
   * Kendo puts the active view on the widget root as `k-scheduler-dayview`,
   * `k-scheduler-monthview` and so on. Only a single-day view can be ticked
   * against a single date.
   */
  function schedulerView() {
    const root = document.querySelector(".k-scheduler");
    if (root) {
      for (const cls of root.classList) {
        const m = /^k-scheduler-(\w+)view$/.exec(cls);
        if (m) return m[1].toLowerCase();
      }
    }
    const selected = document.querySelector(
      ".k-scheduler-navigation .k-state-selected a[data-name], .k-scheduler-views .k-state-selected a[data-name]"
    );
    if (selected) return (selected.getAttribute("data-name") || "").toLowerCase();
    return null;
  }

  // ---------- reading the booking rows ----------

  function decodeEntities(text) {
    const el = document.createElement("textarea");
    el.innerHTML = text;
    return el.value;
  }

  /** Pull "Full Name", "Birthday" or "Phone" out of a booking's data-title. */
  function titleField(title, label) {
    const re = new RegExp(
      `${label}\\s*:\\s*(?:<strong>|&lt;strong&gt;)?([\\s\\S]*?)(?:<\\/strong>|&lt;\\/strong&gt;|<br|&lt;br|$)`,
      "i"
    );
    const m = title.match(re);
    if (!m) return null;
    const value = decodeEntities(m[1]).trim();
    return value || null;
  }

  /**
   * One entry per patient booking on screen. Deliberately NOT de-duplicated by
   * patient: two bookings for the same person on the same day are two rows and
   * must both be ticked, or the second looks outstanding.
   */
  function collectRows() {
    const rows = [];

    for (const el of document.querySelectorAll("div.appt-tmpl")) {
      const title = el.getAttribute("data-title") || "";

      // Only patient bookings carry a full name. Blocked-out time and group
      // bookings don't, and neither needs a referral.
      const rawName = titleField(title, "Full Name");
      if (!rawName) continue;

      // A cancelled booking renders this marker alongside the template.
      const parent = el.parentElement;
      if (parent && parent.querySelector(":scope > .cancelled-appt")) continue;

      // "Daniela Tasker 63yrs" -> "Daniela Tasker"
      const name = rawName.replace(/\s*\d+\s*yrs?\s*$/i, "").trim();
      if (!name) continue;

      rows.push({
        el,
        name,
        dob: titleField(title, "Birthday"),
        phone: titleField(title, "Phone"),
      });
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

    const view = schedulerView();
    if (view && view !== "day") {
      failClosed("ReportingRoom: referral ticks only work in Day view. Switch to Day to see them.");
      return;
    }

    const rows = collectRows();
    if (!rows.length) {
      failClosed("ReportingRoom: no patient bookings found on this page, so no referral ticks are shown.");
      return;
    }
    if (rows.length > MAX_ROWS) {
      failClosed(`ReportingRoom: too many bookings on screen (${rows.length}). No ticks shown.`);
      return;
    }

    const { date, state } = resolveDate();
    if (!date) {
      const reason = {
        range: "ReportingRoom: referral ticks only work in Day view. Switch to Day to see them.",
        disagree: "ReportingRoom: this page shows more than one date, so we can't tell which day you're viewing. No ticks shown.",
      }[state] || "ReportingRoom: couldn't tell which day this page is showing. No ticks shown.";
      failClosed(reason);
      return;
    }

    const queryKey = date + "::" + rows.map((r) => `${r.name}|${r.dob}|${r.phone}`).join(",");
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
        rows: rows.map((r) => ({ name: r.name, dob: r.dob, phone: r.phone })),
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
      `ReportingRoom: ${matched.length} of ${rows.length} bookings referred for ${prettyDate(date)}.` +
        (view ? "" : " (couldn't confirm Day view)")
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

  // Moving between days does not always reload the script.
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
