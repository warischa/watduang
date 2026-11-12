// gh#303 boards for the new company-party category (owner ruling 2026-11-11): its category page, the
// Cat<Slug>Pop twin of CatPartyPop and CatFortunePop, and its row on the home page. Values are the live canvas D
// values the category page and the home page already ship (tokens.css), plus one accent the owner picks.
import { rolesRow } from './roles.mjs';
import { th, esc, ratio, svg, res, resetCopy, boardDoc, ORDER_LINE, valuesTable, contrastTable, copyRow, notesRow, rulesRow } from './lib.mjs';

// The two accent options. A keeps the twin structure exactly (ink text on a light accent). B paints the category in
// the picked night surface, which needs white text on the accent: a structure change the twins do not have.
const ACC = {
  A: { name: 'LILAC', bg: '#c9c2ff', fg: '#14142b', soft: '#14142b', pillRing: '', ctaRule: 'rgba(20,20,43,0.2)' },
  B: { name: 'NIGHT', bg: '#23214d', fg: '#ffffff', soft: '#d9d6f0', pillRing: 'box-shadow: inset 0 0 0 2px #ffcc00;', ctaRule: 'rgba(255,255,255,0.25)' },
};
const ARROW = svg.arrow(20, 'currentColor', 2.5);

// The .game-card-art rule, byte-identical to CatPartyPop's: src/pages/c/category.test.mjs requires the board of a
// category whose module sets cardArt to carry it, and the page carries the same rule.
const ART_RULE = `
    /* gh#241 - the game card art slot: the card's first child, above the h3. A fixed 160px box with
       object-fit contain fits any game's art whatever its aspect, and is sized before the image
       arrives, so lazy loading shifts nothing. src/pages/c/[category].astro carries this rule
       byte-identical. */
    .game-card-art { display: block; width: 100%; height: 160px; object-fit: contain; object-position: center; }`;

const CAT_CSS = `
    /* ---- the category page at 1440, canvas D values as src/pages/c/[category].astro ships them ---- */
    .cp { width: 1440px; background: #fff6e0; color: #14142b; font-family: 'Sarabun', system-ui, sans-serif; }
    .cp .row { width: 1280px; margin-inline: auto; }
    .cp .chrome { background: #14142b; }
    .cp .chrome .row { height: 84px; display: flex; align-items: center; justify-content: space-between; }
    .cp .brand { font: 700 32px/1 'Mitr', sans-serif; color: #ffcc00; }
    .cp .pills-nav { display: flex; gap: 12px; font: 600 17px/1.2 'Mitr', sans-serif; }
    .cp .pills-nav span { border-radius: 999px; padding: 9px 20px; color: #14142b; }
    .cp .head { border-block-end: 2.5px solid #14142b; }
    .cp .head .row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 56px; align-items: center; padding-block: 52px; }
    .cp .copy { display: flex; flex-direction: column; gap: 16px; }
    .cp .crumb { margin: 0; font-size: 14px; }
    .cp h1 { margin: 0; font: 600 58px/1.2 'Mitr', sans-serif; letter-spacing: -1px; }
    .cp .lead { margin: 0; font-size: 19px; line-height: 1.6; }
    .cp .pills { margin: 0; padding: 6px 0 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .cp .pills span { font-size: 13px; font-weight: 500; background: #fff6e0; color: #14142b; border: 2px solid #14142b; border-radius: 999px; padding: 5px 12px; }
    .cp .intro { margin: 0; font-size: 17px; line-height: 1.8; background: #fff6e0; color: #14142b; border: 2.5px solid #14142b; border-radius: 16px; box-shadow: 4px 4px 0 0 #14142b; padding: 24px 26px; }
    .cp .ad { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; border: 2.5px dashed rgba(20,20,43,0.35); border-radius: 14px; color: #3d3b5c; font-size: 13px; box-sizing: border-box; }
    .cp .ad b { font-family: 'Mitr', sans-serif; font-weight: 500; }
    .cp .ad span { font-size: 12px; }
    .cp .body { display: grid; grid-template-columns: 940px 300px; gap: 40px; align-items: start; padding-block: 0 48px; }
    .cp .kicker { margin: 0 0 20px; font: 500 18px/1.3 'Mitr', sans-serif; letter-spacing: 1px; color: #3d3b5c; }
    .cp .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
    .cp .gc { display: flex; flex-direction: column; gap: 12px; padding: 22px; border: 2.5px solid #14142b; border-radius: 16px; box-shadow: 4px 4px 0 0 #14142b; min-height: 200px; box-sizing: border-box; }
    .cp .gc h3 { margin: 0; font: 600 22px/1.3 'Mitr', sans-serif; }
    .cp .gc p { margin: 0; font-size: 15px; line-height: 1.65; }
    .cp .gc .cta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-block-start: auto; padding-block-start: 12px; font-size: 14px; }
    .cp .gc.event { grid-column: 1 / -1; flex-direction: row; align-items: center; gap: 28px; min-height: 0; }
    .cp .gc.event .ev-copy { flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .cp .gc.event h3 { font-size: 30px; }
    .cp .gc.event p { font-size: 17px; }
    .cp .gc.event .go { flex: none; display: inline-flex; align-items: center; gap: 10px; min-height: 52px; padding: 0 26px; border-radius: 999px; background: #ffcc00; color: #14142b; border: 2.5px solid #14142b; font: 600 19px/1 'Mitr', sans-serif; box-sizing: border-box; }
    .cp .cross { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
    .cp .cc { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 72px; padding: 0 24px; border: 2.5px solid #14142b; border-radius: 16px; box-shadow: 4px 4px 0 0 #14142b; font: 500 19px/1.2 'Mitr', sans-serif; color: #14142b; box-sizing: border-box; }
    .cp .foot { background: #14142b; }
    .cp .foot .row { height: 96px; display: flex; align-items: center; justify-content: center; font: 700 24px/1 'Mitr', sans-serif; color: #ffcc00; }`;

