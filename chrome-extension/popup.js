// ReportingRoom Scan Request — popup logic (MV3, no build step)

const API_BASE = "https://reportingroom.net";

const $ = (id) => document.getElementById(id);
const views = ["view-login", "view-code", "view-form"];

function show(view) {
  views.forEach((v) => $(v).classList.toggle("hidden", v !== view));
  msg("");
}

function msg(text, kind) {
  const el = $("msg");
  el.textContent = text || "";
  el.className = "msg" + (text ? " " + (kind || "err") : "");
}

async function api(path, method, body) {
  const res = await fetch(API_BASE + path, {
    method: method || "GET",
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error((data && data.message) || "Request failed (" + res.status + ")");
  return data;
}

// ---------- auth ----------

async function init() {
  try {
    const user = await api("/api/auth/user");
    onSignedIn(user);
  } catch {
    show("view-login");
  }
}

function onSignedIn(user) {
  $("whoami").textContent = "Signed in as " + (user.email || "staff");
  show("view-form");
  loadScanTypes();
  readPage(true); // best-effort auto-read on open
}

$("btn-login").addEventListener("click", async () => {
  msg("");
  $("btn-login").disabled = true;
  try {
    const data = await api("/api/auth/login", "POST", {
      email: $("login-email").value.trim(),
      password: $("login-password").value,
    });
    if (data && data.requiresTwoFactor) {
      $("phone-hint").textContent = data.phoneHint || "your mobile";
      show("view-code");
    } else {
      init();
    }
  } catch (e) {
    msg(e.message);
  } finally {
    $("btn-login").disabled = false;
  }
});

$("btn-verify").addEventListener("click", async () => {
  msg("");
  $("btn-verify").disabled = true;
  try {
    await api("/api/auth/verify-2fa", "POST", { code: $("login-code").value.trim() });
    init();
  } catch (e) {
    msg(e.message);
  } finally {
    $("btn-verify").disabled = false;
  }
});

$("btn-logout").addEventListener("click", async () => {
  try { await api("/api/auth/logout", "POST"); } catch {}
  show("view-login");
});

// ---------- scan types ----------

async function loadScanTypes() {
  const sel = $("f-scantype");
  sel.innerHTML = "";
  try {
    const durations = await api("/api/scan-durations");
    const names = (durations || []).map((d) => d.scanType || d.name).filter(Boolean);
    const unique = [...new Set(names)];
    unique.forEach((n) => {
      const o = document.createElement("option");
      o.value = n; o.textContent = n;
      sel.appendChild(o);
    });
    if (unique.length === 0) throw new Error("empty");
  } catch {
    ["Carotid Doppler", "Venous Doppler", "Arterial Doppler", "Aortic Ultrasound", "Other"].forEach((n) => {
      const o = document.createElement("option");
      o.value = n; o.textContent = n;
      sel.appendChild(o);
    });
  }
}

// ---------- read patient off the page ----------

// This function is serialized and injected into the current tab. It must be
// fully self-contained (no closures over popup scope).
function extractPatientFromPage() {
  const sel = ((window.getSelection && String(window.getSelection())) || "").trim();
  const text = sel.length > 0 ? sel : (document.body ? document.body.innerText : "");
  const out = { name: null, dob: null, phone: null, email: null, medicare: null, medicareIrn: null, usedSelection: sel.length > 0 };
  if (!text) return out;

  // Email
  const em = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (em) out.email = em[0];

  // AU mobile (04xx xxx xxx or +61 4xx ...)
  const ph = text.match(/(?:\+61[\s-]?4|04)\d{2}[\s-]?\d{3}[\s-]?\d{3}/);
  if (ph) out.phone = ph[0].replace(/[\s-]/g, "");

  // Medicare card number: 10 digits (starts 2-6), validated with the official
  // check digit so we never mistake a phone/IHI/ID for it. Optional IRN after.
  for (const m of text.matchAll(/\b([2-6]\d{3})[ ]?(\d{5})[ ]?(\d)(?:\s*[-/]?\s*([1-9]))?\b/g)) {
    const d = (m[1] + m[2] + m[3]).split("").map(Number);
    const check = (d[0] + 3 * d[1] + 7 * d[2] + 9 * d[3] + d[4] + 3 * d[5] + 7 * d[6] + 9 * d[7]) % 10;
    if (check === d[8]) {
      out.medicare = m[1] + m[2] + m[3];
      if (m[4]) out.medicareIrn = m[4];
      break;
    }
  }

  // Dates dd/mm/yyyy
  const dates = [...text.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g)];
  // Prefer a date whose age matches "NN years old" if present, else the
  // oldest plausible date (DOBs are in the past; appointment dates are recent).
  const ageM = text.match(/\b(\d{1,3})\s*(?:years?\s*old|yrs?|y\.?o\.?)\b/i);
  const now = Date.now();
  let dob = null;
  for (const m of dates) {
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    if (isNaN(d) || d.getTime() > now) continue;
    const age = Math.floor((now - d.getTime()) / (365.25 * 24 * 3600 * 1000));
    if (ageM && age === +ageM[1]) { dob = m; break; }
    if (age >= 10 && age <= 110 && (!dob || +m[3] < +dob[3])) dob = m;
  }
  if (dob) out.dob = dob[3] + "-" + dob[2] + "-" + dob[1]; // yyyy-mm-dd

  // Name. Prefer a name in the same small block of the page as the DOB
  // (e.g. Clinic to Cloud's patient card) — pages often list other people
  // (signed-in user, appointment list) elsewhere.
  const nameRe = /\b(?:Mr|Mrs|Ms|Miss|Mx)\.?\s+([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,2})\b/;
  const nameReDr = /\b(?:Mr|Mrs|Ms|Miss|Mx|Dr)\.?\s+([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,2})\b/;

  function nameNearDob(dobRaw) {
    if (!document.body || !document.createTreeWalker) return null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node, anchor = null;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.indexOf(dobRaw) !== -1) { anchor = node.parentElement; break; }
    }
    if (!anchor) return null;
    // Walk up a few levels; stop before the block gets so big it spans the page.
    let el = anchor;
    for (let i = 0; el && i < 8; i++, el = el.parentElement) {
      const t = el.innerText || "";
      if (t.length > 1200) break;
      const m = t.match(nameRe) || t.match(nameReDr);
      if (m) return m[1];
    }
    return null;
  }

  if (!sel && dob) out.name = nameNearDob(dob[0]);
  if (!out.name) {
    const nm = text.match(nameRe) || text.match(nameReDr);
    if (nm) out.name = nm[1];
  }

  return out;
}

