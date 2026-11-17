// Every string the marble-race reveal draws, verbatim from the picked board (design/Gh316Marbles.dc.html,
// COPY SOURCES row, approved by the owner 2026-11-16) or from the gh#302 copy the 2D reveal already ships.
// A figure inside a string is the only part that varies, exactly where the board varies it. A string the
// board does not have is an owner placeholder, never new copy.

export const COPY = {
  gameName: 'แข่งลูกแก้ว',
  people: 'คน',
  passed: 'ผ่าน',
  notPassed: 'ไม่ผ่าน',
  finishLabel: 'เส้นชัย',
  roundLabel: (round: number, rounds: number): string => `รอบที่ ${round} จาก ${rounds}`,
  heatCounter: (heat: number, heats: number): string => `ชุดที่ ${heat} จาก ${heats}`,
  /** The rule said on screen through the race and at the freeze; the figure is the round's survivor count. */
  freezeLine: (kept: number): string => `ครบ ${kept} คน ลูกแก้วที่ข้ามเส้นชัย อยู่ต่อ`,
  passedRound: (round: number): string => `ผ่านรอบที่ ${round}`,
} as const;