// The category page board only (the home board shares CAT_CSS and stays as committed).
const AMEND_CSS = `
    /* ---- AMENDMENT 2026-11-11 (owner ruling): the event card's cover art, APPROVED by the owner 2026-11-11 (popup). The art is the card's
       first child, as on the party cards. 1440: beside the copy, in the art's own 273x320 box (its aspect, contain).
       Stacked (the live 1099px break and below): above the copy, in the party cards' slot as the .game-card-art rule
       sets it (100% x 160px, contain, no radius, no ground). The stacked frames carry the live page's own break values. */
    .cp:not(.stack) .gc.event .game-card-art { flex: none; width: 273px; height: 320px; }
    .cp.stack { box-sizing: border-box; padding: 32px 18px 40px; }
    .cp.w1099 { width: 1099px; }
    .cp.w320 { width: 320px; }
    .cp.stack .gc.event { flex-direction: column; align-items: stretch; gap: 16px; }
    .cp.stack .gc.event p { font-size: 16px; }`;

// AMENDMENT 2026-11-11 (owner ruling): the event card's cover art, the picked file shipped as public/art/prize-draw.webp
// (273x320), drawn from the 1x file. Same class as the party cards' art, so the page gate counts it; the card's first child.
const EVENT_ART = '<img class="game-card-art" src="../public/art/prize-draw.webp" width="273" height="320" alt="" decoding="async">';
// The event card (K3), shared by the 1440 page and the stacked frames; the art only on the picked A.
function eventCard(opt) {
  const a = ACC[opt];
  return `<div class="gc event" style="background:${a.bg}; color:${a.fg};">${opt === 'A' ? EVENT_ART : ''}<div class="ev-copy"><h3>${th('จับรางวัลปีใหม่', 'event card: title (prize-draw.ts names.th)', 'g302setup')}</h3><p>${th('คัดออกทีละรอบจนเหลือ 5 คนสุดท้าย แล้วชิงรางวัลบนจอใหญ่', 'event card: line (prize-draw.ts tagline)', 'g302setup')}</p></div><span class="go">${th('เริ่มจัดงาน', 'event card: call to action')}${svg.arrow(22, '#14142b', 2.5)}</span></div>`;
}

const AMEND = 'AMENDMENT APPROVED 2026-11-11';
const amendTag = (w) => `<div class="tag"><span class="d">A · LILAC</span><span class="res">${AMEND}</span> · cat-event-${w} · the event card ${w === 1099 ? 'at the 1099px break, stacked' : 'at 320'}<span class="pc">COPY APPROVED</span></div>`;
// The event card where the live page stacks it: the list heading and the card, in the page's 18px gutters.
const eventStackFrame = (w) => `<div class="cp stack w${w}" data-frame="cat-event-${w}" data-dir="A"><h2 class="kicker">${th('เกมในหมวดนี้', 'categories.listHeading', 'page')}</h2>${eventCard('A')}</div>`;