async function readPage(silent) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error("No active tab");
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPatientFromPage,
    });
    const p = results && results[0] && results[0].result;
    if (!p) throw new Error("Couldn't read the page");
    if (p.name) $("f-name").value = p.name;
    if (p.dob) $("f-dob").value = p.dob;
    if (p.phone) $("f-phone").value = p.phone;
    if (p.email) $("f-email").value = p.email;
    if (p.medicare) $("f-medicare").value = p.medicare;
    if (p.medicareIrn) $("f-medicare-irn").value = p.medicareIrn;
    if (!silent) {
      const found = ["name", "dob", "phone", "email", "medicare"].filter((k) => p[k]).length;
      msg(found
        ? "Picked up " + found + " detail" + (found > 1 ? "s" : "") + (p.usedSelection ? " from your highlighted text." : " from the page.")
        : "Couldn't find patient details. Try highlighting them on the page first, then click again.",
        found ? "ok" : "err");
    }
  } catch (e) {
    if (!silent) msg("Couldn't read this page: " + e.message);
  }
}

$("btn-read").addEventListener("click", () => readPage(false));

// ---------- read an on-screen PDF via a screenshot + AI ----------

$("btn-read-pdf").addEventListener("click", async () => {
  const btn = $("btn-read-pdf");
  btn.disabled = true;
  msg("Reading the screen…", "ok");
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
    if (!dataUrl) throw new Error("Couldn't capture the screen");
    const data = await api("/api/extension/extract-screenshot", "POST", { image: dataUrl });
    const x = (data && data.extracted) || {};
    if (x.patientName) $("f-name").value = x.patientName;
    if (x.patientDob) {
      // Server returns the DOB as written; convert dd/mm/yyyy-ish to yyyy-mm-dd for the date input.
      const m = String(x.patientDob).match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
      if (m) {
        let y = +m[3]; if (y < 100) y += y > new Date().getFullYear() % 100 ? 1900 : 2000;
        $("f-dob").value = y + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[1]).padStart(2, "0");
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(x.patientDob)) {
        $("f-dob").value = x.patientDob;
      }
    }
    if (x.patientPhone) $("f-phone").value = x.patientPhone;
    if (x.patientEmail) $("f-email").value = x.patientEmail;
    if (x.patientMedicareNumber) $("f-medicare").value = x.patientMedicareNumber;
    if (x.patientMedicareIrn) $("f-medicare-irn").value = x.patientMedicareIrn;
    if (Array.isArray(x.scanTypes) && x.scanTypes[0]) {
      const sel = $("f-scantype");
      for (const o of sel.options) if (o.value === x.scanTypes[0]) { sel.value = o.value; break; }
    }
    if (x.clinicalIndication) $("f-notes").value = x.clinicalIndication;
    const found = ["patientName", "patientDob", "patientPhone", "patientEmail", "patientMedicareNumber"].filter((k) => x[k]).length;
    msg(found ? "Read " + found + " detail" + (found > 1 ? "s" : "") + " from the screen." : "Couldn't find patient details on the screen. Make sure they're visible, then try again.", found ? "ok" : "err");
  } catch (e) {
    msg("Couldn't read the screen: " + e.message);
  } finally {
    btn.disabled = false;
  }
});

// ---------- submit ----------

$("btn-submit").addEventListener("click", async () => {
  const name = $("f-name").value.trim();
  if (!name) return msg("Patient name is required.");
  $("btn-submit").disabled = true;
  msg("");
  try {
    const today = new Date();
    const requestDate = today.getFullYear() + "-" +
      String(today.getMonth() + 1).padStart(2, "0") + "-" +
      String(today.getDate()).padStart(2, "0");
    const created = await api("/api/scan-requests", "POST", {
      patientName: name,
      patientDob: $("f-dob").value || null,
      patientPhone: $("f-phone").value.trim() || null,
      patientEmail: $("f-email").value.trim() || null,
      patientMedicareNumber: $("f-medicare").value.replace(/\D/g, "") || null,
      patientMedicareIrn: $("f-medicare-irn").value.trim() || null,
      scanTypes: [$("f-scantype").value],
      urgency: $("f-urgency").value,
      clinicalIndication: $("f-notes").value.trim() || null,
      requestDate,
      source: "extension",
    });
    msg(created && created.patientId
      ? "Saved and matched to the patient's file ✓"
      : "Saved to the Requests page ✓ (no exact patient match — link it there)", "ok");
  } catch (e) {
    msg(e.message);
  } finally {
    $("btn-submit").disabled = false;
  }
});

init();
