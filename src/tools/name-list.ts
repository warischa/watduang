// The list a name tool keeps for its own page — one localStorage key per tool, no ceiling, and never
// the shared stores (ADR-0039 dropped the tools from the roster that the "สุ่มคนโดน" games still share).
// The key is handed in by the page, so this module names no storage key of its own and can never write
// one by accident; keep the key OUT of here for that reason (number.astro's range store is the same
// pattern). Every storage touch runs inside try/catch (issue #7): private mode and full-quota both
// degrade to an in-memory list for this page, never a throw.

/** Does this string contain at least one character that actually RENDERS? A name that renders as
 *  nothing is not a name: it becomes a roster row or a tool entry the reader cannot see, cannot
 *  distinguish from its neighbours, and — there being no remove-a-name control — cannot get rid of.
 *  `trim()` is not this check and never was: it strips U+FEFF and U+00A0, but NOT U+200B or U+2060, so a
 *  pasted zero-width name passed every guard this repo had and stored as a blank row.
 *
 *  Deliberately NOT a list of invisible codepoints. Unicode owns that set and it grows, so a
 *  blacklist never converges (ADR-0026: guard the bounded set we own, at authorship). This inverts
 *  it — the three categories below are the ones that render nothing, everything else is treated as
 *  visible, and a format character assigned in a future Unicode version is Cf on the day it lands
 *  and gets rejected here with no code change.
 *
 *  REJECTED, and only these: White_Space (space, tab, newline, U+00A0 NO-BREAK SPACE, U+3000
 *  IDEOGRAPHIC SPACE), Cf format characters (U+200B ZERO WIDTH SPACE, U+200C/U+200D the joiners,
 *  U+200E/U+200F the bidi marks, U+2060 WORD JOINER, U+00AD SOFT HYPHEN, U+FEFF BOM) and Cc controls.
 *
 *  ACCEPTED, deliberately, including the cases a stricter rule would get wrong: Mn nonspacing marks,
 *  because Thai "สระ" and "วรรณยุกต์" are Mn and appear in ordinary names; Co private use
 *  and Cn unassigned, which paint a tofu box a reader can see. A false reject silently blocks a real
 *  player, which is worse than the bug this closes, so anything not provably blank is a name.
 *
 *  ponytail: KNOWN CEILING — accepted-but-blank characters outside those three categories still get
 *  through. U+3164 HANGUL FILLER is Lo and U+2800 BRAILLE PATTERN BLANK is So, and both render as
 *  nothing; the copy-paste "invisible character" sites hand out exactly these. They are accepted on
 *  purpose rather than blacklisted, for the same reason the invisible codepoints are: naming them
 *  starts a list Unicode owns. If they turn up in real use, the upgrade is to narrow what counts as
 *  visible to a set we own (an allow-list of scripts this product actually serves), NOT to add two
 *  more codepoints here — that would rebuild the blacklist ADR-0026 tells us not to build. */
const VISIBLE_CHAR = /[^\p{White_Space}\p{Cf}\p{Cc}]/u;

export function hasVisibleChar(name: string): boolean {
  return VISIBLE_CHAR.test(name);
}

function read(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // The read-side drop: a blank stored before this guard existed disappears the first time the
    // list is loaded, so nobody needs a remove control to get rid of one.
    return Array.isArray(parsed)
      ? parsed.filter((n): n is string => typeof n === 'string' && hasVisibleChar(n))
      : [];
  } catch {
    return [];
  }
}

// What storage held the last time THIS page read or wrote each key. It is what makes the merge in
// saveToolNames a merge and not a resurrection: a name in storage that is NOT in here arrived from
// another tab and must survive; a name in here that is not in the list being saved was deleted in
// this tab's textarea and must not come back. Keyed by storage key because the key is handed in per
// page, and it lives in memory only — a reload re-seeds it from loadToolNames below.
const lastSeen = new Map<string, string[]>();

export function loadToolNames(key: string): string[] {
  const names = read(key);
  lastSeen.set(key, names);
  return names;
}

/** Runs `fn` inside the cross-tab critical section for one tool key, or straight through where there
 *  is no lock to take. Same discipline as src/shell/roster.ts's withLock, and deliberately NOT the
 *  same lock: each tool key is its own critical section, because ADR-0039 moved the tools off the
 *  stores the games share. Written here rather than imported from roster.ts because roster.ts already
 *  imports hasVisibleChar from this module — reusing its helper would make the two files a cycle.
 *  navigator.locks is absent in the Node test runner, on plain http and in Safari before 15.4, and
 *  request() itself rejects on an opaque origin (sandboxed iframe, file://); all three fall back to
 *  running unlocked, which is exactly the best-effort behaviour this function replaced — it still
 *  loses a concurrent write, but never throws and never silently drops one. */
