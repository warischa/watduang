// gh#305 -- the fireworks game of the company New Year prize draw (gh#299), on its own page. The game plays
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
  id: 'prize-fireworks',
  names: { th: 'พลุนับถอยหลัง', en: 'Countdown Fireworks' },
  category: 'company-party',
  players: [MIN_HEADS, MAX_HEADS],
  renderer: 'webgl',
  // The demo keeps nothing between loads: a refresh replays it, so there is no round to lose by leaving.
  startsRound: false,
  keywords: [
    'พลุนับถอยหลัง',
    'เกมงานเลี้ยงบริษัท',
    'จับรางวัลปีใหม่',
    'สุ่มคัดออกบนจอใหญ่',
    'เกมนับถอยหลังปีใหม่',
  ],
  tagline: 'นับถอยหลัง 10 ถึง 0 แล้วพลุจุด โคมของคนที่ตกรอบดับลง',
  seo: {
    title: 'พลุนับถอยหลัง — เกมงานเลี้ยงบริษัท คัดออกด้วยพลุบนจอใหญ่',
    description:
      'พลุนับถอยหลังสำหรับงานเลี้ยงบริษัท นับถอยหลังพร้อมกันทั้งห้อง พลุจุด โคมของคนที่ตกรอบดับลง ใช้เป็นรอบคัดออกหรือรอบชิงในจับรางวัลปีใหม่ ทุกคนมีโอกาสเท่ากัน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'เปิดหน้านี้บนจอใหญ่เพื่อดูตัวอย่าง',
      'กด เปิดผล แล้วนับถอยหลังพร้อมกันทั้งห้อง',
      'ใช้ในงานจริงได้จากหน้าจับรางวัลปีใหม่ เลือกพลุนับถอยหลังให้รอบที่ต้องการ',
    ],
  },
  og: 'prize-fireworks.png',
  cardArt: 'prize-fireworks.webp',
  cardArt2x: 'prize-fireworks-2x.webp',
  // No page of this game carries an ad slot: it has no setup page, and a play route never carries one.
  ads: false,
  playRoute: '/game/prize-fireworks/play/',
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
