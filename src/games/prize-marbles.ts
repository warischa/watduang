// gh#316 -- the marble-race game of the company New Year prize draw (gh#299), on its own page. The game plays
// inside a real event on the prize-draw projector (src/play/prize-draw/); this module registers its own
// play route, where it runs a fixed DEMO outcome in memory (src/play/_prize-reveal/demo.ts) and stores
// nothing. Like every play-route game it has no /game/<id>/ landing of the shell's, so mount() is empty.
//
// Copy: `names.th` is the game name the projector board prints (the shared GAME_NAME in
// src/play/_prize-reveal/reveal.ts). No board carries the keywords, tagline and seo fields; they reuse the
// picked board's own strings where they fit, and the owner approved them as written on 2026-11-18
// (PD-316-10, gh#316).
// `players` is the head-count range the event this game plays in enforces (MIN_HEADS..MAX_HEADS), never a
// 2-10 claim.
import type { GameModule } from './types.ts';
import { MAX_HEADS, MIN_HEADS } from '../prize-event/event.ts';

const game: GameModule = {
  id: 'prize-marbles',
  names: { th: 'แข่งลูกแก้ว', en: 'Marble Race' },
  category: 'company-party',
  players: [MIN_HEADS, MAX_HEADS],
  renderer: 'webgl',
  // The demo keeps nothing between loads: a refresh replays it, so there is no round to lose by leaving.
  startsRound: false,
  keywords: ['แข่งลูกแก้ว', 'เกมงานเลี้ยงบริษัท', 'จับรางวัลปีใหม่', 'สุ่มคัดออกบนจอใหญ่', 'เกมแข่งลูกแก้วบนจอใหญ่'],
  tagline: 'ลูกแก้วของทุกคนวิ่งเข้าเส้นชัยทีละชุด ครบจำนวนเมื่อไร ลูกแก้วที่ข้ามเส้นชัย อยู่ต่อ',
  seo: {
    title: 'แข่งลูกแก้ว — เกมงานเลี้ยงบริษัท คัดออกด้วยการแข่งลูกแก้วบนจอใหญ่',
    description:
      'แข่งลูกแก้วสำหรับงานเลี้ยงบริษัท ชื่อของทุกคนอยู่บนลูกแก้ว วิ่งเข้าเส้นชัยทีละชุด ลูกแก้วที่ข้ามเส้นชัยได้อยู่ต่อ ใช้เป็นรอบคัดออกในจับรางวัลปีใหม่ ทุกคนมีโอกาสเท่ากัน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'เปิดหน้านี้บนจอใหญ่เพื่อดูตัวอย่าง',
      'กด เปิดผล แล้วดูลูกแก้ววิ่งเข้าเส้นชัยทีละชุด',
      'ใช้ในงานจริงได้จากหน้าจับรางวัลปีใหม่ เลือกแข่งลูกแก้วให้รอบที่ต้องการ',
    ],
  },
  og: 'prize-marbles.png',
  cardArt: 'prize-marbles.webp',
  cardArt2x: 'prize-marbles-2x.webp',
  // No page of this game carries an ad slot: it has no setup page, and a play route never carries one.
  ads: false,
  playRoute: '/game/prize-marbles/play/',
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
