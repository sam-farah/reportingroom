// Gmail mailbox adapter (Gmail REST API) implementing the provider-neutral
// MailProvider contract, bound to ONE clinic's connection. The OAuth access token is
// this clinic's own token (refreshed transparently via oauth.getValidOAuthAccessToken)
// — NOT a shared connector token. Talks to Gmail over plain fetch, no SDK. Outgoing
// MIME is assembled with nodemailer's MailComposer and submitted as a base64url raw.

import type {
  MailContext,
  MailProvider,
  NormalizedAttachmentBytes,
  NormalizedAttachmentMeta,
  NormalizedBody,
  NormalizedMessage,
  NormalizedMessagePage,
  NormalizedRecipient,
  ReplyInput,
  SendMessageInput,
} from "./types";
import { getValidOAuthAccessToken } from "./oauth";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import type Mail from "nodemailer/lib/mailer";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

const BACKFILL_TOP = 25;
const SINCE_TOP = 50;
const SINCE_MAX_PAGES = 10;

interface GmailHeader {
  name?: string;
  value?: string;
}

// Case-insensitive lookup over a Gmail payload's headers ([{name,value}]).
function headerVal(headers: GmailHeader[] | undefined | null, name: string): string | null {
  if (!Array.isArray(headers)) return null;
  const lower = name.toLowerCase();
  for (const h of headers) {
    if ((h?.name || "").toLowerCase() === lower) return h?.value ?? null;
  }
  return null;
}

// Parse a raw address-list header value ("Name <a@b.com>, c@d.com") into recipients.
function parseAddressList(value: string | null): NormalizedRecipient[] {
  if (!value) return [];
  return value
    .split(",")
    .map((tokenRaw): NormalizedRecipient | null => {
      const token = tokenRaw.trim();
      if (!token) return null;
      const m = token.match(/<([^>]+)>/);
      if (m) {
        const address = m[1].trim();
        let name = token.slice(0, token.indexOf("<")).trim();
        name = name.replace(/^"(.*)"$/, "$1").trim();
        return { name: name || null, address };
      }
      return { name: null, address: token };
    })
    .filter((x): x is NormalizedRecipient => !!x && !!x.address);
}

