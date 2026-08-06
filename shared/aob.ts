/**
 * Which Assignment of Benefit form represents a visit.
 *
 * A visit can accumulate more than one form: staff can regenerate one to
 * correct a mistake, and older reports created an extra empty form when the
 * sonographer marked the study complete. Server and client must agree on which
 * of them is the current one, or the appointment screen shows a different form
 * from the one the server acts on — which is how a signed form ended up hidden
 * behind an empty placeholder.
 */

export interface AobFormLike {
  status: string;
  items?: { item: string; description: string; feeCents: number }[] | null;
}

/** A form with no items assigns no services, so it is only ever a placeholder. */
export function aobFormHasItems(form: AobFormLike): boolean {
  return Array.isArray(form.items) && form.items.length > 0;
}

/**
 * Picks the current form from a list ordered NEWEST FIRST.
 *
 * The newest form that actually means something wins — one that is signed, or
 * that has items on it. That way a deliberate regeneration (always populated)
 * supersedes an earlier signed form, while an empty placeholder never hides a
 * signed one. Falls back to the newest form when none qualifies, so a visit
 * whose only form is an empty placeholder still shows it.
 */
export function selectCurrentAobForm<T extends AobFormLike>(formsNewestFirst: T[]): T | null {
  if (formsNewestFirst.length === 0) return null;
  const meaningful = formsNewestFirst.find((f) => f.status === "signed" || aobFormHasItems(f));
  return meaningful ?? formsNewestFirst[0];
}
