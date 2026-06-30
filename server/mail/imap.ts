// Generic IMAP/SMTP mailbox adapter implementing the provider-neutral MailProvider
// contract, bound to ONE clinic's connection. Reads via IMAP (imapflow), sends via
// SMTP (nodemailer), and parses message bodies/attachments with mailparser. The
// clinic's credentials (host/port/username/app-password) come from ctx.connection,
// already decrypted by the storage layer — this module never touches storage.

import { ImapFlow } from "imapflow";
import type {
  FetchMessageObject,
  ListResponse,
  MessageAddressObject,
  MessageEnvelopeObject,
  MessageStructureObject,
} from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import type { ParsedMail } from "mailparser";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
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

const BACKFILL_TOP = 50;
const SINCE_MAX_PER_FOLDER = 100;

// providerId encodes the IMAP folder + UID so later on-demand fetches know where
// to look (UIDs are only unique within a single mailbox/folder).
function parseProviderId(id: string): { folder: string; uid: number } {
  const idx = id.indexOf("::");
  if (idx === -1) return { folder: "INBOX", uid: Number(id) || 0 };
  return { folder: id.slice(0, idx), uid: Number(id.slice(idx + 2)) || 0 };
}

function stripAngles(s: string): string {
  return s.replace(/^</, "").replace(/>$/, "").trim();
}

// Pull a single (possibly folded) header value out of the raw header Buffer that
// imapflow returns when fetching specific header lines.
function parseHeaderLine(headers: Buffer | undefined, name: string): string | null {
  if (!headers) return null;
  const text = headers.toString("utf8");
  const lines = text.split(/\r?\n/);
  const prefix = name.toLowerCase() + ":";
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().startsWith(prefix)) {
      let value = lines[i].slice(lines[i].indexOf(":") + 1).trim();
      let j = i + 1;
      while (j < lines.length && /^[ \t]/.test(lines[j])) {
        value += " " + lines[j].trim();
        j++;
      }
      return value || null;
    }
  }
  return null;
}

function toRecipients(arr: MessageAddressObject[] | undefined): NormalizedRecipient[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((a) => !!a.address)
    .map((a) => ({ name: a.name || null, address: a.address as string }));
}

// Recursively walk the BODYSTRUCTURE looking for any node that smells like a real
// attachment (explicit disposition, or a filename/name parameter).
function walkHasAttachments(node: MessageStructureObject | undefined): boolean {
  if (!node) return false;
  if (
    node.disposition === "attachment" ||
    node.dispositionParameters?.filename ||
    node.parameters?.name
  ) {
    return true;
  }
  if (Array.isArray(node.childNodes)) {
    for (const child of node.childNodes) {
      if (walkHasAttachments(child)) return true;
    }
  }
  return false;
}

