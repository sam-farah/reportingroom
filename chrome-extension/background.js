// ReportingRoom — background service worker (MV3)
//
// The content script runs on clinictocloud.com.au, so any fetch it makes to
// reportingroom.net is a cross-origin request from that page's origin and gets
// blocked by the API's CORS allowlist. Requests from here (the extension's own
// context) are covered by host_permissions instead, which is why the lookup is
// proxied through this worker rather than done in the page.

const API_BASE = "https://reportingroom.net";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "rr-referral-status") return;

  (async () => {
    try {
      const res = await fetch(API_BASE + "/api/extension/referral-status", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: msg.date, rows: msg.rows }),
      });

      if (res.status === 401 || res.status === 403) {
        sendResponse({ ok: false, reason: "signed-out" });
        return;
      }
      if (!res.ok) {
        sendResponse({ ok: false, reason: "error", status: res.status });
        return;
      }
      sendResponse({ ok: true, data: await res.json() });
    } catch {
      // Offline, DNS failure, service worker torn down mid-flight, etc.
      sendResponse({ ok: false, reason: "unreachable" });
    }
  })();

  return true; // keep the message channel open for the async reply
});
