// Pure แบ่งทีม logic — never touches DOM, localStorage, or sessionStorage.
// Memoising the result is forbidden: draw fresh randomness on every call, otherwise pressing "แบ่งใหม่"
// again with the same team count hands back the previous split frozen in place.
// Unlike draw.ts, this always receives the FULL roster rather than a shrinking box, so the
// party-size rule genuinely belongs here.
const MIN_NAMES = 2;

/** Shuffle the names and deal them into `teamCount` teams whose sizes differ by at most one.
 *  `random` must return a value in [0, 1), same contract as Math.random. */
export function splitTeams(
  names: string[],
  teamCount: number,
  random: () => number = Math.random,
): string[][] {
  if (names.length < MIN_NAMES) {
    throw new Error(`แบ่งทีมต้องมีชื่ออย่างน้อย ${MIN_NAMES} คน (ตอนนี้มี ${names.length} คน)`);
  }
  if (teamCount < 1) {
    throw new Error('จำนวนทีมต้องมีอย่างน้อย 1 ทีม');
  }
  if (teamCount > names.length) {
    throw new Error(`ขอ ${teamCount} ทีมไม่ได้ เพราะมีคนแค่ ${names.length} คน (ทีมนึงต้องมีอย่างน้อย 1 คน)`);
  }

  // Fisher-Yates shuffle, driven by the injected random source
  const shuffled = [...names];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1))); // clamp in case random() returns exactly 1
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  // Round-robin deal: on an uneven split the earliest teams take the extra member,
  // which is what makes "who got the extra" visible from the team sizes alone

  const teams: string[][] = Array.from({ length: teamCount }, () => []);
  shuffled.forEach((name, index) => {
    teams[index % teamCount]!.push(name);
  });

  return teams;
}