function catFrame(opt) {
  const a = ACC[opt];
  const nav = [['ดูดวง', '#ffcc00', 'page'], ['สุ่มคนโดน', '#ff3d7f', 'page'], ['เครื่องมือสุ่ม', '#2b7bff', 'page']]
    .map(([t, c, s]) => `<span style="background:${c};">${th(t, 'chrome pill', s)}</span>`).join('')
    + `<span style="background:${a.bg}; color:${a.fg};${a.pillRing}">${th('งานเลี้ยงบริษัท', 'chrome pill: the new category')}</span>`;
  const games = [
    ['พลุนับถอยหลัง', 'ทั้งห้องนับ 10 ถึง 0 พร้อมกัน พลุแตกแล้วโคมที่ดับคือชื่อที่ไม่ผ่าน'],
    ['ไพ่แจกทั้งห้อง', 'แจกไพ่คว่ำให้ทุกชื่อ สุ่มกติกา แล้วเปิดไพ่พร้อมกันทั้งห้อง'],
    ['ทางแยกเลือกเส้น', '5 คนสุดท้ายเลือกเส้นทาง เปิดทางแยกทีละขั้นจนถึงช่องรางวัล'],
  ];
  const card = ([name, tagline], i) => `<div class="gc" style="background:${a.bg}; color:${a.fg};">${i === 0 ? '<div class="game-card-art stub">art slot (.game-card-art): empty until a cardArt file is approved</div>' : ''}<h3>${th(name, 'game name', 'ticket')}</h3><p>${th(tagline, 'game tagline')}</p><span class="cta" style="border-block-start: 2px solid ${a.ctaRule};">${th('เล่นเลย', 'card call to action', 'page')}${ARROW}</span></div>`;
  const event = eventCard(opt);
  const cross = [['สุ่มคนโดน', '#ff3d7f'], ['ดูดวง', '#ffcc00'], ['เครื่องมือสุ่ม', '#2b7bff'], ['ติชม / เสนอเกม', '#ffffff']]
    .map(([t, c]) => `<div class="cc" style="background:${c};">${th(t, 'cross-link card', 'page')}${ARROW}</div>`).join('');
  return `<div class="cp" data-frame="cat-1440" data-dir="${opt}">
    <div class="chrome"><div class="row"><span class="brand">${th('วัดดวง', 'brand', 'page')}</span><span class="pills-nav">${nav}</span></div></div>
    <div class="head" style="background:${a.bg}; color:${a.fg};"><div class="row"><div class="copy">
      <p class="crumb">${th('หน้าแรก', 'breadcrumb', 'page')} · ${th('เกมงานเลี้ยงบริษัท', 'categories.label (H1, breadcrumb)', 'cat304')}</p>
      <h1>${th('เกมงานเลี้ยงบริษัท', 'categories.label (H1, breadcrumb)', 'cat304')}</h1>
      <p class="lead">${th('จับรางวัลปีใหม่บนจอใหญ่ ให้ทั้งห้องลุ้นไปด้วยกัน', 'categories.whenToUse (lead)', 'cat304')}</p>
      <div class="pills"><span>${th('ไม่ต้องโหลดแอป', 'pill', 'page')}</span><span>${th('ไม่ต้องสมัคร', 'pill', 'page')}</span><span>${th('ขึ้นจอโปรเจกเตอร์ได้', 'pill: replaces the phone pill on this category')}</span></div>
    </div><p class="intro">${th('คัดออกทีละรอบจนเหลือ 5 คนสุดท้าย แล้วชิงรางวัลบนจอใหญ่ ทุกคนมีโอกาสเท่ากันทุกรอบ', 'categories.intro (intro card)', 'g302setup')}</p></div></div>
    <div class="row" style="padding-block: 40px; display: flex; justify-content: center;"><div class="ad" style="width: 970px; height: 250px;"><b>${th('ช่องโฆษณา', 'ad placeholder', 'page')}</b><span>${th('970 × 250 · ใต้หัวหน้าหมวด', 'ad placeholder size', 'page')}</span></div></div>
    <div class="row body"><div style="display:flex; flex-direction:column; gap:40px;">
      <div><h2 class="kicker">${th('เกมในหมวดนี้', 'categories.listHeading', 'page')}</h2><div class="cards">${event}${games.map(card).join('')}</div></div>
      <div><h2 class="kicker">${th('ไปที่อื่นต่อ', 'cross-link heading', 'page')}</h2><div class="cross">${cross}</div></div>
    </div><div class="ad" style="width: 300px; height: 250px;"><b>${th('ช่องโฆษณา', 'ad placeholder', 'page')}</b><span>300 × 250</span></div></div>
    <div class="foot"><div class="row">${th('วัดดวง', 'brand', 'page')}</div></div>
  </div>`;
}

