// Every string the ladder reveal draws, verbatim from the picked board (design/Gh303Ladder.dc.html, COPY
// SOURCES row: new strings approved by the owner 2026-11-11, the rest gh#302 board copy or the gh#299 game
// name). A figure inside a string is the only part that varies, exactly where the board varies it. A string
// the board does not have is an owner placeholder, never new copy.

export const COPY = {
  finalLabel: 'รอบชิงรางวัล',
  gameName: 'ทางแยกเลือกเส้น',
  /** The hud while the picks stand (ld-idle, ld-few). */
  picked: 'แต่ละคนเลือกเส้นแล้ว',
  /** The hud while the lights run, one finalist at a time (ld-reveal B). */
  oneAtATime: 'เปิดทางทีละคน',
  /** A slot, or a result card, that wins nothing; the slot carries the thank-you line under it. */
  noPrize: 'ไม่มีรางวัล',
  noPrizeLine: 'ขอบคุณที่ร่วมลุ้น',
  winnersHeading: 'ผู้ได้รับรางวัล',
  claim: 'ผู้ได้รางวัล เปิดหน้าผลในมือถือให้ทีมงานดู ชื่อต้องตรงกับบนจอนี้',
  prizeLabel: (place: number): string => `รางวัลที่ ${place}`,
  /** The gh#302 result line: the prize name after the place, when the MC typed one. */
  prizeLine: (place: number, prize: string): string => (prize ? `รางวัลที่ ${place} · ${prize}` : `รางวัลที่ ${place}`),
} as const;
