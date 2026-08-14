// Pure จับฉลาก logic — never touches DOM, localStorage, or sessionStorage.
// Tracking who has already been drawn is the caller's job: it passes the remaining box down, same as wheel.ts.
// There is deliberately no "at least 2 names" guard here — that is a party-size rule the page enforces against
// the full roster. Enforcing it on `pool` would strand the last name, because `pool` IS the remaining box.

/** Draw `count` names out of `pool`, none repeating within the result, from an injected random source
 *  (so tests can drive it). `random` must return a value in [0, 1), same contract as Math.random. */
export function drawNames(pool: string[], count: number, random: () => number = Math.random): string[] {
  if (count < 1) {
    throw new Error('ต้องจับฉลากอย่างน้อย 1 คน');
  }
  if (count > pool.length) {
    throw new Error(`เหลือชื่อในกล่องแค่ ${pool.length} คน จับ ${count} คนไม่ได้`);
  }

  const box = [...pool];
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    // clamp in case random() returns exactly 1, which would index past the end of the box
    const index = Math.min(box.length - 1, Math.floor(random() * box.length));
    picked.push(box[index]!);
    box.splice(index, 1); // drop it from the box so one round can never hand out the same name twice
  }
  return picked;
}
