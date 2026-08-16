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
