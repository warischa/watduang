// Every string the cards reveal draws, verbatim from the picked board (design/Gh303Cards.dc.html, COPY
// SOURCES row, approved by the owner 2026-11-11) or from the gh#299 body the board cites for the game name
// and the three card rules. A figure inside a string is the only part that varies, exactly where the board
// varies it. A string the board does not have is an owner placeholder, never new copy.

import type { RuleId } from '../../../prize-draw/cards.ts';

export const COPY = {
  gameName: 'ไพ่แจกทั้งห้อง',
  people: 'คน',
  notDrawnYet: 'ไพ่ของใครของมัน กติกายังไม่ได้สุ่ม',
  ruleLabel: 'กติการอบนี้',
  allAtOnce: 'เปิดพร้อมกันทั้งห้อง',
  passed: 'ผ่าน',
  notPassed: 'ไม่ผ่าน',
  /** The rule as the rule card and the band show it: the gh#299 sketch wording, all three. */
  rule: {
    black: 'ดำอยู่ต่อ',
    clubs: 'ดอกจิกเท่านั้น',
    face: 'เฉพาะไพ่หน้าคน',
  } satisfies Record<RuleId, string>,
  /** The rule said in full, right of the band. The board writes it for the black rule; the owner approved
   *  the other two (gh#305). */
  ruleInFull: {
    black: 'ไพ่ดำอยู่ต่อ ไพ่แดงตกรอบ',
    clubs: 'ดอกจิกอยู่ต่อ ดอกอื่นตกรอบ',
    face: 'ไพ่หน้าคนอยู่ต่อ ไพ่อื่นตกรอบ',
  } satisfies Record<RuleId, string>,
  dealt: (cards: number): string => `แจกไพ่แล้ว ${cards} ใบ`,
  roundLabel: (round: number, rounds: number): string => `รอบที่ ${round} จาก ${rounds}`,
  passedRound: (round: number): string => `ผ่านรอบที่ ${round}`,
} as const;

/** Rank labels on a face: the ace and the court cards by letter, as the board draws them. */
export function rankLabel(rank: number): string {
  return rank === 1 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank === 13 ? 'K' : String(rank);
}
