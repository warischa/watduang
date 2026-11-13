// Test-only: the two prize-draw writers that shipped before gh#313, as a tab that loaded that code before the
// deploy still runs them. Tabs survive a deploy indefinitely, so the new store must stay safe beside them.
// Modelled from that code's own protocol (its event.ts withEventLock, its projector stage.ts, its setup page):
//   - every write takes the exclusive Web Lock named STORAGE_KEY, with a SYNCHRONOUS callback; no lock
//     manager (navigator.locks absent) means no write at all, and no event on the projector;
//   - projector: holds the text it last read or wrote (`seen`); a press, once granted, re-reads the key;
//     any other text is taken up instead (decodeEvent, so the new store's seal reads as no event: cold);
//     the same text is walked one step (ready -> drawn written, then revealed written; drawn -> revealed;
//     revealed -> next), every step written to the key;
//   - setup page: writes its new event to the key unconditionally, inside the lock.
// The pure walk (decodeEvent, drawNext, revealDrawn, advance) is the shipped code's, unchanged since. A write
// goes straight into the origin's shared localStorage map, as every test here seeds the old key.
import { STORAGE_KEY, advance, decodeEvent, drawNext, encodeEvent, position, revealDrawn } from './event.ts';

export function legacyProjector(origin, tab, rng) {
  const locks = tab.navigator?.locks ?? null;
  const read = () => {
    if (!locks) return { raw: null, state: null };
    const raw = origin.localStorage.has(STORAGE_KEY) ? origin.localStorage.get(STORAGE_KEY) : null;
    return { raw, state: decodeEvent(raw) };
  };
  const first = read();
  let seen = first.raw;
  let state = first.state;
  let busy = false;
  /** Every text this tab wrote to the key, in order. */
  const writes = [];
  const write = (next) => {
    const raw = encodeEvent(next);
    origin.localStorage.set(STORAGE_KEY, raw);
    writes.push(raw);
    seen = raw;
    state = next;
  };
  const hasButton = () => Boolean(state) && !(position(state).kind === 'final' && state.at === 'revealed');
  return {
    writes,
    current: () => state,
    seen: () => seen,
    hasButton,
    /** The MC's tap. False when the screen offers no button. Resolves once the lock was granted and run. */
    press() {
      if (!locks || !hasButton() || busy) return false;
      busy = true;
      return Promise.resolve(
        locks.request(STORAGE_KEY, () => {
          busy = false;
          const now = read();
          if (now.raw !== seen) {
            seen = now.raw;
            state = now.state;
            return;
          }
          if (!state) return;
          const at = state.at;
          if (at === 'ready') {
            const drawn = drawNext(state, rng);
            write(drawn);
            write(revealDrawn(drawn));
          } else if (at === 'drawn') write(revealDrawn(state));
          else write(advance(state));
        }),
      ).catch(() => (busy = false));
    },
    /** Its storage-event follower. */
    follow() {
      const now = read();
      if (now.raw !== seen) {
        seen = now.raw;
        state = now.state;
      }
    },
  };
}

/** The old setup page's start: stores `event` over whatever the key holds, inside the lock. */
export function legacySetupStart(origin, tab, event) {
  const locks = tab.navigator?.locks ?? null;
  if (!locks) return Promise.resolve(false);
  return Promise.resolve(
    locks.request(STORAGE_KEY, () => {
      origin.localStorage.set(STORAGE_KEY, encodeEvent(event));
      return true;
    }),
  ).catch(() => false);
}
