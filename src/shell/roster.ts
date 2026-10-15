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

/** One edit the shared player screen made, named by WHAT changed, never by a snapshot of the list. */
export type RosterOp =
  | { op: 'remove'; name: string }
  | { op: 'rename'; from: string; to: string }
  | { op: 'add'; name: string };

/** What applyRosterOps did. `roster` is the list storage holds once it returns: the committed one on
 *  'ok', the untouched stored one on a refusal -- which writes NOTHING (gh#264 REFUTE round 3: a
 *  refusal used to keep every edit before the refused add, so the API was partial).
 *    'ceiling'   -- the adds in `refused` do not fit under the ceiling;
 *    'collision' -- two seats would end on one of the `names`: a rename or an add onto a name the
 *                   stored roster already shows (another tab added it), or two edits onto one name. */
export type RosterOpsResult =
  | { status: 'ok'; roster: string[] }
  | { status: 'ceiling'; roster: string[]; refused: string[] }
  | { status: 'collision'; roster: string[]; names: string[] };

/** ADR-0071 (gh#264): the shared player screen's roster write. The screen hands over the EDITS it
 *  made -- removes, renames keyed by the name it opened with, adds -- and they are applied INSIDE the
 *  lock to the roster as it stands NOW, so a second tab's work is never undone by a screen that
 *  merely opened before it:
 *    - a name another tab removed is not brought back by a screen that did not touch it;
 *    - two screens renaming two different names both land, each in its own seat (turn order is
 *      roster order, ruling 5);
 *    - the renames of one batch are ONE simultaneous mapping, old name -> final name, applied to
 *      every seat at once (gh#264 REFUTE round 2): a chain A->B, B->Z leaves B and Z, a swap A<->B
 *      leaves B and A, each in the seat it was in. Applied one after another they deleted a player;
 *    - a rename whose old name is already gone becomes an add -- the player is still on the screen.
 *  ALL OR NOTHING. The batch is resolved in memory first and written once, only if every op lands:
 *    - two seats ending on the SAME final name is a COLLISION, never a merge (owner ruling
 *      2026-10-15, board frame 9): the roster is keyed by name, so a merge would silently turn two
 *      players into one. The screen never sends such a batch itself; what reaches here is a name
 *      another tab stored after this screen read the roster;
 *    - an add past `ceiling` is a CEILING refusal, never stored and clipped later. The ceiling is the
 *      caller's (the shared screen owns that constant, ruling 7); storage only enforces it.
 *  A collision is reported over a ceiling refusal: it is the one the players can fix in place.
 *  Removes go first, so a removal frees the seat an add in the same batch needs.
 *  Known false collision, accepted: two tabs that both rename A to Alpha -- the second finds A gone,
 *  its rename becomes an add, and the add meets the first tab's Alpha. The refusal shows the truth.
 *  Same re-read-inside-the-lock shape as add(), for the same reason (#data-loss above). */
export async function applyRosterOps(ops: readonly RosterOp[], ceiling: number): Promise<RosterOpsResult> {
  let result: RosterOpsResult = { status: 'ok', roster: [] };
  await withLock(LOCK, () => {
    // Re-run safe: withLock may run this twice on a rejected lock request, and every run computes
    // its result from a fresh read, never from what an earlier run accumulated.
    const stored = read(KEY);
    let list = stored;
    const adds: string[] = [];
    for (const o of ops) if (o.op === 'remove') list = list.filter((n) => n !== o.name);
    // Old name -> final name, resolved against the stored seats in one pass, never in sequence.
    const finalName = new Map<string, string>();
    for (const o of ops) {
      if (o.op !== 'rename') continue;
      const to = o.to.trim();
      if (!hasVisibleChar(to) || to === o.from) continue;
      if (list.includes(o.from)) finalName.set(o.from, to);
      else adds.push(to);
    }
    list = list.map((n) => finalName.get(n) ?? n);
    for (const o of ops) if (o.op === 'add') adds.push(o.name.trim());
    for (const name of adds) if (hasVisibleChar(name)) list = [...list, name];
    const seen = new Set<string>();
    const collided = new Set<string>();
    for (const n of list) (seen.has(n) ? collided : seen).add(n);
    if (collided.size > 0) {
      result = { status: 'collision', roster: stored, names: [...collided] };
      return;
    }
    const kept = list.length - adds.filter((n) => hasVisibleChar(n)).length;
    const refused = list.slice(Math.max(ceiling, kept));
    if (refused.length > 0) {
      result = { status: 'ceiling', roster: stored, refused };
      return;
    }
    write(KEY, list);
    result = { status: 'ok', roster: list };
  });
  return result;
}

