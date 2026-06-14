// Twilio SMS service — talks to the Twilio REST API directly via fetch so no extra
// dependency is required. Credentials are read fresh from the environment on every call
// (never cached) so that adding them later activates SMS without a restart of this module.

import crypto from "crypto";

function getCreds() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
  const fromNumber = process.env.TWILIO_PHONE_NUMBER?.trim() || "";
  return { accountSid, authToken, fromNumber };
}

/** True when all three Twilio credentials are present. */
export function isSmsConfigured(): boolean {
  const { accountSid, authToken, fromNumber } = getCreds();
  return Boolean(accountSid && authToken && fromNumber);
}

/** The clinic's outbound Twilio number, or null if not configured. */
export function getSmsFromNumber(): string | null {
  return getCreds().fromNumber || null;
}

/**
 * Normalise an Australian-style phone number to E.164 (+61...) so Twilio accepts it.
 * Leaves already-international (+) numbers untouched. Returns null if it can't form a
 * plausible number.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) return s;
  if (s.startsWith("0")) return "+61" + s.slice(1); // AU national → E.164
  if (s.startsWith("61")) return "+" + s;
  // Bare 9-digit AU mobile/landline without the leading 0
  if (s.length === 9) return "+61" + s;
  return "+" + s;
}

export interface SendSmsResult {
  sid: string;
  status: string;
}

/**
 * Send an SMS via Twilio. Throws if SMS is not configured or the API rejects the request.
 * Pass `statusCallback` (a public HTTPS URL) to receive delivery status updates.
 */
export async function sendSms(opts: {
  to: string;
  body: string;
  statusCallback?: string;
}): Promise<SendSmsResult> {
  const { accountSid, authToken, fromNumber } = getCreds();
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("SMS is not configured — Twilio credentials are missing.");
  }

  const to = normalisePhone(opts.to);
  if (!to) throw new Error("Invalid destination phone number.");

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", fromNumber);
  form.set("Body", opts.body);
  if (opts.statusCallback) form.set("StatusCallback", opts.statusCallback);

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    },
  );

  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const message = data?.message || `Twilio error (HTTP ${resp.status})`;
    throw new Error(message);
  }

  return { sid: data.sid, status: data.status || "queued" };
}

/**
 * Validate that an incoming webhook request genuinely came from Twilio.
 * Recomputes the HMAC-SHA1 signature Twilio sends in the `X-Twilio-Signature` header
 * from the full request URL + the POST params, and compares it (constant-time) to the
 * header. See https://www.twilio.com/docs/usage/webhooks/webhooks-security
 *
 * Returns false if credentials are missing or the signature does not match.
 */
export function validateTwilioSignature(opts: {
  signature: string | undefined;
  url: string;
  params: Record<string, any>;
}): boolean {
  const { authToken } = getCreds();
  if (!authToken || !opts.signature) return false;

  // Twilio builds the string by appending each POST param (sorted by key) as key+value.
  const sortedKeys = Object.keys(opts.params || {}).sort();
  let data = opts.url;
  for (const key of sortedKeys) {
    data += key + String(opts.params[key] ?? "");
  }

  const expected = crypto
    .createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");

  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(opts.signature);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
