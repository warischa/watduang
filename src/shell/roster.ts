// Player roster persists across rounds, across games — localStorage (every storage touch needs try/catch, issue #7)
import type { Roster } from '../games/types';

const KEY = 'watduang:roster';
// "Group" = the subset of the roster actually playing — deliberately a separate key from roster (#15)
// Existing users already have a raw string[] under KEY — reshaping that key into an object would silently lose their names
const GROUP_KEY = 'watduang:group';

function read(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

function write(key: string, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Quota full or Safari private mode — keep going in memory for this page, do not throw
  }
}

// One name for the whole roster key, so every tab on the origin queues on the same lock.
const LOCK = 'watduang:roster';

/** Runs `fn` inside the cross-tab critical section, or straight through where there is no lock to take.
 *  navigator.locks is absent in the Node test runner and in any non-secure context (plain http, Safari
 *  before 15.4), and request() itself rejects on an opaque origin (sandboxed iframe, file://). All three
 *  fall back to running unlocked — the old best-effort behaviour, which still loses a concurrent add, but
 *  never throws and never silently drops the write. Re-running `fn` on the rejection path is safe: add()
 *  returns early on a name the list already holds.
 *
 *  scripts/roster-lock-structure-check.mjs gates the STRUCTURE of this function. The committed unit
 *  tests all exercise the no-lock fallback branch (roster.test.mjs asserts the Node runner has no
 *  navigator.locks); the only committed check of the locked path is a mocked one at roster.test.mjs:149.
 *  Real two-tab behaviour is proven only by the manual scripts/roster-lock-two-tab-race.mjs. */
function withLock(fn: () => void): Promise<void> {
  if (typeof navigator === 'undefined' || typeof navigator.locks?.request !== 'function') {
    fn();
    return Promise.resolve();
  }
  return navigator.locks.request(LOCK, fn).catch(() => {
    fn();
  });
}

/** The last group that started a round — drops names no longer in the roster, so a removed name
 *  never comes back as a stuck ghost tick. Ordered as saved (= the order the player picked), not roster order. */
export function loadGroup(): string[] {
  const names = read(KEY);
  return read(GROUP_KEY).filter((n) => names.includes(n));
}

/** Stores raw, no clamp — the max ceiling belongs to each page, not to storage.
 *  A page with a smaller max clamps on use, so the old group is never permanently trimmed just because it passed through that page once.
 *
 *  Wholesale overwrite, no lock, no re-read, no CAS — unlike add() above, and deliberately so
 *  (gh#51 F4, closed won't-fix). Two tabs on this key are last-write-wins: a tab that loaded before
 *  another added a name writes its own ticked set back and the newer name drops out of the prefill.
 *  Every fix that changes that is worse. A union with the stored group resurrects a name the player
 *  unticked on this page (PlayerSetup unticks by `selected.delete`), which is the ghost tick
 *  loadGroup()'s filter above exists to prevent — a wrong group actually played, in place of a prefill
 *  the player re-ticks. Refusing on a CAS mismatch stores a group that is not the one being played. A
 *  lock alone protects nothing: there is no read inside the critical section to protect, and a single
 *  setItem of the whole value cannot interleave. What this key means is "the group the player last
 *  ticked" — PlayerSetup.astro's `saveGroup([...selected])` stores it BEFORE the live-round question
 *  is asked, deliberately, so it is NOT "the group that started a round": tick a group, then choose
 *  resume, and the stored group never started one. Last writer is still the correct writer, because
 *  the player really did tick it.
 *  Pinned by roster.test.mjs's F4 test, which fails if this ever starts merging. Reopen only if the
 *  group becomes something a tab appends to. */
export function saveGroup(names: string[]): void {
  write(GROUP_KEY, names);
}

export function loadRoster(): Roster {
  let list = read(KEY);

  return {
    names(): string[] {
      return [...list];
    },
    async add(name: string): Promise<void> {
      const trimmed = name.trim();
      if (!trimmed) return; // nothing to store, so nothing worth queueing on the lock for
      // #data-loss: re-read at the write, never at the load, and the re-read has to sit INSIDE the lock.
      // localStorage is shared by every tab on the domain, so the list captured above can be stale by the
      // time this runs: tab B adds a name, tab A adds another, and A writing its whole captured array back
      // erases B's — reproduced on the first of 30 real two-tab attempts, capture 08-roster-race-two-tab
      // under docs/verification/evidence/34/. Second hop, and the harm a player sees: loadGroup() filters
      // the saved group by roster names, so the pre-ticked group shrinks with it.
      // A lock around the write alone would fix nothing — the read it writes back would still be one taken
      // outside the critical section. Both statements go in together or neither does.
      // ponytail: this callback is fully synchronous, and that's load-bearing — the lock is granted
      // and released within a microtask, so the window for a queued start-button tap to snapshot the
      // roster before this add resolves is milliseconds wide, far under human tap timing. Holds only
      // while nothing in here awaits. The moment it does (IndexedDB, network, async storage), disable
      // add and start for the duration, or have the start handler await any in-flight add.
      await withLock(() => {
        // Union, not adoption. Storage replacing memory would break the promise write() makes above: after
        // a swallowed write (quota full, Safari private mode) storage is missing every name typed since, so
        // adopting it would erase them from the rendered list while their ticks are still in `selected`. So
        // this tab's names keep their typing order and whatever another tab added comes after — both
        // survive, and the two only stay apart while writing is broken.
        list = [...list, ...read(KEY).filter((n) => !list.includes(n))];
        if (list.includes(trimmed)) return;
        list = [...list, trimmed];
        write(KEY, list);
      });
    },
  };
}