const HOME_CSS = `
    /* ---- the home-page row, canvas D values as Section.astro and TextTile.astro ship them ---- */
    .hm { background: #fff6e0; color: #14142b; font-family: 'Sarabun', system-ui, sans-serif; box-sizing: border-box; }
    .hm.w1440 { width: 1440px; padding: 56px 80px; }
    .hm.w320 { width: 320px; padding: 32px 16px; }
    .hm .ctx { height: 72px; }
    .hm.w320 .ctx { height: 56px; }
    .hm .sec-head { display: flex; align-items: baseline; justify-content: space-between; gap: 24px; margin: 40px 0 52px; }
    .hm h2 { margin: 0; font: 700 44px/1.15 'Mitr', sans-serif; }
    .hm .sec-head p { margin: 6px 0 0; font-size: 18px; color: #3d3b5c; }
    .hm .see-all { flex: none; display: inline-flex; align-items: center; min-block-size: 44px; box-sizing: border-box; font: 600 18px/1.2 'Mitr', sans-serif; background: #14142b; color: #ffcc00; border-radius: 999px; padding: 10px 22px; }
    .hm .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; }
    .hm .tile { display: block; min-width: 0; overflow-wrap: anywhere; border: 4px solid #14142b; border-radius: 22px; box-shadow: 6px 6px 0 0 #14142b; padding: 26px; box-sizing: border-box; }
    .hm .tile .name { display: block; font: 700 30px/1.25 'Mitr', sans-serif; }
    .hm .tile .desc { display: block; margin: 8px 0 0; font-size: 16px; line-height: 1.5; }
    .hm.w320 .sec-head { display: block; margin: 28px 0 16px; }
    .hm.w320 h2 { font-size: 28px; line-height: 1.2; }
    .hm.w320 .sec-head p { font-size: 16px; }
    .hm.w320 .see-all { margin-top: 12px; font-size: 16px; padding: 8px 18px; }
    .hm.w320 .tiles { grid-template-columns: minmax(0, 1fr); gap: 14px; }
    .hm.w320 .tile { border-width: 3px; border-radius: 18px; box-shadow: 4px 4px 0 0 #14142b; padding: 14px; }
    .hm.w320 .tile .name { font-size: 21px; }
    .hm.w320 .tile .desc { margin-top: 4px; font-size: 16px; }
    .hm .band { margin: 0 -80px; padding: 8px 80px 64px; background: linear-gradient(180deg, #14142b 0%, #23214d 100%); }
    .hm.w320 .band { margin: 0 -16px; padding: 4px 16px 36px; }
    .hm .band h2 { color: #ffffff; }
    .hm .band .sec-head p { color: #d9d6f0; }
    .hm .band .see-all { background: #ffcc00; color: #14142b; }`;

function homeFrame(opt, w) {
  const a = ACC[opt];
  const tiles = [
    ['จับรางวัลปีใหม่', 'คัดออกทีละรอบจนเหลือ 5 คนสุดท้าย แล้วชิงรางวัลบนจอใหญ่', 'event card: title (prize-draw.ts names.th)', 'event card: line (prize-draw.ts tagline)'],
    ['พลุนับถอยหลัง', 'ทั้งห้องนับ 10 ถึง 0 พร้อมกัน พลุแตกแล้วโคมที่ดับคือชื่อที่ไม่ผ่าน', 'game name', 'game tagline'],
    ['ไพ่แจกทั้งห้อง', 'แจกไพ่คว่ำให้ทุกชื่อ สุ่มกติกา แล้วเปิดไพ่พร้อมกันทั้งห้อง', 'game name', 'game tagline'],
    ['ทางแยกเลือกเส้น', '5 คนสุดท้ายเลือกเส้นทาง เปิดทางแยกทีละขั้นจนถึงช่องรางวัล', 'game name', 'game tagline'],
  ].map(([t, d, rt, rd], i) => `<div class="tile tap" style="background:${a.bg}; color:${a.fg};${opt === 'B' ? ' border-color: #14142b; box-shadow: ' + (w === 320 ? '4px 4px' : '6px 6px') + ' 0 0 #000000;' : ''}${opt === 'B' && i === 0 ? ' outline: 3px solid #ffcc00; outline-offset: -7px;' : ''}"><span class="name">${th(t, rt, i === 0 ? 'g302setup' : 'ticket')}</span><span class="desc">${th(d, rd, i === 0 ? 'g302setup' : 'new')}</span></div>`).join('');
  const head = `<div class="sec-head"><div><h2>${th('เกมงานเลี้ยงบริษัท จับรางวัลปีใหม่', 'categories.hubHeading (home row)', 'cat304')}</h2><p>${th('พิธีกรคุมจอใหญ่จอเดียว คัดชื่อออกทีละรอบจนได้ผู้รับรางวัล', 'categories.hubBody (home row)', 'cat304')}</p></div><span class="see-all tap">${th('ดูทั้งหมด →', 'see-all label', 'home')}</span></div>`;
  const ctx = (t) => `<div class="stub ctx">${t}</div>`;
  const row = opt === 'A' ? `${head}<div class="tiles">${tiles}</div>` : `<div class="band">${head}<div class="tiles">${tiles}</div></div>`;
  return `<div class="hm w${w}" data-frame="home-${w}" data-dir="${opt}">${ctx('fortune row above (unchanged)')}${row}<div style="height:${w === 320 ? 28 : 56}px;"></div>${ctx('tools row below (unchanged)')}</div>`;
}

