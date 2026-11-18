// gh#318 -- the turn-a-card final of the company New Year prize draw (gh#299), on its own page. The game plays
// inside a real event on the prize-draw projector (src/play/prize-draw/); this module registers its own play
// route, where it runs a fixed DEMO outcome in memory (src/play/_prize-reveal/demo.ts) and stores nothing. Like
// every play-route game it has no /game/<id>/ landing of the shell's, so mount() is empty.
//
// Copy: `names.th` is the game name the flipcards board prints (the shared GAME_NAME in
// src/play/_prize-reveal/reveal.ts). No board carries any other field here: `names.en`, the tagline, the
// keywords and the seo fields are modelled on the envelopes game's fields, and the owner approved them as
// written on 2026-11-18 (PD-318-14, gh#318).
// `players` is the head-count range the event this game plays in enforces (MIN_HEADS..MAX_HEADS), never a
// 2-10 claim.
import type { GameModule } from './types.ts';
import { MAX_HEADS, MIN_HEADS } from '../prize-event/event.ts';

const game: GameModule = {
  id: 'prize-flipcards',
  names: { th: 'เปิดไพ่ชิงรางวัล', en: 'Prize Flip Cards' },
  category: 'company-party',
  players: [MIN_HEADS, MAX_HEADS],
  renderer: 'webgl',
  // The demo keeps nothing between loads: a refresh replays it, so there is no round to lose by leaving.
  startsRound: false,
  keywords: [
    'เปิดไพ่ชิงรางวัล',
    'เกมงานเลี้ยงบริษัท',
    'จับรางวัลปีใหม่',
    'รอบชิงรางวัล',
    'เกมเปิดไพ่ชิงรางวัล',
  ],
  tagline: '5 คนสุดท้ายเลือกไพ่คว่ำคนละใบ แล้วเปิดทีละใบว่าใครได้รางวัลไหน',
  seo: {
    title: 'เปิดไพ่ชิงรางวัล — เกมงานเลี้ยงบริษัท รอบชิงรางวัลบนจอใหญ่',
    description:
      'เปิดไพ่ชิงรางวัลสำหรับรอบชิงในงานเลี้ยงบริษัท 5 คนสุดท้ายเลือกไพ่คว่ำคนละใบ แล้วเปิดทีละใบว่าใครได้รางวัลไหน ไพ่ที่เลือกไม่เปลี่ยนโอกาส ใช้ได้ 1 ถึง 5 รางวัล ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'เปิดหน้านี้บนจอใหญ่เพื่อดูตัวอย่าง',
      'เลือกจำนวนรางวัล แล้วกด เปิดผล ดูไพ่เปิดทีละใบ',
      'ใช้ในงานจริงได้จากหน้าจับรางวัลปีใหม่ เลือกเปิดไพ่ชิงรางวัลให้รอบชิง',
    ],
  },
  og: 'prize-flipcards.png',
  cardArt: 'prize-flipcards.webp',
  cardArt2x: 'prize-flipcards-2x.webp',
  // No page of this game carries an ad slot: it has no setup page, and a play route never carries one.
  ads: false,
  playRoute: '/game/prize-flipcards/play/',
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
