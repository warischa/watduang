// State for "this group" — sessionStorage, self-expiring (6h), not tied to the roster.
import type { Checkpoint, GameSession } from '../games/types';

const KEY = 'watduang:session';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** A record written before identities existed. sessionStorage keeps it for the whole 6h window, so on
 *  the deploy that added the field there are live sessions in this shape. It has no owner, so every
 *  closure loaded off it shares this one — pre-identity behaviour among peers, and no create right. */
const LEGACY_ID = 'legacy';

interface StoredSession {
  /** Which round this is. Minted on create, never rewritten; absent only on a legacy record. */
  id?: string;
  players: string[];
  played: string[];
  checkpoint: Checkpoint | null;
  stamp: number;
  /**
   * How many times this record has been written. The compare-and-swap token every write checks itself
   * against — NOT a clock, and `stamp` is not a substitute: gh#49's clobbering write carried the newer
   * wall clock (1787147041344 over the 1787147038224 it destroyed), so last-write-wins-by-time lets the
   * loss through. Absent on a legacy record and read as 0 there. Unbounded on purpose — and NOT because
   * the record is short-lived: `stamp` is refreshed by every write, so an actively played record
   * outlives MAX_AGE_MS indefinitely. It is safe because it counts taps, and a float's safe integer
   * range is 2^53 of them.
   */
  gen?: number;
}

let minted = 0;
/** Unique within a tab: the counter covers one page, the timestamp covers reloads of the same tab. */
const mintId = (): string => `${Date.now().toString(36)}-${++minted}`;

/** The live record, or null when there is none. Absent, aged out and unparseable all read the same —
 *  aging matters here because the key outlives MAX_AGE_MS, and an aged record must not block a start.
 *
 *  `mine` is the id the caller already owns, and it is the one exception to that. Age is a LOADER rule
 *  — nothing may resume a 6h-old round — and it is not an ownership rule, so an expired record is
 *  still present for the closure that created it. write() reading the slot through the strict door was
 *  gh#51 F1: a round started at 20:00 and still being tapped at 02:30 met `current === null` while
 *  holding a non-null myId, so every save was refused as 'record-gone' — false, nothing was cleared —
 *  and setPlayers, the sole creator, was refused on the same branch, so the round could not re-create
 *  itself either and the next reload took it. Every write refreshes `stamp`, so the owner still tapping
 *  is what keeps the record alive; callers that pass nothing keep the strict rule, which is what leaves
 *  an aged record invisible to a loader and free for a fresh start to overwrite. */
function readRaw(mine?: string | null): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (Date.now() - parsed.stamp <= MAX_AGE_MS) return parsed;
    // Expired: present for its owner and for nobody else. Normalised through LEGACY_ID so the
    // pre-identity door behaves like the normal one — a closure loaded off a gen-less record holds
    // LEGACY_ID while the record itself carries no id at all.
    return (parsed.id ?? LEGACY_ID) === mine ? parsed : null;
  } catch {
    return null;
  }
}

function read(): StoredSession {
  const parsed = readRaw();
  if (!parsed) return { players: [], played: [], checkpoint: null, stamp: Date.now() };
  return {
    id: parsed.id ?? LEGACY_ID,
    players: Array.isArray(parsed.players) ? parsed.players : [],
    played: Array.isArray(parsed.played) ? parsed.played : [],
    checkpoint: parsed.checkpoint ?? null,
    stamp: parsed.stamp,
    gen: parsed.gen ?? 0,
  };
}

/**
 * Why a write was refused. Three reasons because they are three different losses to a player, and the
 * copy that eventually names one has to say which: the round record is gone, someone else's round holds
 * the slot, or this closure is a version behind the record it is talking about (gh#50).
 */
export type WriteRefusal = 'record-gone' | 'other-round' | 'stale-version';

/**
 * What loadSession() actually hands back: a GameSession plus the refusal signal. Deliberately NOT on
 * GameSession — a game gets `ctx.session` and must stay out of this. Handling a refusal is the shell's
 * job once, not an obligation that spreads to every game file as the manifest grows (gh#50).
 */
export interface ShellSession extends GameSession {
  /** Called by write() when a guard refuses. One slot, last setter wins — the shell is the only owner. */
  onWriteRefused: ((reason: WriteRefusal) => void) | null;
}

