// Mailbox sync engine + scheduler.
//
// For every clinic whose mailbox is connected, this mirrors the provider mailbox
// into our threads/messages tables. It runs a bounded historical backfill first
// (a window of recent history, paged across ticks so a huge mailbox can't run
// away), then switches to lightweight incremental polling. Message bodies and
// attachment bytes are NEVER pulled in bulk here — only metadata + a short preview
// are stored; full content is fetched on demand when a staff member opens a message.
//
// Safe to run when no mailbox is connected — it simply does nothing. Mirrors the
// lifecycle of server/sms-scheduler.ts.

import { storage } from "./storage";
import { resolveClinicMailProvider, BACKFILL_WINDOW_DAYS } from "./mail";
import type { NormalizedMessage } from "./mail";

const CHECK_INTERVAL_MS = 2 * 60 * 1000; // poll every 2 minutes
const MAX_BACKFILL_PAGES_PER_RUN = 10; // up to ~500 messages per tick while backfilling
const INCREMENTAL_OVERLAP_MS = 2 * 60 * 1000; // re-scan a small window to avoid edge gaps

// Per-clinic in-flight guard so a long tick (or a manual sync) never overlaps with
// another run for the same clinic.
const inFlight = new Set<number>();

function externalAddresses(m: NormalizedMessage): string[] {
  if (m.direction === "inbound") {
    return m.from?.address ? [m.from.address] : [];
  }
  return m.to.map(r => r.address).filter(Boolean);
}

// Ingest one batch of normalised messages for a clinic: upsert threads + messages,
// keep the thread summary current, and deterministically link a thread to a patient
// when there's exactly one email match (never overriding a manual link).
async function ingestMessages(clinicId: number, messages: NormalizedMessage[]): Promise<void> {
  // Process oldest-first so thread summaries settle on the newest message.
  const ordered = [...messages].sort((a, b) => {
    const at = (a.receivedAt || a.sentAt)?.getTime() || 0;
    const bt = (b.receivedAt || b.sentAt)?.getTime() || 0;
    return at - bt;
  });

  for (const m of ordered) {
    if (!m.providerId || !m.conversationId) continue;

    // Ensure the thread exists (seed its subject on first sight).
    const thread = await storage.upsertEmailThread(clinicId, m.conversationId, {
      subject: m.subject ?? null,
    });

    await storage.upsertEmailMessage({
      clinicId,
      threadId: thread.id,
      graphId: m.providerId,
      conversationId: m.conversationId,
      direction: m.direction,
      fromAddress: m.from?.address ?? null,
      fromName: m.from?.name ?? null,
      toRecipients: JSON.stringify(m.to),
      ccRecipients: JSON.stringify(m.cc),
      subject: m.subject ?? null,
      snippet: m.snippet ?? null,
      bodyHtml: null,
      hasAttachments: m.hasAttachments,
      isRead: m.direction === "outbound" ? true : m.isRead,
      sentAt: m.sentAt ?? null,
      receivedAt: m.receivedAt ?? null,
    } as any);

    await storage.recomputeEmailThread(clinicId, thread.id);

    // Deterministic patient linking: only when the thread isn't already linked and
    // wasn't manually managed, and exactly one patient matches an email address.
    const current = await storage.getEmailThreadById(clinicId, thread.id);
    if (current && current.patientId == null && current.patientLinkSource !== "manual") {
      const ids = new Set<number>();
      for (const addr of externalAddresses(m)) {
        const p = await storage.findPatientByEmail(clinicId, addr);
        if (p) ids.add(p.id);
      }
      if (ids.size === 1) {
        await storage.linkEmailThreadToPatient(clinicId, thread.id, Array.from(ids)[0], "auto");
      }
    }
  }
}

// Run a single sync pass for one clinic. Returns the number of messages ingested.
async function syncMailbox(clinicId: number): Promise<number> {
  if (inFlight.has(clinicId)) return 0;
  inFlight.add(clinicId);
  let ingested = 0;
  try {
    // The clinic's connection record (resolved into a provider) is the gate — a
    // non-null provider means a mailbox is connected for this clinic.
    const provider = await resolveClinicMailProvider(clinicId);
    if (!provider) return 0;

    // Cursors/backfill progress live in mailbox_sync_state (one row per clinic).
    let state = await storage.getMailboxSyncState(clinicId);
    if (!state) state = await storage.upsertMailboxSyncState(clinicId, {});

    await storage.upsertMailboxSyncState(clinicId, { syncStatus: "syncing", lastError: null });

    if (!state.backfillCompleted) {
      // Historical backfill — page through a bounded window across ticks.
      const windowStart = new Date(Date.now() - BACKFILL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      let cursor: string | null | undefined = state.backfillNextLink;
      let pages = 0;
      let done = false;
      while (pages < MAX_BACKFILL_PAGES_PER_RUN) {
        const page = await provider.backfillPage({ cursor, windowStart });
        await ingestMessages(clinicId, page.messages);
        ingested += page.messages.length;
        pages += 1;
        cursor = page.nextLink;
        if (!cursor) { done = true; break; }
      }
      await storage.upsertMailboxSyncState(clinicId, {
        backfillNextLink: cursor ?? null,
        backfillCompleted: done,
        ...(done ? { lastSyncedAt: new Date() } : {}),
      });
    } else {
      // Incremental — fetch anything at/after the last sync (with a small overlap).
      const since = state.lastSyncedAt
        ? new Date(new Date(state.lastSyncedAt).getTime() - INCREMENTAL_OVERLAP_MS)
        : new Date(Date.now() - BACKFILL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const messages = await provider.fetchSince(since);
      await ingestMessages(clinicId, messages);
      ingested += messages.length;
      await storage.upsertMailboxSyncState(clinicId, { lastSyncedAt: new Date() });
    }

    await storage.upsertMailboxSyncState(clinicId, { syncStatus: "idle" });
  } catch (err: any) {
    console.error(`[email-sync] clinic ${clinicId} sync failed:`, err?.message || err);
    await storage.upsertMailboxSyncState(clinicId, {
      syncStatus: "error",
      lastError: (err?.message || "Sync failed").slice(0, 500),
    }).catch(() => {});
  } finally {
    inFlight.delete(clinicId);
  }
  return ingested;
}

async function runOnce(): Promise<void> {
  // Every clinic with a connected mailbox (any provider) gets a sync pass.
  const connections = await storage.listConnectedMailboxConnections();
  for (const conn of connections) {
    await syncMailbox(conn.clinicId).catch(err =>
      console.error(`[email-sync] clinic ${conn.clinicId} error:`, err),
    );
  }
}

/** Trigger an immediate sync for one clinic (used by the manual "sync now" route). */
export async function syncMailboxNow(clinicId: number): Promise<number> {
  return syncMailbox(clinicId);
}

let started = false;

/** Start the recurring mailbox sync scheduler. Safe to call once at boot. */
export function startEmailSyncScheduler(): void {
  if (started) return;
  started = true;

  const tick = () => {
    runOnce().catch(err => console.error("[email-sync] tick error:", err));
  };

  // First run shortly after boot, then on the interval.
  setTimeout(tick, 20 * 1000);
  setInterval(tick, CHECK_INTERVAL_MS);
  console.log("[email-sync] started");
}
