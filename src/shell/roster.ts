// รายชื่อผู้เล่นข้ามรอบ ข้ามเกม — localStorage (ทุกครั้งที่แตะ storage ต้อง try/catch, issue #7)
import type { Roster } from '../games/types';

const KEY = 'watduang:roster';

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

function write(list: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // เต็มโควต้าหรือ Safari private mode — เก็บใน memory ต่อไปในหน้านี้ ไม่ throw
  }
}

export function loadRoster(): Roster {
  let list = read();

  return {
    names(): string[] {
      return [...list];
    },
    add(name: string): void {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (list.includes(trimmed)) return;
      list = [...list, trimmed];
      write(list);
    },
    remove(name: string): void {
      list = list.filter((n) => n !== name);
      write(list);
    },
    clear(): void {
      list = [];
      write(list);
    },
  };
}
