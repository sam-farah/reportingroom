// Provider-neutral mailbox interface. The app talks to a clinic mailbox only
// through this contract so additional providers (Gmail, generic IMAP) can be
// added later without touching the sync engine, storage, routes, or UI.

import type { MailboxConnection } from "@shared/schema";

// New OAuth tokens to persist after a refresh. The factory wires saveTokens to
// storage.upsertMailboxConnection so providers never import storage directly.
export interface ProviderTokenUpdate {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken?: string;
}

// Everything a per-clinic provider instance needs: the clinic's connection row
// (with secrets ALREADY decrypted by the storage layer) plus a callback to
// persist refreshed OAuth tokens.
export interface MailContext {
  clinicId: number;
  connection: MailboxConnection;
  saveTokens: (u: ProviderTokenUpdate) => Promise<void>;
}

export interface NormalizedRecipient {
  name?: string | null;
  address: string;
}

export interface NormalizedMessage {
  providerId: string; // provider message id (Graph message.id)
  conversationId: string; // provider thread key
  direction: "inbound" | "outbound";
  from: NormalizedRecipient | null;
  to: NormalizedRecipient[];
  cc: NormalizedRecipient[];
  subject: string | null;
  snippet: string | null; // short preview (no full body)
  hasAttachments: boolean;
  isRead: boolean;
  sentAt: Date | null;
  receivedAt: Date | null;
}

export interface NormalizedMessagePage {
  messages: NormalizedMessage[];
  // Paging cursor for the next page of a backfill (null/undefined when done).
  nextLink?: string | null;
}

export interface NormalizedBody {
  html: string | null;
  text: string | null;
  contentType: string; // "html" | "text"
}

export interface NormalizedAttachmentMeta {
  providerId: string;
  name: string | null;
  contentType: string | null;
  size: number | null;
  isInline: boolean;
}

export interface NormalizedAttachmentBytes {
  name: string;
  contentType: string;
  buffer: Buffer;
}

export interface SendMessageInput {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
}

export interface ReplyInput {
  providerMessageId: string;
  html: string;
}

export interface MailProvider {
  /** Stable provider key stored on rows (e.g. "outlook"). */
  readonly name: string;

  /** True when credentials/connection are available right now. Never throws. */
  isConfigured(): Promise<boolean>;

  /** The connected mailbox address (e.g. reception@clinic.com), or null. */
  getConnectedAddress(): Promise<string | null>;

  /**
   * One page of the historical backfill. Pass the previous page's `nextLink`
   * to continue; omit to start. `windowStart` bounds how far back to go.
   */
  backfillPage(opts: { cursor?: string | null; windowStart: Date }): Promise<NormalizedMessagePage>;

  /** Messages received at/after `since` (newest first), bounded internally. */
  fetchSince(since: Date): Promise<NormalizedMessage[]>;

  /** Full body for one message, fetched on demand. */
  getMessageBody(providerMessageId: string): Promise<NormalizedBody>;

  /** Attachment metadata for one message (no bytes). */
  listAttachments(providerMessageId: string): Promise<NormalizedAttachmentMeta[]>;

  /** Attachment bytes, fetched on demand. Null if not found. */
  getAttachmentBytes(providerMessageId: string, attachmentId: string): Promise<NormalizedAttachmentBytes | null>;

  /** Send a brand-new message (starts a new thread). */
  sendNew(input: SendMessageInput): Promise<void>;

  /** Reply to an existing message, preserving the provider thread. */
  reply(input: ReplyInput): Promise<void>;
}
