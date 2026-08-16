// Pure random-number-in-range logic — never touches DOM, localStorage, or sessionStorage.
// No-repeat mode is the caller's job: it passes `drawn` (numbers already used) in and this filters them out.
const MIN_RANGE_SIZE = 2;
// ponytail: hard cap so the candidates array below can never blow up the tab. A party tool has no use for a
// wider range, and without this a range like 1-999999999 allocates ~1e9 entries and hangs the phone.
const MAX_RANGE_SIZE = 10000;

/** Pick one number in [min, max], both ends inclusive.
 *  Pass `drawn` to stop previously drawn numbers coming out again (no-repeat mode) — leave it empty for repeats.
 *  `random` must return a value in [0, 1), same contract as Math.random. */
export function pickNumber(
  min: number,
  max: number,
  drawn: number[] = [],
  random: () => number = Math.random,
): number {
  if (min > max) {
    throw new Error(`ช่วงตัวเลขผิด: ต่ำสุด (${min}) ต้องไม่มากกว่าสูงสุด (${max})`);
  }
  const rangeSize = max - min + 1;
  if (rangeSize < MIN_RANGE_SIZE) {
    throw new Error(`ช่วงตัวเลขต้องมีอย่างน้อย ${MIN_RANGE_SIZE} ค่า (ตอนนี้มี ${rangeSize} ค่า)`);
  }
  if (rangeSize > MAX_RANGE_SIZE) {
    throw new Error(`ช่วงตัวเลขกว้างได้ไม่เกิน ${MAX_RANGE_SIZE} ค่า (ตอนนี้กว้าง ${rangeSize} ค่า)`);
  }

  const drawnSet = new Set(drawn);
  const candidates: number[] = [];
  for (let n = min; n <= max; n++) {
    if (!drawnSet.has(n)) candidates.push(n);
  }
  if (candidates.length === 0) {
    throw new Error(`สุ่มครบทุกเลขในช่วง ${min}-${max} แล้ว — เริ่มรอบใหม่เพื่อสุ่มต่อ`);
  }

  // clamp in case random() returns exactly 1, which would index past the end of the list
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return candidates[index]!;
}
