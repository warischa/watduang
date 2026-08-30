// One cross-tab critical section helper for every localStorage key this site writes from more than
// one place. It lives in its own module, imported by both src/shell/roster.ts and src/tools/name-list.ts,
// because roster.ts already imports hasVisibleChar from name-list.ts — keeping the helper in either of
// them and importing it from the other would make the two files a cycle.

/** Runs `fn` inside the cross-tab critical section named `name`, or straight through where there is
 *  no lock to take. The name is a parameter, never a module constant: each key is its own critical
 *  section — the roster key for the "สุ่มคนโดน" games, one key per tool page (ADR-0039 moved the
 *  tools off the stores the games share) — and one shared name would queue unrelated writers.
 *
 *  navigator.locks is absent in the Node test runner and in any non-secure context (plain http, Safari
 *  before 15.4), and request() itself rejects on an opaque origin (sandboxed iframe, file://). All three
 *  fall back to running unlocked — the old best-effort behaviour, which still loses a concurrent write,
 *  but never throws and never silently drops one. Re-running `fn` on the rejection path is safe: the
 *  callers' mutations are idempotent (roster add() returns early on a name the list already holds).
 *
 *  scripts/roster-lock-structure-check.mjs gates the STRUCTURE of every call site: the re-read sits
 *  inside the callback and the callback stays synchronous. The committed unit tests all exercise the
 *  no-lock fallback branch (roster.test.mjs asserts the Node runner has no navigator.locks); the only
 *  committed check of the locked path is a mocked one in roster.test.mjs. Real two-tab behaviour is
 *  proven only by the manual scripts/roster-lock-two-tab-race.mjs. */
export function withLock(name: string, fn: () => void): Promise<void> {
  if (typeof navigator === 'undefined' || typeof navigator.locks?.request !== 'function') {
    fn();
    return Promise.resolve();
  }
  return navigator.locks.request(name, fn).catch(() => {
    fn();
  });
}
