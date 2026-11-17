// Every string the envelopes reveal draws, verbatim from the picked board (design/Gh317Envelopes.dc.html, COPY
// SOURCES row: its new strings approved by the owner 2026-11-16 as E1, the rest gh#302 / gh#303 picked board
// copy or the gh#299 game name). A figure inside a string is the only part that varies, exactly where the board
// varies it. A string the board does not have is an owner placeholder, never new copy.

export const COPY = {
  finalLabel: 'รอบชิงรางวัล',
  gameName: 'ซองของขวัญ',
  /** The heading band while the picks stand (env-idle). */
  idle: 'ผู้เข้ารอบชิง 5 คน เลือกซองของขวัญคนละซอง',
  idleStatus: 'เลือกแล้ว รอเปิดรอบชิง',
  idleNote: 'ซองของขวัญปิดอยู่ รางวัลอยู่ข้างใน',
  /** While the envelopes open one at a time (env-rv-one). */
  oneAtATime: 'เปิดทีละซอง · ซองไม่มีรางวัลก่อน รางวัลที่ 1 เปิดสุดท้าย',
  opened: (k: number): string => `เปิดแล้ว ${k} จาก 5 ซอง`,
  lastNote: 'รางวัลที่ 1 เปิดสุดท้าย',
  /** Every envelope open (env-few). */
  allOpen: 'เปิดครบ 5 ซอง',
  onePrize: 'รางวัลเดียว · ซองที่เหลือไม่มีรางวัล',
  /** The unit beside the prize count in the lower band. */
  unit: 'รางวัล',
  /** A slot that wins nothing, and the line under it (the gh#303 L2 pick). */
  noPrize: 'ไม่มีรางวัล',
  noPrizeLine: 'ขอบคุณที่ร่วมลุ้น',
  /** The result's heading (env-result) and the claim line under the row. */
  winnersHeading: 'ผู้ได้รับรางวัล',
  claim: 'ผู้ได้รางวัล เปิดหน้าผลในมือถือให้ทีมงานดู ชื่อต้องตรงกับบนจอนี้',
  prizeLabel: (place: number): string => `รางวัลที่ ${place}`,
} as const;
