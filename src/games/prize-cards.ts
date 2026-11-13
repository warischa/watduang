// gh#306 -- the cards game of the company New Year prize draw (gh#299), on its own page. The game plays
// inside a real event on the prize-draw projector (src/play/prize-draw/); this module registers its own
// play route, where it runs a fixed DEMO outcome in memory (src/play/_prize-reveal/demo.ts) and stores
// nothing. Like every play-route game it has no /game/<id>/ landing of the shell's, so mount() is empty.
//
// Copy: `names.th` is the game name the projector board prints (the shared GAME_NAME in
// src/play/_prize-reveal/reveal.ts). No board carries any other field here; the rest is owner-approved copy (2026-11-13),
// applied byte for byte.
// `players` is the head-count range the event this game plays in enforces (MIN_HEADS..MAX_HEADS), never a
// 2-10 claim.
import type { GameModule } from './types.ts';
import { MAX_HEADS, MIN_HEADS } from '../prize-event/event.ts';

const game: GameModule = {
  id: 'prize-cards',
  names: { th: 'ไพ่แจกทั้งห้อง', en: 'Cards for the Whole Room' },
  category: 'company-party',
  players: [MIN_HEADS, MAX_HEADS],
  renderer: 'webgl',
  // The demo keeps nothing between loads: a refresh replays it, so there is no round to lose by leaving.
  startsRound: false,
  keywords: [
    'ไพ่แจกทั้งห้อง',
    'เกมงานเลี้ยงบริษัท',
    'จับรางวัลปีใหม่',
    'สุ่มคัดออกบนจอใหญ่',
    'แจกไพ่คัดออก',
  ],
  tagline: 'ทุกคนได้ไพ่คนละใบ สุ่มกติกาหลังแจก แล้วพลิกไพ่พร้อมกัน',
  seo: {
    title: 'ไพ่แจกทั้งห้อง — เกมงานเลี้ยงบริษัท แจกไพ่คัดออกบนจอใหญ่',
    description:
      'ไพ่แจกทั้งห้องสำหรับงานเลี้ยงบริษัท ทุกคนได้ไพ่คนละใบแบบคว่ำ สุ่มกติกาหลังแจกเสร็จ แล้วพลิกไพ่พร้อมกัน คนที่ผ่านตรงกับจำนวนในตารางพอดี ใช้เป็นรอบคัดออกในจับรางวัลปีใหม่ ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'เปิดหน้านี้บนจอใหญ่เพื่อดูตัวอย่าง',
      'กด แจกไพ่ แล้วกด เปิดผล เพื่อสุ่มกติกาและพลิกไพ่',
      'ใช้ในงานจริงได้จากหน้าจับรางวัลปีใหม่ เลือกไพ่แจกทั้งห้องให้รอบคัดออกที่ต้องการ',
    ],
  },
  og: 'prize-cards.png',
  cardArt: 'prize-cards.webp',
  cardArt2x: 'prize-cards-2x.webp',
  // No page of this game carries an ad slot: it has no setup page, and a play route never carries one.
  ads: false,
  playRoute: '/game/prize-cards/play/',
  firstScreenRoots: {
    '#pr-live': 'chrome',
    '#app': 'gameplay',
  },

  // No shell landing renders this module (getStaticPaths in src/pages/game/[id].astro skips a game with
  // a playRoute), so there is nothing to mount and nothing to dispose.
  mount() {},
  dispose() {},
};

export default game;
