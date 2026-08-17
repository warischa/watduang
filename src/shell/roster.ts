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

/** The last group that started a round — drops names no longer in the roster, so a removed name
 *  never comes back as a stuck ghost tick. Ordered as saved (= the order the player picked), not roster order. */
export function loadGroup(): string[] {
  const names = read(KEY);
  return read(GROUP_KEY).filter((n) => names.includes(n));
}

/** Stores raw, no clamp — the max ceiling belongs to each page, not to storage.
 *  A page with a smaller max clamps on use, so the old group is never permanently trimmed just because it passed through that page once. */
export function saveGroup(names: string[]): void {
  write(GROUP_KEY, names);
}

export function loadRoster(): Roster {
  let list = read(KEY);

  return {
    names(): string[] {
      return [...list];
    },
    add(name: string): void {
      const trimmed = name.trim();
      if (!trimmed) return;
      // #data-loss: re-read at the write, never at the load. localStorage is shared by every tab on the
      // domain, so the list captured above can be stale by the time this runs: tab B adds a name, tab A
      // adds another, and A writing its whole captured array back erases B's. Second hop, and the harm a
      // player sees: loadGroup() filters the saved group by roster names, so the pre-ticked group shrinks
      // with it.
      // Union, not adoption. Storage replacing memory would break the promise write() makes four lines
      // above: after a swallowed write (quota full, Safari private mode) storage is missing every name
      // typed since, so adopting it would erase them from the rendered list while their ticks are still
      // in `selected`. So this tab's names keep their typing order and whatever another tab added comes
      // after — both survive, and the two only stay apart while writing is broken.
      // ponytail: last-write-wins over a union is enough for a set of names typed by one person holding
      // one phone — no lock, no version. Its ceiling: a union cannot express a deletion, so if remove or
      // clear ever gets a caller (neither has one today) this add would resurrect a name another tab just
      // deleted. That needs tombstones or a version, not another re-read.
      list = [...list, ...read(KEY).filter((n) => !list.includes(n))];
      if (list.includes(trimmed)) return;
      list = [...list, trimmed];
      write(KEY, list);
    },
    remove(name: string): void {
      list = list.filter((n) => n !== name);
      write(KEY, list);
    },
    clear(): void {
      list = [];
      write(KEY, list);
    },
  };
}
