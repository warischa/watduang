// One draw-lots round, with no DOM, no localStorage and no sessionStorage in it. The page owns the
// markup and its fixed-height regions; this owns the only question a round answers — who is still in the box,
// who a press hands out, and who leaves. It lives here so that question is testable: draw.astro is a
// page script and plain node cannot import it, so as long as the round lived inside the page the
// wiring could only be pinned by reading the page's own source text, which cannot tell a right
// lookup from a wrong one.
import { drawNames } from './draw.ts';
import { remainingSlots, slotTokens, type NameSlot } from './name-list.ts';

/** A round over one roster. Eliminated players are held as ROSTER POSITIONS, never as names:
 *  parseNameLines keeps duplicates on purpose, so three people at one table can all be "แนน" and
 *  each of them owns a turn. A position must come from the drawn slot's own `index` — looking it up
 *  by name would take the first player with that name out instead of the one that was drawn, so the
 *  wrong person leaves the box and the drawn one stays drawable.
 *
 *  The roster is kept verbatim: no dedupe, no cap, no ceiling (gh#91). State is deliberately
 *  memory-only — a refresh starts a new round, and nothing here may reach the shared site-wide
 *  checkpoint slot (ADR-0039), which a tool touching would wipe an in-progress game. */
export class DrawRound {
  private players: string[] = [];
  private readonly drawn = new Set<number>();

  /** A new roster, and a fresh round over it. */
  start(players: string[]): void {
    this.players = players;
    this.drawn.clear();
  }

  /** Same roster, everyone back in the box. */
  reset(): void {
    this.drawn.clear();
  }

  /** How many slots the roster has — the party-size and "จับครบทั้ง N คนแล้ว" rules count this, not
   *  the number of distinct names. */
  get size(): number {
    return this.players.length;
  }

  /** The slots still in the box, in roster order. */
  remaining(): NameSlot[] {
    return remainingSlots(this.players, this.drawn);
  }

  /** The slots one press would hand out. Pure — the round is unchanged until `take` is called, so a
   *  caller may inspect a would-be draw without spending it. The page no longer does: it reserves no
   *  height at runtime, because every region a reveal can fill now has a fixed height in CSS
   *  (ADR-0024). Purity stays because `take` is the only mutation, not because anything measures.
   *  Throws drawNames' own Thai refusals when `count` does not fit what is left. */
  pick(count: number, random?: () => number): NameSlot[] {
    const left = this.remaining();
    // A token is the offset into `left`, which is what makes the pick invertible when two slots
    // carry the same name; the names themselves are not distinct.
    return drawNames(slotTokens(left), count, random).map((token) => left[Number(token)]!);
  }

  /** Take the picked slots out of the box, by their own positions. */
  take(slots: NameSlot[]): void {
    for (const slot of slots) this.drawn.add(slot.index);
  }
}
