// ตรรกะล้วนๆ ไม่แตะ DOM/localStorage — ให้ PlayerSetup.astro เรียกใช้ตอนกดเริ่มรอบ (#21)
// รับ "วงเต็มที่ติ๊กไว้" เข้ามาเสมอ ไม่ใช่ pool ที่เหลือหลัง clamp แล้ว (ADR-0004 แก้ไขเรื่องนี้ไว้)

export interface StartResolution {
  /** คนที่จะได้เล่นจริงในหน้านี้ — ผ่าน clamp ที่ max แล้ว */
  playing: string[];
  /** คนที่ถูกตัดออกเพราะเกิน max ของหน้านี้ — ยังอยู่ในวงที่บันทึกไว้ ไม่ได้หายไปไหน */
  sittingOut: string[];
  /** true = ยังเริ่มไม่ได้ (ต่ำกว่า min) ต้องปฏิเสธ */
  belowMin: boolean;
  /** true = เกิน max แล้วต้องเตือนให้เห็นก่อน (ยังไม่เคยเตือนรอบนี้) */
  needsOverMaxWarning: boolean;
}

/** สร้างรายชื่อ "คนที่ 1..N" จากจำนวนที่กรอก — clamp ให้อยู่ในช่วง [min, max] ของหน้านั้นเสมอ
 *  ใช้ทั้งตอน selected ว่าง (implicit) และตอนกดปุ่ม "คนที่ 1, 2, 3…" ตรงๆ (#22) */
export function numberedPlayers(count: number, min: number, max: number): string[] {
  const n = Math.min(max, Math.max(min, count || min));
  return Array.from({ length: n }, (_, i) => `คนที่ ${i + 1}`);
}

/** selected คือวงเต็มตามที่ผู้ใช้ติ๊กไว้ (หรือ "คนที่ 1..count" ตอนไม่ได้ติ๊กใครเลย)
 *  warned = ผู้ใช้เพิ่งเห็นคำเตือนเกิน-max แล้วกดซ้ำเพื่อยืนยันไปต่อ */
export function resolveStart(
  selected: string[],
  min: number,
  max: number,
  warned: boolean,
): StartResolution {
  const playing = selected.slice(0, max);
  const sittingOut = selected.slice(max);
  const need = Math.max(min, 1);

  return {
    playing,
    sittingOut,
    belowMin: playing.length < need,
    needsOverMaxWarning: sittingOut.length > 0 && !warned,
  };
}