// Decode Gmail's base64url-encoded body data to a UTF-8 string.
function decodeBase64UrlText(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

// Recursively test whether any MIME part carries a non-empty filename (attachment).
function partHasAttachment(part: any): boolean {
  if (!part) return false;
  if (typeof part.filename === "string" && part.filename.length > 0) return true;
  if (Array.isArray(part.parts)) return part.parts.some(partHasAttachment);
  return false;
}

function normalizeMeta(msg: any): NormalizedMessage {
  const headers: GmailHeader[] | undefined = msg?.payload?.headers;
  const from = parseAddressList(headerVal(headers, "From"))[0] || null;
  const labelIds: string[] = Array.isArray(msg?.labelIds) ? msg.labelIds : [];
  const direction: "inbound" | "outbound" = labelIds.includes("SENT") ? "outbound" : "inbound";
  const ts =
    msg?.internalDate != null && msg.internalDate !== ""
      ? new Date(Number(msg.internalDate))
      : null;
  return {
    providerId: msg?.id,
    conversationId: msg?.threadId || msg?.id,
    direction,
    from,
    to: parseAddressList(headerVal(headers, "To")),
    cc: parseAddressList(headerVal(headers, "Cc")),
    subject: headerVal(headers, "Subject"),
    snippet: msg?.snippet ?? null,
    hasAttachments: partHasAttachment(msg?.payload),
    isRead: !labelIds.includes("UNREAD"),
    sentAt: ts,
    receivedAt: ts,
  };
}

// base64url-encode a MIME buffer for the Gmail messages.send `raw` field.
function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Compile a MailComposer message and resolve its base64url raw representation.
function buildRawMessage(options: Mail.Options): Promise<string> {
  return new Promise((resolve, reject) => {
    new MailComposer(options).compile().build((err, message) => {
      if (err) return reject(err);
      resolve(toBase64Url(message));
    });
  });
}

export function createGoogleProvider(ctx: MailContext): MailProvider {
  const mailboxAddress = ctx.connection.connectedAddress;

  async function gmailFetch(path: string, init?: RequestInit): Promise<any> {
    const token = await getValidOAuthAccessToken(ctx);
    const url = path.startsWith("http") ? path : `${GMAIL}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) {
      let detail = "";
      try {
        const body: any = await res.json();
        detail = body?.error?.message || JSON.stringify(body);
      } catch {
        detail = await res.text().catch(() => "");
      }
      throw new Error(`Gmail ${init?.method || "GET"} ${res.status}: ${detail}`.slice(0, 500));
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function listMessageIds(q: string, pageToken: string | undefined, max: number): Promise<any> {
    const params = new URLSearchParams();
    params.set("q", q);
    params.set("maxResults", String(max));
    if (pageToken) params.set("pageToken", pageToken);
    return gmailFetch(`/messages?${params.toString()}`);
  }

  async function getMessageMeta(id: string): Promise<any> {
    return gmailFetch(
      `/messages/${encodeURIComponent(id)}?format=metadata` +
        "&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc" +
        "&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID" +
        "&metadataHeaders=References",
    );
  }

  return {
    name: "google_oauth",

    async isConfigured(): Promise<boolean> {
      try {
        await getValidOAuthAccessToken(ctx);
        return true;
      } catch {
        return false;
      }
    },

    async getConnectedAddress(): Promise<string | null> {
      if (mailboxAddress) return mailboxAddress;
      try {
        const profile = await gmailFetch("/profile");
        return profile?.emailAddress || null;
      } catch {
        return null;
      }
    },

    async backfillPage({ cursor, windowStart }): Promise<NormalizedMessagePage> {
      const yyyy = windowStart.getFullYear();
      const mm = String(windowStart.getMonth() + 1).padStart(2, "0");
      const dd = String(windowStart.getDate()).padStart(2, "0");
      const q = `after:${yyyy}/${mm}/${dd} -in:chats`;
      const data = await listMessageIds(q, cursor || undefined, BACKFILL_TOP);
      const ids: any[] = data?.messages || [];
      const messages: NormalizedMessage[] = [];
      for (const item of ids) {
        try {
          const meta = await getMessageMeta(item?.id);
          messages.push(normalizeMeta(meta));
        } catch {
          // Skip messages that fail to fetch/normalize; the page still advances.
        }
      }
      return { messages, nextLink: data?.nextPageToken ?? null };
    },

    async fetchSince(since: Date): Promise<NormalizedMessage[]> {
      const q = `after:${Math.floor(since.getTime() / 1000)} -in:chats`;
      const out: NormalizedMessage[] = [];
      let pageToken: string | undefined = undefined;
      let pages = 0;
      do {
        const data: any = await listMessageIds(q, pageToken, SINCE_TOP);
        for (const item of data?.messages || []) {
          try {
            out.push(normalizeMeta(await getMessageMeta(item?.id)));
          } catch {
            // Skip messages that fail to fetch/normalize.
          }
        }
        pageToken = data?.nextPageToken || undefined;
        pages += 1;
      } while (pageToken && pages < SINCE_MAX_PAGES);
      return out;
    },

    async getMessageBody(providerMessageId: string): Promise<NormalizedBody> {
      const data = await gmailFetch(`/messages/${encodeURIComponent(providerMessageId)}?format=full`);
      let html: string | null = null;
      let text: string | null = null;
      const walk = (part: any): void => {
        if (!part) return;
        const mime = (part.mimeType || "").toLowerCase();
        const body: string | undefined = part.body?.data;
        if (mime === "text/html" && html === null && body) html = decodeBase64UrlText(body);
        if (mime === "text/plain" && text === null && body) text = decodeBase64UrlText(body);
        if (Array.isArray(part.parts)) part.parts.forEach(walk);
      };
      walk(data?.payload);
      return { html, text, contentType: html ? "html" : "text" };
    },

    async listAttachments(providerMessageId: string): Promise<NormalizedAttachmentMeta[]> {
      const data = await gmailFetch(`/messages/${encodeURIComponent(providerMessageId)}?format=full`);
      const out: NormalizedAttachmentMeta[] = [];
      const walk = (part: any): void => {
        if (!part) return;
        if (part.filename && part.body?.attachmentId) {
          const disposition = (headerVal(part.headers, "Content-Disposition") || "").toLowerCase();
          out.push({
            providerId: part.body.attachmentId,
            name: part.filename || null,
            contentType: part.mimeType || null,
            size: part.body?.size ?? null,
            isInline: disposition.startsWith("inline"),
          });
        }
        if (Array.isArray(part.parts)) part.parts.forEach(walk);
      };
      walk(data?.payload);
      return out;
    },

    async getAttachmentBytes(
      providerMessageId: string,
      attachmentId: string,
    ): Promise<NormalizedAttachmentBytes | null> {
      const data = await gmailFetch(`/messages/${encodeURIComponent(providerMessageId)}?format=full`);
      let found: any = null;
      const walk = (part: any): void => {
        if (!part || found) return;
        if (part.body?.attachmentId === attachmentId) {
          found = part;
          return;
        }
        if (Array.isArray(part.parts)) part.parts.forEach(walk);
      };
      walk(data?.payload);
      if (!found) return null;
      const att = await gmailFetch(
        `/messages/${encodeURIComponent(providerMessageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      );
      if (!att?.data) return null;
      const buffer = Buffer.from(att.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      return {
        name: found.filename || "attachment",
        contentType: found.mimeType || "application/octet-stream",
        buffer,
      };
    },

    async sendNew(input: SendMessageInput): Promise<void> {
      const raw = await buildRawMessage({
        from: mailboxAddress || undefined,
        to: input.to,
        cc: input.cc,
        subject: input.subject,
        html: input.html,
      });
      await gmailFetch("/messages/send", { method: "POST", body: JSON.stringify({ raw }) });
    },

    async reply(input: ReplyInput): Promise<void> {
      const original = await getMessageMeta(input.providerMessageId);
      const headers: GmailHeader[] | undefined = original?.payload?.headers;
      const origFrom = headerVal(headers, "From");
      const origSubject = headerVal(headers, "Subject") || "";
      const origMessageId = headerVal(headers, "Message-ID");
      const origReferences = headerVal(headers, "References");
      const subject = /^re:/i.test(origSubject.trim()) ? origSubject : `Re: ${origSubject}`;
      const references = [origReferences, origMessageId].filter(Boolean).join(" ");
      const raw = await buildRawMessage({
        from: mailboxAddress || undefined,
        to: origFrom || undefined,
        subject,
        html: input.html,
        inReplyTo: origMessageId || undefined,
        references: references || undefined,
      });
      await gmailFetch("/messages/send", {
        method: "POST",
        body: JSON.stringify({ raw, threadId: original?.threadId }),
      });
    },
  };
}
