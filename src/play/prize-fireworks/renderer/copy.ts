// Every string the fireworks reveal draws, verbatim from the picked board (design/Gh303Fireworks.dc.html,
// COPY SOURCES row, approved by the owner 2026-11-11) or from the gh#302 copy the 2D reveal already ships.
// A figure inside a string is the only part that varies, exactly where the board varies it. A string the
// board does not have is an owner placeholder, never new copy.

export const COPY = {
  gameName: 'พลุนับถอยหลัง',
  countdownLabel: 'ทั้งห้องนับพร้อมกัน',
  countdownAtZero: 'ถึง 0 แล้วพลุจะขึ้น',
  legendLine: 'โคมที่ดับ คือชื่อที่ไม่ผ่าน',
  people: 'คน',
  passed: 'ผ่าน',
  notPassed: 'ไม่ผ่าน',
  finalLabel: 'รอบชิงรางวัล',
  finalRule: 'พลุลูกสุดท้ายที่ยังลอยอยู่ ได้รางวัลที่ 1',
  winnersHeading: 'ผู้ได้รับรางวัล',
  /** A rank past the prize count: the picked no-prize slot string of design/Gh303Ladder.dc.html (owner
   *  popup L2, approved 2026-11-11), the one board string for a finalist whose rank wins nothing. */
  noPrize: 'ไม่มีรางวัล',
  roundLabel: (round: number, rounds: number): string => `รอบที่ ${round} จาก ${rounds}`,
  burstCounter: (burst: number, bursts: number): string => `พลุลูกที่ ${burst} จาก ${bursts}`,
  passedRound: (round: number): string => `ผ่านรอบที่ ${round}`,
  stillUp: (n: number): string => `ยังลอยอยู่ ${n} ลูก`,
  prizeLabel: (place: number): string => `รางวัลที่ ${place}`,
  /** The gh#302 result line: the prize name after the place, when the MC typed one. */
  prizeLine: (place: number, prize: string): string => (prize ? `รางวัลที่ ${place} · ${prize}` : `รางวัลที่ ${place}`),
} as const;