const sec = (title, why, items) => `
  <div class="brow">
    <h2>${title}</h2>
    <p class="why">${why}</p>
    <div class="cands col">${items.map(([t, f]) => `<div class="cand">${t}${f}</div>`).join('')}</div>
  </div>`;
const tg = (opt, text) => `<div class="tag"><span class="d">${opt} · ${ACC[opt].name}</span>${res(opt, 'A')}${text}<span class="pc">COPY APPROVED</span></div>`;
const PAGE_VALUES = [
  ['#fff6e0', 'page ground; pills', 'tokens.css --color-ground-warm'],
  ['#14142b', 'ink: text, borders, shadows, chrome bar, footer', 'tokens.css --color-line-strong'],
  ['#3d3b5c', 'kickers, section body, ad captions', 'tokens.css --color-muted'],
  ['rgba(20,20,43,0.35)', 'ad slot dashed line', 'src/pages/c/[category].astro .ad-slot (live)'],
  ['#ffcc00', 'brand, fortune pill and cross-link, event call to action, see-all text', 'tokens.css --accent-gold'],
  ['#ff3d7f', 'party pill and cross-link', 'tokens.css --accent-punch'],
  ['#2b7bff', 'tools pill and cross-link', 'tokens.css --accent-sky'],
  ['#ffffff', 'feedback cross-link (--color-bg); B text on the accent', 'tokens.css --color-bg / --ink-light'],
  ['rgba(20,20,43,0.2)', 'card call-to-action rule on a light accent', 'the twins\' literal'],
];
// AMENDMENT 2026-11-11: the event card's art box. No new paint: the art carries no radius and no ground.
const ART_VALUES = [
  ['273 x 320px, contain', 'event card art beside the copy at 1440', 'AMENDMENT APPROVED 2026-11-11 (the art\'s own size)'],
  ['100% x 160px, contain, no radius, no ground', 'event card art stacked (1099px break and 320)', 'the .game-card-art rule: src/pages/c/[category].astro and CatPartyPop'],
];
const ACC_VALUES = [
  ['#c9c2ff', 'A: header, cards, chrome pill, home tiles', 'PICKED 2026-11-11 (was PROPOSAL (new colour); K1)'],
  ['#23214d', 'B: the same surfaces', 'gh#302 B, picked; as this accent NOT PICKED (K1)'],
  ['#d9d6f0', 'B: secondary text on the night band', 'tokens.css --ink-on-band-soft; NOT PICKED here (K1)'],
  ['rgba(255,255,255,0.25)', 'B: card call-to-action rule on the night accent', 'NOT PICKED (was PROPOSAL (white at 25%))'],
];
const PAIRS = [
  ['#14142b', '#c9c2ff', 'A: ink on the lilac accent (header, cards, chrome pill)'],
  ['#ffffff', '#23214d', 'B: white on the night accent'],
  ['#d9d6f0', '#23214d', 'B: secondary text on the night accent'],
  ['#14142b', '#ffcc00', 'event call to action; see-all on the night band'],
  ['#14142b', '#fff6e0', 'page text on the ground'],
  ['#3d3b5c', '#fff6e0', 'kickers and section body on the ground'],
  ['#ffcc00', '#14142b', 'brand and see-all on ink'],
  ['#ffffff', '#14142b', 'B: row heading on the night band'],
  ['#23214d', '#14142b', 'B: night pill on the ink chrome bar (non-text edge; the gold ring carries it)'],
];
const OWNER = `<div class="pin q"><b>DECISIONS FOR THE OWNER (answered 2026-11-11, see APPROVAL RESULT above; the questions stay as history):</b><ul>
  <li><b>K1. The category accent</b>: A LILAC (#c9c2ff, one new colour; ink text, the twin pages' structure unchanged) or B NIGHT (#23214d, the gh#302 picked surface; white text, so the page and the home row need a text colour per accent, a structure change). Frames cat-1440 and home-1440 / home-320, A and B.</li>
  <li><b>K2. Home placement</b>: drawn between the fortune row and the tools row (A as a typographic row like fortune; B as a night band like the party band). The alternative is directly under the party band; say so to move it.</li>
  <li><b>K3. The event card</b>: the event page leads the category as a full-width card above the three games, with its own gold call to action. The alternative is a fourth card the same size as the games.</li>
  <li><b>K4. The third pill</b>: "ขึ้นจอโปรเจกเตอร์ได้" replaces "มือถือเครื่องเดียว", which is false here (a projector, not one phone passed around; ADR-0075).</li>
  <li><b>K5. Proposed copy</b>: this board's own strings (the pill, the event card, the game taglines, the chrome pill) and gh#304's manifest strings it shows verbatim (COPY SOURCES row): approve, or mark strings to change.</li>
</ul></div>`;

