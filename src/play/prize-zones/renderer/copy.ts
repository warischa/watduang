// Every string the zones reveal draws, verbatim from the picked board (design/Gh315Zones.dc.html, COPY SOURCES
// row, approved by the owner 2026-11-16 as it stands) or from the gh#302 copy the 2D reveal already ships. A
// figure inside a string is the only part that varies, exactly where the board varies it. A string the board
// does not have is an owner placeholder, never new copy.
//
// The zone-badge count keeps the board's seated-count pattern at zero too: the generator's other wording for a
// zone nobody sat in never reached a frame, so it never reached COPY SOURCES and the owner never saw it.

export const COPY = {
  gameName: 'โซนสีลุกยืน',
  people: 'คน',
  passed: 'ผ่าน',
  notPassed: 'ไม่ผ่าน',
  /** The pre-draw frame (zn-idle): the band's label over the game name, gh#302 copy. */
  gameCardLabel: 'เกมรอบนี้',
  /** The pre-draw frame (zn-idle): right of the band. */
  idlePrompt: 'พิธีกรกดเริ่ม แล้วยืนในโซนสีของตัวเอง',
  /** Right of the band while the wave lands. */
  outSit: 'ชื่อที่ไม่ผ่าน นั่งลง',
  /** A zone whose verdict has not landed yet. */
  standUp: 'ยืนขึ้น',
  /** The four zone names, in panel order (left to right, top to bottom). */
  zoneLabel: ['โซนสีชมพู', 'โซนสีฟ้า', 'โซนสีม่วง', 'โซนสีขาว'],
  seated: (n: number): string => `นั่ง ${n}`,
  zoneCounter: (zone: number, zones: number): string => `โซนที่ ${zone} จาก ${zones}`,
  roundLabel: (round: number, rounds: number): string => `รอบที่ ${round} จาก ${rounds}`,
  passedRound: (round: number): string => `ผ่านรอบที่ ${round}`,
} as const;
