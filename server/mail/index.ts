// Single entry point for the email/mailbox provider. The rest of the app imports
// from here and never reaches into a specific provider, so swapping in Gmail/IMAP
// later means adding a module and changing this one selector.

import type { MailProvider } from "./types";
import { outlookProvider, BACKFILL_WINDOW_DAYS_VALUE } from "./outlook";

export * from "./types";

// The active provider for this deployment. Currently Microsoft 365 (Outlook).
export const mailProvider: MailProvider = outlookProvider;

export const BACKFILL_WINDOW_DAYS = BACKFILL_WINDOW_DAYS_VALUE;

/** True when a mailbox is connected right now. Never throws. */
export async function isEmailConfigured(): Promise<boolean> {
  try {
    return await mailProvider.isConfigured();
  } catch {
    return false;
  }
}