export function buildCategory() {
  resetCopy();
  const rows = [];
  rows.push(sec('CATEGORY PAGE · 1440 · /c/company-party/ (the slug gh#304 wired)', 'The twin structure of CatPartyPop and CatFortunePop, in the canvas D values the live page ships: chrome bar, accent header with H1, lead, three pills and the intro card, the billboard ad slot, the games list with the art slot on the first specimen card, the cross-links, the 300 x 250 rail. Two additions, both structure (the ticket owns structure, ADR-0033): the full-width event card that leads the list, and a fourth chrome pill. Ads are allowed here: this is a site page, not the projected screen (gh#299 decision 10 bars them from the projector only).', ['A', 'B'].map((o) => [tg(o, ` · cat-1440 · authored and shown at 1440${o === 'A' ? ` · event card art: ${AMEND}` : ''}`), catFrame(o)])));
  rows.push(sec(`EVENT CARD ART · ${AMEND}`, 'Owner ruling 2026-11-11: the full-width event card (K3) carries cover art like the party cards. The picked art is images/IMG_04_002.png, shipped as public/art/prize-draw.webp (273 x 320) and prize-draw-2x.webp (546 x 640); drawn here from the 1x file. The art is the card\'s first child with the party cards\' class, .game-card-art. <b>1440</b> (in the page frame above): the art sits beside the copy in its own 273 x 320 box, so it keeps its aspect. <b>Stacked</b>, at the live page\'s 1099px break and at 320: the card turns to a column (the live break values: column, stretch, 16px gap, body text 16px) and the art sits above the copy in the party cards\' slot, full width x 160px, contain, no radius and no ground (the .game-card-art rule as the page and CatPartyPop carry it). These two frames are new: the board never drew the event card below 1440.', [1099, 320].map((w) => [amendTag(w), eventStackFrame(w)])));
  rows.push(`
  <div class="brow">
    <h2>MANIFEST FIELDS · proposed values for the categories.ts entry (gh#304 wires them)</h2>
    <p class="why">ADR-0075 left the slug to the registry ticket; gh#304 wired <b>company-party</b> (uncommitted in the tree on 2026-11-11), and category.test.mjs derives the board name from the slug, so this file is CatCompany-partyPop.dc.html. Another slug renames it in the same change. The strings below are gh#304's own (one proposal set for the owner, not two); the intro is the approved gh#302 setup lead. gh#304's accent is a stand-in (sky, the tools accent) awaiting K1.</p>
    <table class="tbl"><tr><th>field</th><th>value</th></tr>
      <tr><td>slug</td><td>company-party (gh#304)</td></tr>
      <tr><td>label</td><td class="thc">${esc('เกมงานเลี้ยงบริษัท')}</td></tr>
      <tr><td>whenToUse</td><td class="thc">${esc('จับรางวัลปีใหม่บนจอใหญ่ ให้ทั้งห้องลุ้นไปด้วยกัน')}</td></tr>
      <tr><td>hubHeading / hubBody</td><td class="thc">see Gh303Home.dc.html</td></tr>
      <tr><td>listHeading</td><td class="thc">${esc('เกมในหมวดนี้')} (party's own, verbatim)</td></tr>
      <tr><td>accent</td><td>A: a new token, --accent-lilac #c9c2ff · B: --accent-night #23214d plus an on-accent text colour</td></tr>
      <tr><td>carriesGroup</td><td>false (the event roster is its own; ADR-0075)</td></tr>
      <tr><td>seo.title</td><td class="thc">${th('เกมงานเลี้ยงบริษัท จับรางวัลปีใหม่ | วัดดวง', 'categories.seo.title (not on the page)', 'cat304')}</td></tr>
      <tr><td>seo.description</td><td class="thc">${th('จับรางวัลปีใหม่ในงานเลี้ยงบริษัทบนจอใหญ่ คัดชื่อออกทีละรอบจนเหลือ 5 คนสุดท้าย แล้วชิงรางวัล ทุกคนมีโอกาสเท่ากันทุกรอบ', 'categories.seo.description (not on the page)', 'cat304')}</td></tr>
    </table>
  </div>`);
  rows.push(`
  <div class="brow">
    <h2>VALUES · token or PROPOSAL</h2>
    <p class="why"><b>Every value but the accent is the live page's</b> (src/pages/c/[category].astro, tokens.css): ground #fff6e0, ink #14142b, muted #3d3b5c, 2.5px borders, 16px radius, 4px 4px 0 shadow, H1 Mitr 600 58px, lead 19px, intro 17px/1.8, pills 13px, card titles Mitr 600 22px, bodies 15px (16px at 1099px and under, the twins' phone note, which this board inherits). Kickers are drawn in Mitr 600: the page asks for 500, which no self-hosted file carries. <b>PICKED 2026-11-11 (was PROPOSAL):</b> the accent A #c9c2ff (K1; B #23214d with white text NOT PICKED); the event card (full width, title 30px, line 17px, a gold call to action 52px tall; K3).</p>
    <div class="cands"><div class="cand">${valuesTable([...PAGE_VALUES, ...ACC_VALUES, ...ART_VALUES])}</div><div class="cand">${contrastTable(PAIRS)}</div></div>
  </div>`);
  rows.push(rulesRow('--domain ux "projector legibility contrast large display distance" (its Color Contrast and Contrast Readability rules), "color not only indicator", "touch target size mobile".', [
    '<b>Color Contrast</b> (4.5:1): every text pair in the table clears it, computed. A\'s lilac takes ink at the same ratio band as the other accents; B\'s white on night is the highest.',
    '<b>Color Only</b>: each category is named in words on its pill, header and cross-link; the accent is never the only cue.',
    '<b>Touch Target Size</b>: the event call to action is 52px tall; cards and cross-links are far above 44px.',
  ]));
  rows.push(rolesRow('CatCompany-partyPop'));
  rows.push(copyRow());
  rows.push(notesRow([
    '<b>Rests on:</b> ADR-0075 (a third category that holds เกม; the 2 to 10 range and phone-passing are not claimed here), ADR-0040 as amended, ADR-0033, the owner ruling of 2026-11-11 that this category\'s card and page get a board in this round, gh#299 decisions 1, 2 and 10.',
    '<b>For gh#304:</b> the page still hardcodes the pill "มือถือเครื่องเดียว" for every category (re-read 2026-11-11 after gh#304\'s edits); this category needs a per-category third pill (or none). The page builds this category\'s cross-links from the manifest, so the four cards drawn here are what it would render. The event card shows prize-draw.ts\'s own name and tagline (the approved gh#302 setup h1 and lead); only its call to action is new.',
    '<b>Live values (REFUTE round 2):</b> the page values were re-diffed on 2026-11-11 against the live source, src/pages/c/[category].astro with src/styles/tokens.css and fonts.css, and now match it: pills Sarabun 500 (rendered by the 400 face, the only one below 700, as live), ad slots 2.5px dashed rgba(20,20,43,0.35) with a Mitr 500 label, kicker and cross-link cards Mitr 500, the card call to action at the inherited weight. The pills are drawn as spans, not list items: the board grammar admits no list markers.',
    '<b>Not drawn:</b> the whole page at phone width (the twins have none; their phone note applies; the event card alone is drawn stacked, AMENDMENT 2026-11-11); art for the game cards (the slot is reserved and empty).',
  ]));
  return boardDoc('gh#303 · prize draw · the company-party category page', 'gh#303: proposal board, ADR-0033. The Cat<Slug>Pop twin of CatPartyPop and CatFortunePop for the slug company-party.', ['<b style="color: #ffcc00;">APPROVAL RESULT 2026-11-11 (owner popups):</b> K1 accent: <b>A LILAC #c9c2ff</b> PICKED (B NIGHT NOT PICKED, its frames stay below as history). K2: the row between the fortune row and the tools row, typographic, as drawn in A, PICKED. K3: the event as a full-width lead card, PICKED. K4: the pill \"ขึ้นจอโปรเจกเตอร์ได้\", PICKED. K5: all proposed Thai copy APPROVED as it stands. Card cover art is coming (owner ask, 2026-11-11): the art slot stays as drawn until the picked art is forwarded.', ORDER_LINE, OWNER], CAT_CSS + AMEND_CSS, rows, { width: 1520, extraHelmet: ART_RULE, status: 'APPROVED 2026-11-11: A LILAC PICKED', pick: 'A' });
}

