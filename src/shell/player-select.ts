// Pure logic — no DOM/localStorage — called by PlayerSetup.astro when the start button is pressed (#21)
// Always takes in the full ticked group, never the pool left after clamping (ADR-0004 fixed this)
import type { Checkpoint } from '../games/types.ts';
import type { WriteRefusal } from './session';

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

/** Builds "Player 1..N" labels from the entered count — always clamps to [min, max] for that page.
 *  Used both when selected is empty (implicit) and when the "Player 1, 2, 3…" button is pressed directly (#22) */
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
 * Ceiling: this "loses nothing" claim rests entirely on every game's mount() recovering from an
 * unusable blob the way src/games/siamsi.ts:376-378 does (render idle when resumeFrom returns null).
 * The first game whose mount cannot recover breaks it. That is a BROADER trigger than ADR-0010's
 * second-checkpoint-writer condition, not a narrower one: a game only has to fail to recover, it
 * does not have to write checkpoints at all. So checkpoint-writer-check being green does NOT mean
 * this ceiling is unreached — the two gates cover different sets.
 * Upgrade path (not decided, just the candidate): a self-describing envelope field — a schema
 * version on Checkpoint — the shell could validate without importing a game module. The alternative,
 * an optional `canResume?(cp)` on GameModule, is expensive here because the shell island only gets
 * gameId; the game module itself is lazy-imported later, in src/pages/game/[id].astro.
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
 * #25 — Clear group empties the whole session slot, and that slot is site-wide (session.ts clear()):
 * any round in progress dies with it, not only one belonging to the page being viewed. So the question
 * is "is there a live round at all", and this function deliberately takes no gameId. planStart's
 * checkpoint.game === gameId test is right for a start — it only governs the round THIS page would
 * begin — and wrong here: with it, a press on timebomb's page would silently destroy a live siamsi
 * round. A checkpoint with no game tag still counts; the slot is emptied either way.
 *
 * confirmed = the player pressed the labelled Clear-and-drop-pending-round button. An answer is never re-asked.
 *
 * #data-loss — the checkpoint alone was never the liveness test. Only siamsi writes a checkpoint (1 of
 * 6 games), and it empties the slot the moment a round ends, so "slot is empty" covered a live round of
 * the other five games and every fresh session. roundLive is the shell's own bit: PlayerSetup sets
 * root.hidden = true when a round starts, and asked nothing about it here. Either signal alone is
 * enough — a stranded blob is a round someone can still go back to, and a round on screen is one they
 * are inside right now.
 *
 * The bit says "this page has started a round", not "a round is being played this second" — nothing
 * ever un-hides the panel, so a finished round still asks. One extra tap on a screen with nothing left
 * to lose, which is the side to err on; the copy is worded to claim only what the bit carries.
 */
export function planClear(
  checkpoint: Checkpoint | null,
  confirmed: boolean,
  roundLive = false,
): 'ask' | 'clear' {
  return !confirmed && (checkpoint !== null || roundLive) ? 'ask' : 'clear';
}

/**
 * ADR-0008: the confirm must name exactly what it destroys. planClear says *whether* to ask; this says
 * *what the question is*, and there are three answers because the two signals are independent.
 *
 * null = leave the template alone. The stranded-checkpoint pair (question opener
 * `\u0e22\u0e31\u0e07\u0e21\u0e35\u0e23\u0e2d\u0e1a\u0e17\u0e35\u0e48\u0e40\u0e25\u0e48\u0e19\u0e04\u0e49\u0e32\u0e07\u0e2d\u0e22\u0e39\u0e48 …`,
 * "there is still a round left hanging..." / button label
 * `\u0e25\u0e49\u0e32\u0e07\u0e41\u0e25\u0e30\u0e17\u0e34\u0e49\u0e07\u0e23\u0e2d\u0e1a\u0e17\u0e35\u0e48\u0e04\u0e49\u0e32\u0e07`,
 * "clear and drop the stranded round") is the markup's own default, quoted byte for byte in ADR-0008 —
 * it is not duplicated here, so there is one copy of those bytes in the repo and check-citations keeps
 * resolving.
 *
 * The both case is its own string, not the live-round one: the press destroys the round on this page AND
 * the stranded blob, and `\u0e23\u0e2d\u0e1a\u0e19\u0e35\u0e49` ("this round") names only the first. That
 * is the loss going unnamed — exactly what this ADR exists to close.
 *
 * It reads as two rounds, and sometimes there is one. siamsi is the sole checkpoint writer (ADR-0010)
 * and writes mid-round, so on siamsi's own page both signals describe the SAME round; a checkpoint
 * stranded by another game is a second one. planClear takes no gameId on purpose (#25) and neither does
 * this, so the two cases are indistinguishable from here. The string therefore over-names on siamsi's
 * own page and under-names in neither case — the direction the whole flow already errs in ("a finished
 * round asks too, which costs a tap and loses nothing"). Do not "fix" it with a game-matched test: that
 * is the #25 bug, one page over.
 *
 * Every non-null case returns BOTH strings. Nothing puts the template text back on cancel and
 * root.hidden never returns to false, so a case that swapped one string would leave the other stale for
 * the rest of the page's life.
 */
export function clearCopy(
  checkpoint: Checkpoint | null,
  roundLive: boolean,
): { message: string; confirmLabel: string } | null {
  if (!roundLive) return null;
  if (checkpoint !== null) {
    return {
      message: 'เริ่มรอบบนหน้านี้ไปแล้ว และยังมีรอบที่เล่นค้างอยู่ด้วย ถ้าล้างกลุ่มนี้ ทั้งรอบนี้และรอบที่ค้างจะหายไป',
      confirmLabel: 'ล้างและทิ้งทุกรอบ',
    };
  }
  return {
    message: 'เริ่มรอบบนหน้านี้ไปแล้ว ถ้าล้างกลุ่มนี้ รอบนี้จะหายไปทั้งรอบ',
    confirmLabel: 'ล้างและทิ้งรอบนี้',
  };
}

/**
 * gh#50 — session.ts's write() refuses instead of clobbering, but the player is still mid-tap on a page
 * that just silently dropped it. The three reasons are three different losses, so three separate
 * strings, owner-approved copy from #25's naming rule: the message names EVERY loss it actually causes.
 * Exhaustive over WriteRefusal by construction (no default case) — a fourth reason is a compile error
 * here, not a silently blank notice.
 */
export function refusalCopy(reason: WriteRefusal): string {
  switch (reason) {
    case 'stale-version':
      return 'รอบนี้ถูกเล่นต่อจากหน้าอื่นแล้ว ที่กดในหน้านี้หลังจากนั้นไม่ได้บันทึก';
    case 'other-round':
      return 'มีรอบใหม่เริ่มไปแล้ว ที่กดในหน้านี้ไม่ได้บันทึก';
    case 'record-gone':
      return 'รอบนี้ถูกล้างไปแล้ว ที่กดในหน้านี้ไม่ได้บันทึก';
  }
}

/** selected is the full group as ticked by the user (or "Player 1..count" when nobody ticked anyone)
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
