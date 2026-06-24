// Per-clinic mailbox factory. The rest of the app asks for "the provider for this
// clinic" and gets back an instance bound to that clinic's stored connection
// (Microsoft 365 OAuth, Google OAuth, or generic IMAP/SMTP), or null when the
// clinic hasn't connected a mailbox. There is no global/shared mailbox any more.

import type { MailProvider, MailContext } from "./types";
import { storage } from "../storage";
import { createMicrosoftProvider } from "./microsoft";
import { createGoogleProvider } from "./google";
import { createImapProvider } from "./imap";

export * from "./types";
export {
  isOAuthServerConfigured,
  signState,
  verifyState,
  buildAuthUrl,
  exchangeCode,
  fetchOAuthIdentity,
  type OAuthProviderKey,
  type OAuthState,
} from "./oauth";

// How far back the first historical backfill reaches.
export const BACKFILL_WINDOW_DAYS = 365;

/**
 * Build a mailbox provider for one clinic from its stored connection, or null when
 * the clinic has no connected mailbox. Secrets are decrypted in the storage layer;
 * the saveTokens callback persists refreshed OAuth tokens back to that clinic's row.
 */
export async function resolveClinicMailProvider(clinicId: number): Promise<MailProvider | null> {
  const connection = await storage.getMailboxConnection(clinicId);
  if (!connection || connection.status !== "connected") return null;

  const ctx: MailContext = {
    clinicId,
    connection,
    saveTokens: async (u) => {
      await storage.upsertMailboxConnection(clinicId, {
        accessToken: u.accessToken,
        accessTokenExpiresAt: u.accessTokenExpiresAt,
        ...(u.refreshToken ? { refreshToken: u.refreshToken } : {}),
      });
    },
  };

  switch (connection.provider) {
    case "microsoft_oauth":
      return createMicrosoftProvider(ctx);
    case "google_oauth":
      return createGoogleProvider(ctx);
    case "imap_smtp":
      return createImapProvider(ctx);
    default:
      return null;
  }
}

/** True when THIS clinic has a connected mailbox. Never throws. */
export async function isEmailConfigured(clinicId: number): Promise<boolean> {
  try {
    const connection = await storage.getMailboxConnection(clinicId);
    return !!connection && connection.status === "connected";
  } catch {
    return false;
  }
}
