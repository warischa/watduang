// gh#315 -- the zones game of the company New Year prize draw (gh#299), on its own page. The game plays inside a
// real event on the prize-draw projector (src/play/prize-draw/); this module registers its own play route, where
// it runs a fixed DEMO outcome in memory (src/play/_prize-reveal/demo.ts) and stores nothing. Like every
// play-route game it has no /game/<id>/ landing of the shell's, so mount() is empty.
//
// Copy: `names.th` is the game name the projector board prints (the shared GAME_NAME in
// src/play/_prize-reveal/reveal.ts, the gh#299 owner wording). PLACEHOLDER, awaiting the owner: every other
// field here (English name, keywords, tagline, seo) is assembled only from the picked board's approved strings
// (design/Gh315Zones.dc.html, COPY SOURCES) and the fireworks page's approved event wording; no board carries
// these fields, so none of them is approved for this page yet.
// `players` is the head-count range the event this game plays in enforces (MIN_HEADS..MAX_HEADS), never a
// 2-10 claim.
import type { GameModule } from './types.ts';
import { MAX_HEADS, MIN_HEADS } from '../prize-event/event.ts';

const game: GameModule = {
  id: 'prize-zones',
  names: { th: 'โซนสีลุกยืน', en: 'Colour Zones Stand-Up' },
  category: 'company-party',
  players: [MIN_HEADS, MAX_HEADS],
  renderer: 'webgl',
  // The demo keeps nothing between loads: a refresh replays it, so there is no round to lose by leaving.
  startsRound: false,
  keywords: ['โซนสีลุกยืน', 'เกมงานเลี้ยงบริษัท', 'จับรางวัลปีใหม่', 'สุ่มคัดออกบนจอใหญ่'],
  tagline: 'ยืนในโซนสีของตัวเอง ชื่อที่ไม่ผ่าน นั่งลง',
  seo: {
    title: 'โซนสีลุกยืน — เกมงานเลี้ยงบริษัท คัดออกบนจอใหญ่',
    description:
      'โซนสีลุกยืนสำหรับงานเลี้ยงบริษัท ยืนในโซนสีของตัวเอง ชื่อที่ไม่ผ่าน นั่งลง ใช้เป็นรอบคัดออกในจับรางวัลปีใหม่ ทุกคนมีโอกาสเท่ากัน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'เปิดหน้านี้บนจอใหญ่เพื่อดูตัวอย่าง',
      'ทุกคนยืนในโซนสีของตัวเองบนจอใหญ่ แล้วกด เปิดผล',
      'ใช้ในงานจริงได้จากหน้าจับรางวัลปีใหม่ เลือกโซนสีลุกยืนให้รอบที่ต้องการ',
    ],
  },
  og: 'prize-zones.png',
  cardArt: 'prize-zones.webp',
  cardArt2x: 'prize-zones-2x.webp',
  // No page of this game carries an ad slot: it has no setup page, and a play route never carries one.
  ads: false,
  playRoute: '/game/prize-zones/play/',
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