/** ADR-0071 "Data": the one-time import of a per-game player list that predates the shared roster.
 *  An EMPTY roster imports what `extract` returns from the legacy value; a non-empty roster wins and
 *  the legacy value is never read into it. Either way the legacy key is deleted, so this runs at most
 *  once per key per device and is safe to call on every mount.
 *
 *  The legacy key is spelled by the caller, not here: this module owns the roster key, the group key
 *  and one bookkeeping key (RETIRED_KEY, the settings blobs already migrated -- gh#264 REFUTE round 5,
 *  ADR-0071 Data), and the per-game keys belong to the games that wrote them. Only the storage TOUCH lives here,
 *  so a route never reaches localStorage itself.
 *
 *  One refusal to delete: if the import was attempted and the write did not land (quota, private
 *  mode), the legacy key is kept so the next visit can try again -- deleting it would lose the names
 *  in exactly the case the write path above already promises to survive.
 *
 *  `keep: 'settings'` (owner ruling 2026-10-15): the legacy value is a JSON object whose `players`
 *  field is the list and whose OTHER fields are game settings the route still reads under the same
 *  key. The same import rule applies to the players, but the key is never deleted: the object is
 *  written back WITHOUT `players`, every other field kept as it was. A value that is not an object
 *  with a `players` field -- corrupt JSON included -- is the route's, left exactly as it is. */
export async function migrateLegacyList(
  legacyKey: string,
  extract: (value: unknown) => string[],
  keep?: 'settings',
): Promise<void> {
  if (keep === 'settings') {
    await migrateSettingsPlayers(legacyKey, extract);
    return;
  }
  let raw: string | null;
  try {
    raw = localStorage.getItem(legacyKey);
  } catch {
    return;
  }
  if (raw === null) return;
  let imported: string[] = [];
  try {
    imported = legacyNames(extract, JSON.parse(raw));
  } catch {
    imported = []; // a corrupt legacy value imports nothing and is still retired below
  }
  let landed = true;
  await withLock(LOCK, () => {
    if (read(KEY).length > 0 || imported.length === 0) return;
    write(KEY, imported);
    landed = read(KEY).length > 0;
  });
  if (!landed) return;
  try {
    localStorage.removeItem(legacyKey);
  } catch {
    // Nothing to do: the key stays and the next mount runs this again, which is harmless.
  }
}

/** The legacy names an extract returns, cleaned the one way both migrations clean them. */
function legacyNames(extract: (value: unknown) => string[], value: unknown): string[] {
  return [...new Set(extract(value).filter((n) => typeof n === 'string').map((n) => n.trim()).filter((n) => hasVisibleChar(n)))];
}

/** The settings keys whose `players` field this module has already retired -- imported with the
 *  write read back, or dropped under a non-empty roster. Owned here, never by a route.
 *
 *  Why a record and not just the stripped blob (gh#264 REFUTE round 5): the route rewrites its own
 *  blob too, and it carries an existing `players` field through so a FAILED import can retry. A
 *  route save that read the blob before a migration and wrote after it puts the retired players
 *  back, and the blob alone cannot tell that copy from a pending import -- so a later mount, after
 *  the players removed those names, imported them again. A key on this list never imports again:
 *  a `players` field found under it is stale by definition and is stripped unread. */
const RETIRED_KEY = 'watduang:roster-retired-settings';

/** migrateLegacyList's `keep: 'settings'` half. The read, the import and the rewrite all sit inside
 *  ONE synchronous lock callback, so the route's own settings write cannot land between the read
 *  and the rewrite and be overwritten by a stale copy. A stale write that lands AFTER it is what the
 *  retired record above answers. */
async function migrateSettingsPlayers(legacyKey: string, extract: (value: unknown) => string[]): Promise<void> {
  await withLock(LOCK, () => {
    let raw: string | null;
    try {
      raw = localStorage.getItem(legacyKey);
    } catch {
      return;
    }
    if (raw === null) return;
    let blob: unknown;
    try {
      blob = JSON.parse(raw);
    } catch {
      return; // corrupt: nothing to import and nothing this module can rewrite faithfully
    }
    if (!blob || typeof blob !== 'object' || Array.isArray(blob) || !('players' in blob)) return;
    const retired = read(RETIRED_KEY);
    if (!retired.includes(legacyKey)) {
      let imported: string[] = [];
      try {
        imported = legacyNames(extract, blob);
      } catch {
        imported = [];
      }
      if (read(KEY).length === 0 && imported.length > 0) {
        write(KEY, imported);
        // Did not land (quota, private mode): keep the blob whole, players included, and record
        // nothing, so the next visit imports again.
        if (read(KEY).length === 0) return;
      }
      // Recorded before the rewrite below: a rewrite that fails then leaves a field the next mount
      // strips without importing, rather than one it would read as still pending.
      write(RETIRED_KEY, [...retired, legacyKey]);
    }
    const settings: Record<string, unknown> = { ...(blob as Record<string, unknown>) };
    delete settings.players;
    try {
      localStorage.setItem(legacyKey, JSON.stringify(settings));
    } catch {
      // The blob keeps its players field; the key is already recorded, so the next mount strips it.
    }
  });
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
