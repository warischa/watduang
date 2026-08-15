// Pure logic — no DOM/localStorage — called by PlayerSetup.astro when the start button is pressed (#21)
// Always takes in the full ticked group, never the pool left after clamping (ADR-0004 fixed this)
import type { Checkpoint } from '../games/types.ts';

export interface StartResolution {
  /** Who actually plays on this page — already clamped to max */
  playing: string[];
  /** Who got cut for exceeding this page's max — still in the saved group, not lost */
  sittingOut: string[];
  /** true = can't start yet (below min), must refuse */
  belowMin: boolean;
  /** true = over max and needs a warning shown first (not yet warned this round) */
  needsOverMaxWarning: boolean;
}

/** Builds "คนที่ 1..N" labels from the entered count — always clamps to [min, max] for that page.
 *  Used both when selected is empty (implicit) and when the "คนที่ 1, 2, 3…" button is pressed directly (#22) */
export function numberedPlayers(count: number, min: number, max: number): string[] {
  const n = Math.min(max, Math.max(min, count || min));
  return Array.from({ length: n }, (_, i) => `คนที่ ${i + 1}`);
}

/** What the player told us at the prompt — undefined until they have been asked. */
export type ResumeChoice = 'resume' | 'fresh';

/**
 * #23 — a round in progress may only end by a labelled choice. With a checkpoint belonging to the
 * game on THIS page, both start buttons must ask instead of deciding: resuming silently throws away
 * the group the player just ticked, and starting silently throws away the round they are mid-way
 * through. Once they answer, the answer is final.
 *
 * The game tag is what keeps this specific to one page. Matching on "any checkpoint exists" is the
 * defect #23 removed: a siamsi blob would raise a prompt on timebomb's page, which has no resume at
 * all. gameId is undefined on tool pages — nothing to resume there, so they never prompt.
 *
 * ponytail: whether the blob is actually *usable* stays the game's business (siamsi resumeFrom) —
 * the shell must not import a game module to find out. A corrupt same-game blob still prompts, and
 * resuming it lands on the game's own idle screen rather than losing anything.
 */
export function planStart(
  checkpoint: Checkpoint | null,
  gameId: string | undefined,
  choice?: ResumeChoice,
): 'ask' | 'start' | 'discard-then-start' {
  if (choice === 'fresh') return 'discard-then-start';
  if (choice === 'resume') return 'start';
  return gameId !== undefined && checkpoint?.game === gameId ? 'ask' : 'start';
}

/**
 * #25 — ล้างกลุ่มนี้ empties the whole session slot, and that slot is site-wide (session.ts clear()):
 * any round in progress dies with it, not only one belonging to the page being viewed. So the question
 * is "is there a live round at all", and this function deliberately takes no gameId. planStart's
 * checkpoint.game === gameId test is right for a start — it only governs the round THIS page would
 * begin — and wrong here: with it, a press on timebomb's page would silently destroy a live siamsi
 * round. A checkpoint with no game tag still counts; the slot is emptied either way.
 *
 * confirmed = the player pressed the labelled ล้างและทิ้งรอบที่ค้าง button. An answer is never re-asked.
 */
export function planClear(checkpoint: Checkpoint | null, confirmed: boolean): 'ask' | 'clear' {
  return !confirmed && checkpoint !== null ? 'ask' : 'clear';
}

/** selected is the full group as ticked by the user (or "คนที่ 1..count" when nobody ticked anyone)
 *  warned = user just saw the over-max warning and pressed again to confirm continuing */
export function resolveStart(
  selected: string[],
  min: number,
  max: number,
  warned: boolean,
): StartResolution {
  const playing = selected.slice(0, max);
  const sittingOut = selected.slice(max);
  const need = Math.max(min, 1);

  return {
    playing,
    sittingOut,
    belowMin: playing.length < need,
    needsOverMaxWarning: sittingOut.length > 0 && !warned,
  };
}
