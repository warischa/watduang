// Every string the flipcards reveal draws, verbatim from the picked board (design/Gh318Cards.dc.html, COPY
// SOURCES row: its new strings approved by the owner 2026-11-16 as C1, the rest gh#302 / gh#303 picked board
// copy or the gh#299 game name). A figure inside a string is the only part that varies, exactly where the board
// varies it. A string the board does not have is an owner placeholder, never new copy.

export const COPY = {
  finalLabel: 'รอบชิงรางวัล',
  gameName: 'เปิดไพ่ชิงรางวัล',
  /** The heading band while the picks stand (card-idle). */
  idle: 'ผู้เข้ารอบชิง 5 คน เลือกไพ่คว่ำคนละใบ',
  idleStatus: 'เลือกไพ่แล้ว รอเปิดรอบชิง',
  idleNote: 'ไพ่คว่ำหน้า รางวัลอยู่ด้านหลัง',
  /** While the cards turn one at a time (card-rv-one). */
  oneAtATime: 'เปิดทีละใบ · ใบไม่มีรางวัลก่อน รางวัลที่ 1 เปิดสุดท้าย',
  opened: (k: number): string => `เปิดแล้ว ${k} จาก 5 ใบ`,
  lastNote: 'รางวัลที่ 1 เปิดสุดท้าย',
  /** Every card face up (card-few). */
  allOpen: 'เปิดครบ 5 ใบ',
  onePrize: 'รางวัลเดียว · ใบที่เหลือไม่มีรางวัล',
  /** The unit beside the prize count in the lower band. */
  unit: 'รางวัล',
  /** A face that wins nothing, and the line under it (the gh#303 L2 pick). */
  noPrize: 'ไม่มีรางวัล',
  noPrizeLine: 'ขอบคุณที่ร่วมลุ้น',
  /** The result's heading (card-result) and the claim line under the row. */
  winnersHeading: 'ผู้ได้รับรางวัล',
  claim: 'ผู้ได้รางวัล เปิดหน้าผลในมือถือให้ทีมงานดู ชื่อต้องตรงกับบนจอนี้',
  prizeLabel: (place: number): string => `รางวัลที่ ${place}`,
} as const;
