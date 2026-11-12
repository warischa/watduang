// gh#304 — the company New Year prize draw (gh#299), the first game of the company-party category
// (ADR-0075). Metadata only: the event is set up on its own page (src/pages/game/prize-draw/index.astro,
// with ads) and run on its play route (src/pages/game/prize-draw/play.astro, no ads). Neither renders
// through mount(): like every play-route game, this module has no /game/<id>/ landing of the shell's.
//
// Copy: `names.th` is the setup board's approved h1 and `tagline` a verbatim prefix of its approved lead
// (design/Gh302Setup.dc.html). `seo.*` and `keywords` have no board; they are composed from the board's
// approved strings and gh#299's search terms and are listed for the owner in the gh#304 evidence README.
// `players` is the head-count range the setup page enforces (MIN_HEADS..MAX_HEADS), never a 2-10 claim.
import type { GameModule } from './types.ts';
import { MAX_HEADS, MIN_HEADS } from '../prize-event/event.ts';

const game: GameModule = {
  id: 'prize-draw',
  names: { th: 'จับรางวัลปีใหม่', en: 'New Year Prize Draw' },
  category: 'company-party',
  players: [MIN_HEADS, MAX_HEADS],
  renderer: 'dom',
  startsRound: true,
  keywords: ['จับรางวัล', 'จับฉลากรางวัลปีใหม่', 'เกมงานเลี้ยงบริษัท', 'จับรางวัลงานปีใหม่', 'สุ่มรางวัลบนจอใหญ่'],
  tagline: 'คัดออกทีละรอบจนเหลือ 5 คนสุดท้าย แล้วชิงรางวัลบนจอใหญ่',
  seo: {
    title: 'จับรางวัลปีใหม่ — เกมงานเลี้ยงบริษัท คัดชื่อออกทีละรอบบนจอใหญ่',
    description:
      'จับรางวัลปีใหม่สำหรับงานเลี้ยงบริษัท คัดออกทีละรอบจนเหลือ 5 คนสุดท้าย แล้วชิงรางวัลบนจอใหญ่ ทุกคนมีโอกาสเท่ากันทุกรอบ ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'ตั้งชื่องาน ชื่องานจะขึ้นบนจอใหญ่ตลอดงาน',
      'พิมพ์รายชื่อคนในงาน บรรทัดละ 1 ชื่อ ใส่เฉพาะคนที่มาถึงงานแล้ว',
      'ดูตารางคัดออกที่ระบบเสนอ แก้ตัวเลขได้ก่อนเริ่มงาน',
      'ตั้งชื่อรางวัล 1 ถึง 5 รางวัล แล้วกด เริ่มงาน',
      'บนจอใหญ่ กด เปิดผล ทีละรอบ 4 รอบคัดออก แล้วรอบชิง 5 คน',
    ],
  },
  og: 'prize-draw.png',
  cardArt: 'prize-draw.webp',
  cardArt2x: 'prize-draw-2x.webp',
  ads: true,
  playRoute: '/game/prize-draw/play/',
  setupRoute: '/game/prize-draw/',
  firstScreenRoots: {
    '#pd-live': 'chrome',
    '#app': 'gameplay',
  },

  // No shell landing renders this module (getStaticPaths in src/pages/game/[id].astro skips a game with
  // a playRoute), so there is nothing to mount and nothing to dispose.
  mount() {},
  dispose() {},
};

export default game;
