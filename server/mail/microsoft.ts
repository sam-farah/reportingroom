// Microsoft 365 mailbox adapter (Microsoft Graph) implementing the provider-neutral
// MailProvider contract, bound to ONE clinic's connection. The OAuth access token is
// this clinic's own token (refreshed transparently via oauth.getValidOAuthAccessToken)
// — NOT a shared connector token. Talks to Graph over plain fetch, no SDK.

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

const GRAPH = "https://graph.microsoft.com/v1.0";

const BACKFILL_TOP = 50;
const SINCE_TOP = 50;
const SINCE_MAX_PAGES = 10;

const MESSAGE_SELECT =
  "id,conversationId,subject,bodyPreview,from,toRecipients,ccRecipients,hasAttachments,isRead,sentDateTime,receivedDateTime";

function toRecipient(r: any): NormalizedRecipient | null {
  const address = r?.emailAddress?.address;
  if (!address) return null;
  return { name: r?.emailAddress?.name ?? null, address };
}
function toRecipients(arr: any): NormalizedRecipient[] {
  if (!Array.isArray(arr)) return [];
  return arr.map(toRecipient).filter((x): x is NormalizedRecipient => !!x);
}
function parseDate(v: any): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeMessage(raw: any, mailboxAddress: string | null): NormalizedMessage {
  const from = toRecipient(raw?.from) || toRecipient(raw?.sender);
  const mailbox = (mailboxAddress || "").toLowerCase();
  const fromAddr = (from?.address || "").toLowerCase();
  const direction: "inbound" | "outbound" =
    mailbox && fromAddr && fromAddr === mailbox ? "outbound" : "inbound";
  return {
    providerId: raw?.id,
    conversationId: raw?.conversationId || raw?.id,
    direction,
    from,
    to: toRecipients(raw?.toRecipients),
    cc: toRecipients(raw?.ccRecipients),
    subject: raw?.subject ?? null,
    snippet: raw?.bodyPreview ?? null,
    hasAttachments: !!raw?.hasAttachments,
    isRead: !!raw?.isRead,
    sentAt: parseDate(raw?.sentDateTime),
    receivedAt: parseDate(raw?.receivedDateTime),
  };
}

export function createMicrosoftProvider(ctx: MailContext): MailProvider {
  const mailboxAddress = ctx.connection.connectedAddress;

  async function graphFetch(pathOrUrl: string, init?: RequestInit): Promise<any> {
    const token = await getValidOAuthAccessToken(ctx);
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${GRAPH}${pathOrUrl}`;
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
      throw new Error(`Graph ${init?.method || "GET"} ${res.status}: ${detail}`.slice(0, 500));
    }
    if (res.status === 204) return null;
    return res.json();
  }

  return {
    name: "microsoft_oauth",

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
        const me = await graphFetch("/me?$select=mail,userPrincipalName");
        return me?.mail || me?.userPrincipalName || null;
      } catch {
        return null;
      }
    },

    async backfillPage({ cursor, windowStart }): Promise<NormalizedMessagePage> {
      const mailbox = mailboxAddress || (await this.getConnectedAddress());
      let url: string;
      if (cursor) {
        url = cursor;
      } else {
        const filter = encodeURIComponent(`receivedDateTime ge ${windowStart.toISOString()}`);
        url =
          `/me/messages?$select=${MESSAGE_SELECT}` +
          `&$top=${BACKFILL_TOP}&$orderby=receivedDateTime desc&$filter=${filter}`;
      }
      const data = await graphFetch(url);
      const messages = (data?.value || []).map((m: any) => normalizeMessage(m, mailbox));
      return { messages, nextLink: data?.["@odata.nextLink"] ?? null };
    },

    async fetchSince(since: Date): Promise<NormalizedMessage[]> {
      const mailbox = mailboxAddress || (await this.getConnectedAddress());
      const filter = encodeURIComponent(`receivedDateTime ge ${since.toISOString()}`);
      let url: string | null =
        `/me/messages?$select=${MESSAGE_SELECT}` +
        `&$top=${SINCE_TOP}&$orderby=receivedDateTime desc&$filter=${filter}`;
      const out: NormalizedMessage[] = [];
      let pages = 0;
      while (url && pages < SINCE_MAX_PAGES) {
        const data: any = await graphFetch(url);
        for (const m of data?.value || []) out.push(normalizeMessage(m, mailbox));
        url = data?.["@odata.nextLink"] ?? null;
        pages += 1;
      }
      return out;
    },

    async getMessageBody(providerMessageId: string): Promise<NormalizedBody> {
      const data = await graphFetch(
        `/me/messages/${encodeURIComponent(providerMessageId)}?$select=body,bodyPreview`,
      );
      const contentType = (data?.body?.contentType || "text").toLowerCase();
      const content = data?.body?.content ?? null;
      if (contentType === "html") {
        return { html: content, text: data?.bodyPreview ?? null, contentType: "html" };
      }
      return { html: null, text: content ?? data?.bodyPreview ?? null, contentType: "text" };
    },

    async listAttachments(providerMessageId: string): Promise<NormalizedAttachmentMeta[]> {
      const data = await graphFetch(
        `/me/messages/${encodeURIComponent(providerMessageId)}/attachments?$select=id,name,contentType,size,isInline`,
      );
      return (data?.value || []).map((a: any) => ({
        providerId: a?.id,
        name: a?.name ?? null,
        contentType: a?.contentType ?? null,
        size: typeof a?.size === "number" ? a.size : null,
        isInline: !!a?.isInline,
      }));
    },

    async getAttachmentBytes(
      providerMessageId: string,
      attachmentId: string,
    ): Promise<NormalizedAttachmentBytes | null> {
      const data = await graphFetch(
        `/me/messages/${encodeURIComponent(providerMessageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      );
      if (!data) return null;
      const name = data?.name || "attachment";
      const contentType = data?.contentType || "application/octet-stream";
      if (typeof data?.contentBytes === "string") {
        return { name, contentType, buffer: Buffer.from(data.contentBytes, "base64") };
      }
      const token = await getValidOAuthAccessToken(ctx).catch(() => null);
      if (!token) return null;
      const res = await fetch(
        `${GRAPH}/me/messages/${encodeURIComponent(providerMessageId)}/attachments/${encodeURIComponent(attachmentId)}/$value`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return null;
      const arrayBuf = await res.arrayBuffer();
      return { name, contentType, buffer: Buffer.from(arrayBuf) };
    },

    async sendNew(input: SendMessageInput): Promise<void> {
      const payload = {
        message: {
          subject: input.subject,
          body: { contentType: "HTML", content: input.html },
          toRecipients: input.to.map((a) => ({ emailAddress: { address: a } })),
          ccRecipients: (input.cc || []).map((a) => ({ emailAddress: { address: a } })),
        },
        saveToSentItems: true,
      };
      await graphFetch("/me/sendMail", { method: "POST", body: JSON.stringify(payload) });
    },

    async reply(input: ReplyInput): Promise<void> {
      const payload = { message: { body: { contentType: "HTML", content: input.html } } };
      await graphFetch(`/me/messages/${encodeURIComponent(input.providerMessageId)}/reply`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
  };
}
