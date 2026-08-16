// Pure logic for the name wheel — never touches DOM/localStorage/sessionStorage
// Per docs/adr/0004: re-spinning with already-drawn names removed is the caller's job (pass a shorter list down)
const MIN_NAMES = 2;

/** Pick one name at random from the list, using an injected random source (controllable from tests).
 *  random must return a value in [0, 1), same contract as Math.random. */
export function pickName(names: string[], random: () => number = Math.random): string {
  if (names.length < MIN_NAMES) {
    throw new Error(`วงล้อสุ่มต้องมีชื่ออย่างน้อย ${MIN_NAMES} คน (ตอนนี้มี ${names.length} คน)`);
  }
  // clamp in case random() returns exactly 1, which would index past the end of the list
  const index = Math.min(names.length - 1, Math.floor(random() * names.length));
  return names[index]!;
}
