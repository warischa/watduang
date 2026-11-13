// gh#307 -- the ladder game of the company New Year prize draw (gh#299), on its own page. The game plays
// inside a real event on the prize-draw projector (src/play/prize-draw/); this module registers its own
// play route, where it runs a fixed DEMO outcome in memory (src/play/_prize-reveal/demo.ts) and stores
// nothing. Like every play-route game it has no /game/<id>/ landing of the shell's, so mount() is empty.
//
// Copy: `names.th` is the game name the ladder board prints (the shared GAME_NAME in
// src/play/_prize-reveal/reveal.ts). No board carries any other field here; the rest is owner-approved copy (2026-11-13),
// applied byte for byte.
// `players` is the head-count range the event this game plays in enforces (MIN_HEADS..MAX_HEADS), never a
// 2-10 claim.
import type { GameModule } from './types.ts';
import { MAX_HEADS, MIN_HEADS } from '../prize-event/event.ts';

const game: GameModule = {
  id: 'prize-ladder',
  names: { th: 'ทางแยกเลือกเส้น', en: 'Pick Your Path' },
  category: 'company-party',
  players: [MIN_HEADS, MAX_HEADS],
  renderer: 'webgl',
  // The demo keeps nothing between loads: a refresh replays it, so there is no round to lose by leaving.
  startsRound: false,
  keywords: [
    'ทางแยกเลือกเส้น',
    'เกมงานเลี้ยงบริษัท',
    'จับรางวัลปีใหม่',
    'รอบชิงรางวัล',
    'เกมเลือกเส้นทาง',
  ],
  tagline: '5 คนสุดท้ายเลือกเส้นทาง แล้วเฉลยทีละขั้นว่าใครได้รางวัลไหน',
  seo: {
    title: 'ทางแยกเลือกเส้น — เกมงานเลี้ยงบริษัท รอบชิงรางวัลบนจอใหญ่',
    description:
      'ทางแยกเลือกเส้นสำหรับรอบชิงในงานเลี้ยงบริษัท 5 คนสุดท้ายเลือกเส้นทางของตัวเอง แล้วเฉลยบันไดทีละขั้นว่าใครได้รางวัลไหน เส้นที่เลือกไม่เปลี่ยนโอกาส ใช้ได้ 1 ถึง 5 รางวัล ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'เปิดหน้านี้บนจอใหญ่เพื่อดูตัวอย่าง',
      'เลือกจำนวนรางวัล แล้วกด เปิดผล ดูเส้นทางเฉลยทีละขั้น',
      'ใช้ในงานจริงได้จากหน้าจับรางวัลปีใหม่ เลือกทางแยกเลือกเส้นให้รอบชิง',
    ],
  },
  og: 'prize-ladder.png',
  cardArt: 'prize-ladder.webp',
  cardArt2x: 'prize-ladder-2x.webp',
  // No page of this game carries an ad slot: it has no setup page, and a play route never carries one.
  ads: false,
  playRoute: '/game/prize-ladder/play/',
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