export function buildHome() {
  resetCopy();
  const rows = [];
  rows.push(sec('HOME ROW · 1440', 'The category\'s row on the home page, under its own hub heading with a see-all link to its hub, as every category row has (gh#304 holds this category in the NO_HOME_ROW_YET list of index.astro until this board is picked). Tiles are typographic: art tiles need cardArt and cardArt2x, and none exists. Four tiles: the event and the three phase-1 games. Hatched stubs stand for the unchanged neighbouring rows.', ['A', 'B'].map((o) => [tg(o, ' · home-1440 · authored and shown at 1440'), homeFrame(o, 1440)])));
  rows.push(sec('HOME ROW · 320', 'The 1099px-and-under values of Section.astro and TextTile.astro: the head stacks, the see-all pill keeps the 44px floor, tiles go one column.', [`<div class="cands">${['A', 'B'].map((o) => `<div class="cand">${tg(o, ' · home-320')}${homeFrame(o, 320)}</div>`).join('')}</div>`].map((x) => ['', x])));
  rows.push(`
  <div class="brow">
    <h2>VALUES · token or PROPOSAL</h2>
    <p class="why"><b>Live values</b> (Section.astro, TextTile.astro): h2 Mitr 700 44px (28px at 320), body 18px #3d3b5c (16px), the see-all pill ink with gold text (gold with ink text on a dark tone), tiles 4px ink border, 22px radius, 6px shadow, 26px padding, name 30px, body 16px (3px, 18px, 4px, 14px, 21px, 16px at 320). <b>PICKED 2026-11-11:</b> the accent A #c9c2ff (K1) and the row between the fortune and tools rows (K2). <b>NOT PICKED:</b> B's night band gradient #14142b to #23214d (the party band is flat #14142b), B's tile shadow in #000000 so it still reads on the night band, and the gold inner ring on B's event tile.</p>
    <div class="cands"><div class="cand">${valuesTable([...PAGE_VALUES, ...ACC_VALUES, ['#000000', 'B: tile shadow on the night band', 'NOT PICKED (was PROPOSAL (black))'], ['#14142b to #23214d, 180deg', 'B: the night band', 'NOT PICKED (was PROPOSAL as a home band)']])}</div><div class="cand">${contrastTable(PAIRS)}</div></div>
  </div>`);
  rows.push(rulesRow('--domain ux "touch target size mobile", "color not only indicator", "projector legibility contrast large display distance".', [
    '<b>Touch Target Size / Touch Spacing</b>: every tile and the see-all pill are at least 44px (the render asserts it); tiles are 14px apart at 320.',
    '<b>Color Contrast</b>: computed in the table; every text pair clears 4.5:1.',
    '<b>Color Only</b>: the row is named by its heading; the accent only groups it.',
  ]));
  rows.push(rolesRow('Gh303Home'));
  rows.push(copyRow());
  rows.push(notesRow([
    '<b>For gh#304:</b> index.astro lists company-party in NO_HOME_ROW_YET (no home row until this board is picked, uncommitted on 2026-11-11). Once picked, the row joins ROW_ORDER and the exemption goes; its look and place are the owner\'s.',
    '<b>Not covered:</b> the hero and popular rows (unchanged); widths between 320 and 1440.',
  ]));
  return boardDoc('gh#303 · prize draw · the company-party row on the home page', 'gh#303: proposal board, ADR-0033.', ['<b style="color: #ffcc00;">APPROVAL RESULT 2026-11-11 (owner popups):</b> K1 accent: <b>A LILAC #c9c2ff</b> PICKED (B NIGHT NOT PICKED, its frames stay below as history). K2: the row between the fortune row and the tools row, typographic, as drawn in A, PICKED. K3: the event as a full-width lead card, PICKED. K4: the pill \"ขึ้นจอโปรเจกเตอร์ได้\", PICKED. K5: all proposed Thai copy APPROVED as it stands. Card cover art is coming (owner ask, 2026-11-11): the art slot stays as drawn until the picked art is forwarded.', ORDER_LINE, OWNER], CAT_CSS + HOME_CSS, rows, { width: 1520, status: 'APPROVED 2026-11-11: A LILAC PICKED', pick: 'A' });
}
export { ratio };
