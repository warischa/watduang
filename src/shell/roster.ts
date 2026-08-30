// Player roster persists across rounds, across games — localStorage (every storage touch needs try/catch, issue #7)
import type { Roster } from '../games/types';
// One shared predicate for "this string contains a character that actually renders", consumed by
// every place a name is authored or read back. It lives in the tool module, not here and not in a
// module of its own, for a build reason: name-list.js is ALREADY an emitted shared chunk, so
// importing from it changes no reachable-chunk basename, while a new file imported by both this
// module and the tools would emit a new chunk and red bundle-freeze-check.
import { hasVisibleChar } from '../tools/name-list.ts'; // .ts extension: node --test resolves this module directly (player-select.ts imports the same way)
// The cross-tab critical section, shared with the tools. Its own module, not this one and not
// name-list.ts, because those two already import one way and either direction would be a cycle.
// It does NOT emit a chunk of its own, unlike the case the note above warns about: name-list.ts
// imports it too, so every entry that reaches lock.ts already reaches name-list.ts and Rollup folds
// the two into one chunk — measured, bundle-freeze-check stays green on the same 27 basenames.
import { withLock } from './lock.ts';

const KEY = 'watduang:roster';
// "Group" = the subset of the roster actually playing — deliberately a separate key from roster (#15)
// Existing users already have a raw string[] under KEY — reshaping that key into an object would silently lose their names
const GROUP_KEY = 'watduang:group';

function read(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // The read-side drop, and it covers loadRoster AND loadGroup because both come through here: a
    // name with no visible character that was stored before this guard existed disappears the first
    // time the roster is read. That is what makes the missing remove-a-name control survivable.
    // What it does NOT cover: a checkpoint written before this guard existed. resumeFrom in the game
    // modules restores from the checkpoint's own players array and never re-reads the roster, so an
    // in-progress round saved with a blank in it resumes with that blank. Self-limiting — it dies
    // with the round and cannot come back, because the roster it would be re-added from is filtered
    // here. Left alone deliberately: rewriting a stored checkpoint is the one edit that can lose a
    // round in progress, which is a worse failure than one invisible row for one round.
    return Array.isArray(parsed)
      ? parsed.filter((n): n is string => typeof n === 'string' && hasVisibleChar(n))
      : [];
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
      // Not `if (!trimmed)`: trim() strips U+FEFF and U+00A0 but leaves U+200B and U+2060 standing,
      // so a name pasted out of a chat app used to pass here and become a row that renders as nothing.
      if (!hasVisibleChar(trimmed)) return; // nothing to store, so nothing worth queueing on the lock for
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
      await withLock(LOCK, () => {
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
