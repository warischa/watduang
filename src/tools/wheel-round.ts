// One name-wheel round, with no DOM, no localStorage and no sessionStorage in it. wheel.astro owns
// the disc, the animation and the eliminate checkbox; this owns the only question a round answers —
// who is still on the disc, who a spin picks, and who a reveal eliminates. It lives here so that
// question is testable: wheel.astro is a page script and plain node cannot import it, so as long as
// the round lived inside the page the wiring could only be pinned by reading the page's own source
// text, which cannot tell a right lookup from a wrong one (gh#118).
import { pickName } from './wheel.ts';
import { remainingSlots, slotTokens, type NameSlot } from './name-list.ts';

/** A round over one roster. Eliminated players are held as ROSTER POSITIONS, never as names —
 *  parseNameLines keeps duplicates on purpose, so three people at one table can all be "แนน" and
 *  each of them owns a turn. A position must come from the picked slot's own `index`; looking it up
 *  by name would take the first player with that name out instead of the one that was picked. */
export class WheelRound {
  private players: string[] = [];
  private readonly spun = new Set<number>();

  /** A new roster, and a fresh round over it. */
  start(players: string[]): void {
    this.players = players;
    this.spun.clear();
  }

  /** Same roster, everyone back on the disc. */
  reset(): void {
    this.spun.clear();
  }

  /** How many slots the roster has — counts slots, not distinct names. */
  get size(): number {
    return this.players.length;
  }

  /** The full roster, in order, for render() to list every player (including spun-out ones). */
  list(): readonly string[] {
    return this.players;
  }

  /** Whether roster position `index` has been recorded as spun, regardless of the current gate —
   *  render() combines this with its own live checkbox read to decide whether to show a slot as out. */
  has(index: number): boolean {
    return this.spun.has(index);
  }

  /** The slots still on the disc. `gated` is a REVEAL-TIME read of the eliminate checkbox, passed
   *  in because this module owns no DOM. Ungated (false) shows every slot — unchecking the box must
   *  never retroactively un-eliminate anyone, it only stops the disc from filtering what a reveal
   *  already recorded (gh#119). */
  remaining(gated: boolean): NameSlot[] {
    return remainingSlots(this.players, gated ? this.spun : new Set<number>());
  }

  /** The OFFSET into `left` that one spin lands on — an offset, not a name, since two slots can
   *  carry the same one. `left` must be the same array the caller draws the disc from and later
   *  passes to `reveal`; passing a re-sliced list after this offset was computed is the confirmed
   *  defect landingRotation's own caller guards against. Throws pickName's Thai refusal below 2
   *  names — callers with exactly one slot left must not reach this (see wheel.astro's own guard). */
  pickFrom(left: NameSlot[], random?: () => number): number {
    if (left.length === 1) return 0; // one person left = nothing to randomize, still revealed
    return Number(pickName(slotTokens(left), random));
  }

  /** Record the picked slot as spun, gated on a REVEAL-TIME read of the eliminate checkbox — not
   *  the read at spin time, since the box can be toggled mid-spin. Ticking applies FORWARD only:
   *  picks made while unchecked stay on the disc and are never eliminated retroactively (gh#119). */
  reveal(picked: NameSlot, gated: boolean): void {
    if (gated) this.spun.add(picked.index);
  }
}