function withLock(name: string, fn: () => void): Promise<void> {
  if (typeof navigator === 'undefined' || typeof navigator.locks?.request !== 'function') {
    fn();
    return Promise.resolve();
  }
  return navigator.locks.request(name, fn).catch(() => {
    fn();
  });
}

/** gh#132. The panel reads its list once, at mount, so by the time a tap lands that snapshot can be
 *  stale: another tab on the same phone typed the group's real names into the same key, and writing
 *  the snapshot back wholesale erased them. So the re-read sits INSIDE the lock — outside it, the
 *  value written back would still be one taken outside the critical section, and a lock around the
 *  write alone would fix nothing. Both halves go in together or neither does (roster.ts's add() says
 *  the same, and this is that pattern, not a new one).
 *
 *  A plain union with storage is the wrong fix and `lastSeen` is what rules it out: this panel is one
 *  textarea, so every keystroke deletes something: a name backspaced by one character would keep both
 *  the old and the new spelling, and a line the reader deleted on purpose would come back. Only names
 *  this page never saw carry over.
 *
 *  ponytail: membership is by value, so a duplicate — which parseNameLines keeps on purpose — that
 *  another tab added a second copy of is not carried over. Upgrade path if that ever matters: compare
 *  counts per name instead of `includes`. The callback stays synchronous on purpose: the lock is held
 *  for one microtask, so a tap queued behind it waits milliseconds. That holds only while nothing here
 *  awaits.
 *
 *  ponytail: KNOWN CEILING — this merge protects another tab's ADDITIONS, not its DELETIONS. If tab B
 *  removes name Z and tab A still shows Z in its textarea, A's next save writes Z back: Z is in
 *  `names`, and nothing here can tell "A never noticed B's delete" from "A means to keep Z". That is
 *  last-writer-wins on a genuine conflict, and it is deliberate — A's reader is still looking at Z, so
 *  silently dropping it would be its own surprise. It is also strictly better than the bug this
 *  replaced, which erased every name B had added. Upgrade path if deletions ever need to win: store a
 *  per-name tombstone with a timestamp alongside the value, so a delete can outrank a stale snapshot.
 *  Found by adversarial review 2026-08-30, not by a failing test — no test covers it, because a test
 *  would only pin the behaviour we already chose. */
export function saveToolNames(key: string, names: string[]): Promise<void> {
  return withLock(key, () => {
    const seen = lastSeen.get(key) ?? [];
    const fromOtherTabs = read(key).filter((n) => !seen.includes(n) && !names.includes(n));
    const merged = [...names, ...fromOtherTabs];
    try {
      localStorage.setItem(key, JSON.stringify(merged));
    } catch {
      return; // Storage unavailable — the panel keeps working in memory, and the snapshot stays as it was.
    }
    lastSeen.set(key, merged);
  });
}

/** The panel is one textarea, one name per line, so the names ARE the non-empty trimmed lines.
 *  Duplicates are KEPT on purpose: the box is what the reader sees, two people in one group really
 *  can both be "แนน", and swallowing the second line would make the panel disagree with its own
 *  contents. Uniqueness only ever existed to let a chip be removed by value, and the chips are gone.
 *  A line with no VISIBLE character is not a name and never becomes one (gh#133) — hasVisibleChar,
 *  not `length > 0`, because trim() leaves U+200B and U+2060 standing and the box would gain a row
 *  that shows nothing and cannot be told from the next one. */
export function parseNameLines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(hasVisibleChar);
}

/** One player's place in the list. `index` is the position in the roster the panel handed over, and
 *  it is the ONLY identity a round may eliminate by: parseNameLines keeps duplicates on purpose, so
 *  two players who both typed "แนน" are two slots that each own a turn. Keying elimination on the
 *  name string took them both out on one pick. */
export interface NameSlot {
  index: number;
  name: string;
}

/** The slots a round still has left. `eliminated` holds ROSTER POSITIONS, never names. */
export function remainingSlots(names: string[], eliminated: Set<number>): NameSlot[] {
  return names
    .map((name, index) => ({ index, name }))
    .filter((slot) => !eliminated.has(slot.index));
}

/** Pick tokens for one round. The pure pickers (wheel.ts pickName, draw.ts drawNames) take a
 *  string[] and hand a member back, so a caller can only invert the pick when every entry is
 *  distinct — names are not. A token is the OFFSET into `slots`, so `slots[Number(token)]` inverts
 *  it, and that same offset is what the wheel's landing angle is computed from: the answer is still
 *  picked first and the geometry derived from it, never read back off the wheel. */
export function slotTokens(slots: NameSlot[]): string[] {
  return slots.map((_, offset) => String(offset));
}
