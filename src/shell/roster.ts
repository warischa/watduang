// รายชื่อผู้เล่นข้ามรอบ ข้ามเกม — localStorage (ทุกครั้งที่แตะ storage ต้อง try/catch, issue #7)
import type { Roster } from '../games/types';

const KEY = 'watduang:roster';
// "วง" = subset ของ roster ที่กำลังเล่นจริง — คนละคีย์กับ roster โดยตั้งใจ (#15)
// ผู้ใช้เก่ามี string[] ดิบอยู่ใต้ KEY แล้ว เปลี่ยนรูปคีย์เดิมเป็น object = รายชื่อเขาหายเงียบๆ
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
    // เต็มโควต้าหรือ Safari private mode — เก็บใน memory ต่อไปในหน้านี้ ไม่ throw
  }
}

/** วงล่าสุดที่เริ่มรอบไปแล้ว — ตัดชื่อที่ไม่อยู่ใน roster แล้วทิ้ง ไม่ให้ลบชื่อแล้วมันกลับมาเป็นผีที่ติ๊กค้าง
 *  เรียงตามลำดับที่บันทึกไว้ (= ลำดับที่ผู้เล่นเลือก) ไม่ใช่ลำดับ roster */
export function loadGroup(): string[] {
  const names = read(KEY);
  return read(GROUP_KEY).filter((n) => names.includes(n));
}

/** เก็บดิบ ไม่ clamp — เพดาน max เป็นของแต่ละหน้า ไม่ใช่ของ storage
 *  หน้าที่ max เล็กกว่าตัดตอนใช้เอง วงเดิมจึงไม่ถูกหั่นถาวรเพราะเดินผ่านหน้านั้นครั้งเดียว */
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
