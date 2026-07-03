// Mailbox factory. The workspace has ONE mailbox (Microsoft 365 via the Replit
// Outlook connector) bound to exactly one clinic. The rest of the app asks
// "give me the provider for this clinic" and gets back an instance only when
// that clinic is the one the mailbox is bound to; every other clinic gets null.

import type { MailProvider } from "./types";
import { storage } from "../storage";
import { createOutlookProvider, isOutlookConnectorAuthorized } from "./outlook";

export * from "./types";
export { isOutlookConnectorAuthorized, createOutlookProvider } from "./outlook";

// How far back the first historical backfill reaches.
export const BACKFILL_WINDOW_DAYS = 365;

const OUTLOOK_PROVIDER_KEY = "outlook_connector";

/**
 * Build the mailbox provider for one clinic, or null when the workspace mailbox
 * isn't connected, isn't bound to this clinic, or the connector isn't authorized.
 */
export async function resolveClinicMailProvider(clinicId: number): Promise<MailProvider | null> {
  const connection = await storage.getMailboxConnection(clinicId);
  if (!connection || connection.status !== "connected" || connection.provider !== OUTLOOK_PROVIDER_KEY) {
    return null;
  }
  return createOutlookProvider(connection.connectedAddress ?? null);
}

/** True when THIS clinic owns the connected workspace mailbox. Never throws. */
export async function isEmailConfigured(clinicId: number): Promise<boolean> {
  try {
    const connection = await storage.getMailboxConnection(clinicId);
    return !!connection && connection.status === "connected" && connection.provider === OUTLOOK_PROVIDER_KEY;
  } catch {
    return false;
  }
}

/**
 * Which clinic (if any) currently owns the single workspace mailbox binding.
 * Used by the connect route to refuse a second clinic from claiming it.
 */
export async function getMailboxOwnerClinicId(): Promise<number | null> {
  const connection = await storage.getAnyMailboxConnection();
  return connection ? connection.clinicId : null;
}

export { OUTLOOK_PROVIDER_KEY };