export function loadSession(): ShellSession {
  const stored = read();

  /**
   * The record this closure is talking about — captured at load, minted on create, null until it has
   * one. Every write compares it against the record actually in the slot and refuses on a mismatch.
   *
   * Why compare instead of trusting the closure: loadSession() hands out an independent mutable closure
   * per call — the shell holds one, the mounted game holds another (game/[id].astro builds ctx.session
   * once) — over a single storage key. clear() cannot invalidate a closure it does not know about, so
   * after a clear the game's closure is still live and still armed. Press Clear-and-drop-pending-round mid-round
   * and location.reload() is a macrotask away; a tap that lands before unload ran save() through the
   * game's closure and setItem the discarded round straight back. After the reload the panel offered
   * Resume-pending-round for the round the player had just thrown away — a discard that silently
   * un-discards, which is an ADR-0008 violation in substance. The round-over path did it too, reviving
   * the whole record through markPlayed + saveCheckpoint(null).
   *
   * An existence check ("is there a record") closed only half of that, and a per-closure first-call flag
   * only the other half: a stale closure whose first setPlayers had not been spent still created over an
   * absent record, and once any new round existed a stale closure wrote its pre-discard snapshot over it.
   * Identity answers both with one question, so both mechanisms are gone. It stays compatible with issue
   * #20's refresh-resume by construction: a closure updating the record it is actually talking about —
   * siamsi.ts:344 writing the checkpoint's roster back — still matches.
   */
  let myId: string | null = stored.id ?? null;

  /**
   * Which version of that record this closure last saw — the compare-and-swap token, checked and then
   * bumped on every successful write. Identity answers "whose round is in the slot"; it cannot answer
   * "is my copy of it current", and gh#49 is entirely the second question: a page frozen in bfcache
   * keeps a live closure holding the round's own id, so when it is restored mid-round and the player
   * taps, the identity compare passes and its months-old-in-round-time snapshot overwrites everything
   * the newer page instance did. Measured loss: holder 2 -> 1, results 2 -> 1, a drawn card back in
   * the deck, in silence.
   *
   * Seeded from the loaded record, ABSENT READS AS 0 — that is what makes one check cover the legacy
   * door too. The identity compare is skipped whenever the stored id is undefined, so on a
   * pre-identity record every closure loaded off it could clobber every other, and a guard nested
   * inside that branch would inherit the same blind spot. This one sits beside the branch, not in it.
   *
   * No separate lock is needed on top: write() is already an atomic read-modify-write. One JS realm
   * runs at a time per tab and a bfcached page is frozen, so nothing interleaves between the readRaw()
   * below and its setItem — the only missing piece was ever the version token. A second tab is not a
   * hole either: sessionStorage is scoped per top-level tab, so another tab gets its own store and
   * cannot reach this key; SharedWorker and service workers have no sessionStorage at all.
   */
  let myGen: number = stored.gen ?? 0;

  /** Refuse: tell whoever is listening, and hand the reason back to the caller. Never re-syncs myGen
   *  and never adopts the stored record — ADR-0021 declined reconciliation, and adopting would either
   *  discard the player's visible state (ADR-0008) or persist the stale snapshot (gh#49 again). */
  const refuse = (reason: WriteRefusal): WriteRefusal => {
    session.onWriteRefused?.(reason);
    return reason;
  };

  /**
   * The two compare-and-swap questions, asked of the record actually in the slot: is this the round
   * this closure knows, and is it the version of that round this closure last saw. Null means this
   * closure owns what is there and may mutate it.
   *
   * Shared by write() AND clear() rather than copied into each. clear() shipped with no guard at all
   * (gh#51 F2) and a guard copied per caller leaves the next caller unsafe by default — both questions
   * live here once, so a mutating path added later cannot inherit half of them.
   */
  const mismatch = (current: StoredSession): WriteRefusal | null => {
    // Someone else's round is in the slot. This closure's snapshot predates it — refuse.
    if (current.id !== undefined && current.id !== myId) return 'other-round';
    // Right round, wrong version of it: someone has written since this closure loaded, so what it is
    // about to persist is a snapshot of the round as it used to be. A sibling of the identity compare
    // and never nested inside it — a legacy record reaches this line, and gh#49 through the legacy
    // door looks the same as gh#49 through the normal one.
    if ((current.gen ?? 0) !== myGen) return 'stale-version';
    return null;
  };

  /**
   * The one chokepoint all three writers route through. `create` = this writer may bring a record into
   * existence; setPlayers is the only one, because starting a round is what brings a session into being
   * (games/_template.ts:29-31 documents that to every future game). Defaults to refusing, so a writer
   * added later inherits the safe side.
   *
   * Returns the guard's verdict — null when nothing refused. gh#50: a refusal is correct, but it left
   * the closure stranded one version behind forever (myGen is re-synced only after a successful
   * setItem, by design — see below), so every later write from the same closure was dropped too, and a
   * void return meant markPlayed/saveCheckpoint had already mutated in-memory state and reported
   * success. Signalling here rather than at the three callers is the point: this is the chokepoint, and
   * a guard added later cannot forget the signal — the declared return type rejects a bare `return`.
   */
  function write(create = false): WriteRefusal | null {
    try {
      const current = readRaw(myId);
      if (current === null) {
        // Gone means gone, whoever still holds a handle: a closure that knew a record may not re-create
        // it. Only one that never had an identity may start a round.
        // Refuse either way, but only REPORT when this closure actually knew a record. When myId is
        // null the closure never established one, which is what a dead-storage page looks like:
        // Safari private mode or a full quota makes setPlayers throw, the catch below swallows it, and
        // myId stays null. Reporting 'record-gone' there names a cause that is false — nothing was
        // cleared — and role="alert" would re-announce on every tap, the exact per-tap alarm the catch
        // below is written to avoid. gh#50 REFUTE F1.
        if (!create || myId !== null) return myId !== null ? refuse('record-gone') : null;
      } else {
        const stale = mismatch(current);
        if (stale !== null) return refuse(stale);
      }
      const id = myId ?? mintId();
      const gen = myGen + 1;
      sessionStorage.setItem(
        KEY,
        JSON.stringify({
          id,
          players: session.players,
          played: session.played,
          checkpoint: session.checkpoint,
          stamp: Date.now(),
          gen,
        } satisfies StoredSession),
      );
      // Only now: minting before the write would make Safari private mode (setItem throws every time)
      // look like a create that succeeded, and every later write would then refuse against an id that
      // was never persisted — permanent silent no-ops instead of an in-memory session. Same for the
      // generation: bumping it before a throwing setItem would leave this closure one version ahead of
      // a record that never moved, and every later write would refuse against its own phantom write.
      myId = id;
      myGen = gen;
    } catch {
      // Quota full or Safari private mode — keep going in memory for this page, never throw. NOT a
      // refusal: no guard rejected this write, storage is simply unavailable, and in private mode every
      // single write throws — signalling here would fire on every tap for the whole session.
    }
    return null;
  }

  const session: ShellSession = {
    onWriteRefused: null,
    players: stored.players,
    played: stored.played,
    checkpoint: stored.checkpoint,
    setPlayers(names: string[]): void {
      session.players = names;
      write(true);
    },
    markPlayed(id: string): void {
      if (!session.played.includes(id)) {
        session.played = [...session.played, id];
      }
      write();
    },
    saveCheckpoint(cp: Checkpoint | null): void {
      session.checkpoint = cp;
      write();
    },
    clear(): void {
      // The one write path that had no guard at all (gh#51 F2). clear() is on GameSession, so it is
      // reachable from the long-lived ctx.session closure game/[id].astro builds once per mount and a
      // bfcache restore keeps alive: the first game to ship a quit-round button would hand a stale
      // closure the power to delete the round the newer document is playing — gh#49's loss with
      // nothing left to overwrite back. Same compare-and-swap as write(), reported the same way and
      // reconciling nothing (ADR-0022): on a refusal this closure's own state stays as it was too,
      // because a half-cleared closure would show the player an empty round the record still holds.
      // An absent record needs no refusal — removeItem is already a no-op and nothing is lost.
      const current = readRaw(myId);
      const stale = current === null ? null : mismatch(current);
      if (stale !== null) {
        refuse(stale);
        return;
      }
      session.players = [];
      session.played = [];
      session.checkpoint = null;
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        // ignore
      }
    },
  };

  return session;
}
