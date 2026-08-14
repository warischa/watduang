// ตรรกะบริสุทธิ์ของ "วงล้อสุ่มชื่อ" — ไม่แตะ DOM/localStorage/sessionStorage
// ตาม docs/adr/0004: หมุนซ้ำโดยตัดชื่อที่เคยออกแล้วเป็นหน้าที่ผู้เรียก (ส่งลิสต์สั้นลงมา)
const MIN_NAMES = 2;

/** สุ่มเลือกชื่อหนึ่งชื่อจากลิสต์ ด้วยแหล่งสุ่มที่ฉีดเข้ามา (ควบคุมได้จากเทส)
 *  random ต้องคืนค่าในช่วง [0, 1) แบบเดียวกับ Math.random */
export function pickName(names: string[], random: () => number = Math.random): string {
  if (names.length < MIN_NAMES) {
    throw new Error(`วงล้อสุ่มต้องมีชื่ออย่างน้อย ${MIN_NAMES} คน (ตอนนี้มี ${names.length} คน)`);
  }
  // clamp กัน random() คืน 1 พอดี ไม่งั้น index จะหลุดขอบท้ายลิสต์
  const index = Math.min(names.length - 1, Math.floor(random() * names.length));
  return names[index]!;
}