export function createImapProvider(ctx: MailContext): MailProvider {
  const conn = ctx.connection;
  const imapHost = conn.imapHost;
  const imapPort = conn.imapPort;
  const imapSecure = conn.imapSecure;
  const smtpHost = conn.smtpHost;
  const smtpPort = conn.smtpPort;
  const smtpSecure = conn.smtpSecure;
  const username = conn.username;
  const password = conn.password;
  const mailbox = conn.connectedAddress || conn.username;

  async function getImapClient(): Promise<ImapFlow> {
    const c = new ImapFlow({
      host: imapHost || "",
      port: imapPort || 993,
      secure: imapSecure,
      auth: { user: username || "", pass: password || "" },
      logger: false,
    });
    await c.connect();
    return c;
  }

  async function detectSentFolder(client: ImapFlow): Promise<string> {
    try {
      const list: ListResponse[] = await client.list();
      const bySpecial = list.find((e) => e.specialUse === "\\Sent");
      if (bySpecial) return bySpecial.path;
      const byName = list.find((e) => /sent/i.test(e.path));
      if (byName) return byName.path;
    } catch {
      // fall through to default
    }
    return "Sent";
  }

  function buildScanFolders(sentFolder: string): string[] {
    return sentFolder === "INBOX" ? ["INBOX"] : ["INBOX", sentFolder];
  }

  function normalizeEnvelope(args: {
    envelope: MessageEnvelopeObject | undefined;
    flags: Set<string> | undefined;
    internalDate: Date | string | undefined;
    bodyStructure: MessageStructureObject | undefined;
    folder: string;
    uid: number;
    sentFolder: string;
    references: string | null;
  }): NormalizedMessage {
    const { envelope, flags, internalDate, bodyStructure, folder, uid, sentFolder, references } =
      args;
    const providerId = `${folder}::${uid}`;

    const fromAddr = envelope?.from?.[0];
    const from: NormalizedRecipient | null =
      fromAddr && fromAddr.address
        ? { name: fromAddr.name || null, address: fromAddr.address }
        : null;

    const mailboxLc = (mailbox || "").toLowerCase();
    const fromLc = (from?.address || "").toLowerCase();
    const direction: "inbound" | "outbound" =
      folder === sentFolder || (!!fromLc && !!mailboxLc && fromLc === mailboxLc)
        ? "outbound"
        : "inbound";

    const sentAt = envelope?.date ? new Date(envelope.date) : null;
    const receivedAt = internalDate ? new Date(internalDate) : sentAt;

    let conversationId: string;
    const firstRef = references ? references.split(/\s+/).filter(Boolean)[0] : null;
    if (firstRef) {
      conversationId = stripAngles(firstRef);
    } else if (envelope?.inReplyTo) {
      conversationId = stripAngles(envelope.inReplyTo);
    } else if (envelope?.messageId) {
      conversationId = stripAngles(envelope.messageId);
    } else {
      conversationId = providerId;
    }

    return {
      providerId,
      conversationId,
      direction,
      from,
      to: toRecipients(envelope?.to),
      cc: toRecipients(envelope?.cc),
      subject: envelope?.subject ?? null,
      snippet: null,
      hasAttachments: walkHasAttachments(bodyStructure),
      isRead: Array.from(flags || []).includes("\\Seen"),
      sentAt,
      receivedAt,
    };
  }

  async function fetchParsedMessage(providerMessageId: string): Promise<ParsedMail | null> {
    const { folder, uid } = parseProviderId(providerMessageId);
    const client = await getImapClient();
    try {
      const lock = await client.getMailboxLock(folder);
      try {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) return null;
        return await simpleParser(msg.source);
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }

  async function buildRawMessage(options: Record<string, unknown>): Promise<Buffer> {
    return new MailComposer(options).compile().build();
  }

  function createSmtpTransport() {
    return nodemailer.createTransport({
      host: smtpHost || "",
      port: smtpPort || 465,
      secure: smtpSecure,
      auth: { user: username || "", pass: password || "" },
    });
  }

  async function appendToSent(raw: Buffer): Promise<void> {
    let client: ImapFlow | null = null;
    try {
      client = await getImapClient();
      const sentFolder = await detectSentFolder(client);
      await client.append(sentFolder, raw, ["\\Seen"]);
    } catch {
      // best-effort: many servers auto-save sent mail, so ignore failures here
    } finally {
      if (client) {
        try {
          await client.logout();
        } catch {
          // ignore
        }
      }
    }
  }

  return {
    name: "imap_smtp",

    async isConfigured(): Promise<boolean> {
      return !!(imapHost && username && password);
    },

    async getConnectedAddress(): Promise<string | null> {
      return mailbox || null;
    },

    async backfillPage({ cursor, windowStart }): Promise<NormalizedMessagePage> {
      const client = await getImapClient();
      try {
        const sentFolder = await detectSentFolder(client);
        const folders = buildScanFolders(sentFolder);

        const state: { stage: number; lastUid: number } = cursor
          ? JSON.parse(cursor)
          : { stage: 0, lastUid: 0 };

        if (state.stage >= folders.length) {
          return { messages: [], nextLink: null };
        }

        const folder = folders[state.stage];
        const messages: NormalizedMessage[] = [];
        let maxUid = state.lastUid;
        let fetchedCount = 0;

        const lock = await client.getMailboxLock(folder);
        try {
          const searchRes = await client.search(
            { since: windowStart, uid: `${state.lastUid + 1}:*` },
            { uid: true },
          );
          const uids = (searchRes || []).slice().sort((a, b) => a - b);
          const uidList = uids.slice(0, BACKFILL_TOP);
          fetchedCount = uidList.length;

          if (uidList.length > 0) {
            for await (const msg of client.fetch(
              uidList,
              {
                uid: true,
                envelope: true,
                flags: true,
                internalDate: true,
                bodyStructure: true,
                headers: ["references", "in-reply-to"],
              },
              { uid: true },
            )) {
              const references = parseHeaderLine(msg.headers, "references");
              messages.push(
                normalizeEnvelope({
                  envelope: msg.envelope,
                  flags: msg.flags,
                  internalDate: msg.internalDate,
                  bodyStructure: msg.bodyStructure,
                  folder,
                  uid: msg.uid,
                  sentFolder,
                  references,
                }),
              );
              if (msg.uid > maxUid) maxUid = msg.uid;
            }
          }
        } finally {
          lock.release();
        }

        let nextState: { stage: number; lastUid: number } | null;
        if (fetchedCount < BACKFILL_TOP) {
          nextState =
            state.stage + 1 < folders.length ? { stage: state.stage + 1, lastUid: 0 } : null;
        } else {
          nextState = { stage: state.stage, lastUid: maxUid };
        }

        return { messages, nextLink: nextState ? JSON.stringify(nextState) : null };
      } finally {
        await client.logout();
      }
    },

    async fetchSince(since: Date): Promise<NormalizedMessage[]> {
      const client = await getImapClient();
      const out: NormalizedMessage[] = [];
      try {
        const sentFolder = await detectSentFolder(client);
        const folders = buildScanFolders(sentFolder);

        for (const folder of folders) {
          const lock = await client.getMailboxLock(folder);
          try {
            const searchRes = await client.search({ since }, { uid: true });
            const uids = (searchRes || []).slice().sort((a, b) => a - b);
            const recent = uids.slice(-SINCE_MAX_PER_FOLDER);
            if (recent.length > 0) {
              for await (const msg of client.fetch(
                recent,
                {
                  uid: true,
                  envelope: true,
                  flags: true,
                  internalDate: true,
                  bodyStructure: true,
                  headers: ["references", "in-reply-to"],
                },
                { uid: true },
              )) {
                const references = parseHeaderLine(msg.headers, "references");
                out.push(
                  normalizeEnvelope({
                    envelope: msg.envelope,
                    flags: msg.flags,
                    internalDate: msg.internalDate,
                    bodyStructure: msg.bodyStructure,
                    folder,
                    uid: msg.uid,
                    sentFolder,
                    references,
                  }),
                );
              }
            }
          } finally {
            lock.release();
          }
        }
      } finally {
        await client.logout();
      }
      return out;
    },

    async getMessageBody(providerMessageId: string): Promise<NormalizedBody> {
      const parsed = await fetchParsedMessage(providerMessageId);
      if (!parsed) return { html: null, text: null, contentType: "text" };
      return {
        html: parsed.html || null,
        text: parsed.text || null,
        contentType: parsed.html ? "html" : "text",
      };
    },

    async listAttachments(providerMessageId: string): Promise<NormalizedAttachmentMeta[]> {
      const parsed = await fetchParsedMessage(providerMessageId);
      if (!parsed) return [];
      return (parsed.attachments || []).map((a, i) => ({
        providerId: String(i),
        name: a.filename || null,
        contentType: a.contentType || null,
        size: a.size ?? null,
        isInline: a.contentDisposition === "inline",
      }));
    },

    async getAttachmentBytes(
      providerMessageId: string,
      attachmentId: string,
    ): Promise<NormalizedAttachmentBytes | null> {
      const parsed = await fetchParsedMessage(providerMessageId);
      if (!parsed) return null;
      const a = parsed.attachments?.[Number(attachmentId)];
      if (!a) return null;
      return {
        name: a.filename || "attachment",
        contentType: a.contentType || "application/octet-stream",
        buffer: a.content as Buffer,
      };
    },

    async sendNew(input: SendMessageInput): Promise<void> {
      const transport = createSmtpTransport();
      const raw = await buildRawMessage({
        from: mailbox || username || undefined,
        to: input.to,
        cc: input.cc,
        subject: input.subject,
        html: input.html,
      });
      await transport.sendMail({
        envelope: { from: mailbox || username || "", to: [...input.to, ...(input.cc || [])] },
        raw,
      });
      await appendToSent(raw);
    },

    async reply(input: ReplyInput): Promise<void> {
      const { folder, uid } = parseProviderId(input.providerMessageId);

      let originalFrom = "";
      let originalSubject = "";
      let originalMessageId = "";
      let originalReferences = "";

      const client = await getImapClient();
      try {
        const lock = await client.getMailboxLock(folder);
        try {
          const msg: FetchMessageObject | false = await client.fetchOne(
            String(uid),
            { envelope: true, headers: ["references", "in-reply-to"] },
            { uid: true },
          );
          if (msg) {
            if (msg.envelope) {
              originalFrom = msg.envelope.from?.[0]?.address || "";
              originalSubject = msg.envelope.subject || "";
              originalMessageId = msg.envelope.messageId || "";
            }
            originalReferences = parseHeaderLine(msg.headers, "references") || "";
          }
        } finally {
          lock.release();
        }
      } finally {
        await client.logout();
      }

      const trimmedSubject = originalSubject.trim();
      const subject = /^re:/i.test(trimmedSubject) ? originalSubject : `Re: ${originalSubject}`;
      const references = [originalReferences, originalMessageId].filter(Boolean).join(" ");

      const transport = createSmtpTransport();
      const raw = await buildRawMessage({
        from: mailbox || username || undefined,
        to: [originalFrom].filter(Boolean),
        subject,
        html: input.html,
        inReplyTo: originalMessageId || undefined,
        references: references || undefined,
      });
      await transport.sendMail({
        envelope: { from: mailbox || username || "", to: [originalFrom].filter(Boolean) },
        raw,
      });
      await appendToSent(raw);
    },
  };
}

export async function testImapSmtpConnection(opts: {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  password: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const c = new ImapFlow({
      host: opts.imapHost,
      port: opts.imapPort,
      secure: opts.imapSecure,
      auth: { user: opts.username, pass: opts.password },
      logger: false,
    });
    await c.connect();
    await c.logout();

    const t = nodemailer.createTransport({
      host: opts.smtpHost,
      port: opts.smtpPort,
      secure: opts.smtpSecure,
      auth: { user: opts.username, pass: opts.password },
    });
    await t.verify();

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: (e?.message || "Connection failed").slice(0, 300) };
  }
}
