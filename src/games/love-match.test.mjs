// node --test src/games/love-match.test.mjs — no framework, no dependency
// gh#101: "Your Soulmate" (fortune category, one reader, one draw). The invariants this file owns:
//   - the draw splits near eight-to-two between meeting someone and the self branch;
//   - the meeting age sits above the chosen band BY CONSTRUCTION (every closed band's meeting range
//     starts above the band's top), and the open band answers in the relative form instead;
//   - the card pool is never empty: a card is drawn only from cards within AGE_WINDOW years of the
//     meeting age, and at the open band from cards aged OPEN_BAND_CARD_FLOOR and over;
//   - every card is the signed-off copy byte for byte, and every published portrait is referenced
//     by exactly one card (gh#103 box 4);
//   - nothing the reader picks is written to storage, the session, or the URL;
//   - the stage holds no navigation target on any screen (ADR-0014).
// Each draw-level check is a function run against the shipped draw AND against a broken mutant, so
// a check that cannot fail shows up here as a failing calibration test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import game, {
  AGE_WINDOW,
  BANDS,
  CARDS,
  MEET_ODDS,
  OPEN_BAND_CARD_FLOOR,
  OPEN_BAND_YEARS,
  PLACES,
  SELF_VARIANTS,
  cardPool,
  cardRows,
  drawReading,
} from './love-match.ts';
import { ARM_DELAY_MS } from './_arm-gate.ts';
import { makeDocument } from './_fake-dom.mjs';

const fakeDocument = makeDocument();
globalThis.document = fakeDocument;

const repo = (rel) => new URL(`../../${rel}`, import.meta.url);
const read = (rel) => readFileSync(repo(rel), 'utf8');

// A fixed generator: every result below is pass-always or fail-always, never flaky.
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function collect(node, pred, out = []) {
  if (pred(node)) out.push(node);
  for (const c of node.children || []) collect(c, pred, out);
  return out;
}
const byId = (node, id) => collect(node, (n) => n.id === id)[0] ?? null;
const byClass = (node, cls) => collect(node, (n) => (n.className || '').split(' ').includes(cls));
const byTag = (node, tag) => collect(node, (n) => (n.tagName || '').toLowerCase() === tag);
const bandTop = (label) => Number(/[–-](\d+)$/.exec(label)?.[1]);

// ---- The signed-off copy is the source; the module must carry it byte for byte ----

function copyCards() {
  const text = ['cards.md', 'cards-m6-m20.md', 'cards-f6-f20.md']
    .map((f) => read(`docs/copy/nuea-khu/${f}`))
    .join('\n');
  const out = new Map();
  for (const m of text.matchAll(/\*\*([MF]\d+)\*\* — ([\s\S]+?)(?=\n\n|\n*$)/g)) {
    out.set(m[1], m[2].replace(/\s*\n\s*/g, ' ').trim());
  }
  return out;
}

test('forty cards, twenty per gender, each one the signed-off copy byte for byte', () => {
  const copy = copyCards();
  assert.equal(copy.size, 40, `the copy files hold ${copy.size} cards, the extractor or the files moved`);
  assert.equal(CARDS.length, 40);
  assert.equal(CARDS.filter((c) => c.gender === 'm').length, 20);
  assert.equal(CARDS.filter((c) => c.gender === 'f').length, 20);
  for (const card of CARDS) {
    assert.ok(copy.has(card.id), `module card ${card.id} is not in the copy files`);
    assert.equal(cardRows(card).map(([, v]) => v).join(' · '), copy.get(card.id), `card ${card.id} drifted from the signed-off copy`);
    assert.equal(card.id[0], card.gender === 'm' ? 'M' : 'F', `card ${card.id} sits in the wrong gender list`);
  }
  assert.deepEqual(cardRows(CARDS[0]).map(([k]) => k),
    ['เพศ', 'อายุ', 'ส่วนสูง', 'รูปร่าง', 'สัญชาติ', 'อาชีพ', 'ฐานะ', 'ท่าที', 'นิสัยติดตัว', 'จุดสังเกต']);
});

test('every screen string is the signed-off copy', () => {
  const copy = read('docs/copy/nuea-khu.md');
  const strings = [
    game.names.th, game.names.en, game.tagline, game.seo.title, game.seo.description, game.ogTagline,
    ...game.keywords, ...game.seo.steps, ...PLACES,
    ...SELF_VARIANTS.flatMap((v) => [v.heading, v.body]),
    ...BANDS.map((b) => b.label),
  ];
  for (const s of strings) assert.ok(copy.includes(s), `not in docs/copy/nuea-khu.md: ${s}`);
  const src = read('src/games/love-match.ts');
  for (const s of ['คุณจะได้เจอเขา', 'ไม่ต้องรีบออกไปหา แค่จำไว้ว่าประมาณนี้', 'เปิดใหม่อีกที', 'ยังไม่มีภาพ',
    'เปิดใหม่ได้เรื่อยๆ ดวงไม่ได้ผูกไว้กับรอบเดียว', 'ที่ตอบไว้อยู่แค่ในหน้านี้รอบเดียว ไม่ได้บันทึก ไม่ได้อยู่ในลิงก์ ไม่ได้ส่งไปไหน',
    'ตอบสามข้อ แล้วเปิดดูครั้งเดียว', 'อยากให้เนื้อคู่เป็น', 'อายุของคุณ', 'คุณเป็น', 'เปิดดูเนื้อคู่']) {
    assert.ok(src.includes(s) && copy.includes(s), `screen string missing from the module or the copy: ${s}`);
  }
});

test('every card maps to its deck portrait, and every published portrait is referenced (gh#103 box 4)', () => {
  const images = read('images/IMAGES.md');
  const deck = new Map();
  for (const m of images.matchAll(/- id: (IMG_01_\d{3})\n(?:.*\n){0,6}?\s+location: "docs\/copy\/nuea-khu\/[\w-]+\.md — card ([MF]\d+)"/g)) {
    if (m[1] >= 'IMG_01_011') deck.set(m[2], m[1]);
  }
  assert.equal(deck.size, 40, `IMAGES.md maps ${deck.size} deck portraits, expected 40`);
  const published = readdirSync(repo('public/art/nuea-khu')).sort();
  const referenced = CARDS.map((c) => c.portrait).sort();
  assert.equal(new Set(referenced).size, 40, 'two cards share one portrait');
  assert.deepEqual(published, referenced, 'the published set and the referenced set differ');
  for (const card of CARDS) assert.equal(card.portrait, `${deck.get(card.id)}.webp`, `card ${card.id} shows the wrong portrait`);
});

// ---- The draw ----

function assertMeetAboveBand(draw, perBand) {
  const rand = lcg(20260926);
  BANDS.forEach((band, b) => {
    if (!band.meet) return;
    const top = bandTop(band.label);
    assert.ok(Number.isFinite(top), `closed band ${band.label} has no readable top`);
    for (let i = 0; i < perBand; i++) {
      for (const want of ['m', 'f']) {
        const r = draw(b, want, rand);
        if (r.kind !== 'meet') continue;
        assert.ok(r.age > top, `band ${band.label}: meeting age ${r.age} is not above ${top}`);
        assert.equal(r.years, undefined, `band ${band.label} answered in the open-band form`);
      }
    }
  });
}

function assertSplit(draw, n) {
  const rand = lcg(101);
  let meet = 0;
  for (let i = 0; i < n; i++) if (draw(i % BANDS.length, i % 2 ? 'm' : 'f', rand).kind === 'meet') meet++;
  const share = meet / n;
  assert.ok(share > 0.78 && share < 0.82, `meet share ${share.toFixed(4)} over ${n} draws is not near eight in ten`);
}

test('the meeting age sits above every closed band by construction', () => {
  for (const band of BANDS) {
    if (!band.meet) continue;
    assert.ok(band.meet[0] > bandTop(band.label), `${band.label} meets from ${band.meet[0]}, not above its top`);
  }
  // The signed-off per-band table, verbatim.
  assert.deepEqual(BANDS.map((b) => [b.label, b.meet]), [
    ['18–24', [25, 29]], ['25–29', [30, 34]], ['30–34', [35, 39]], ['35–39', [40, 44]], ['40–49', [50, 55]], ['50 ขึ้นไป', null],
  ]);
  assertMeetAboveBand(drawReading, 400);
  // Every meeting age in every closed range is reachable, so the range is the draw, not a label.
  const rand = lcg(3);
  BANDS.forEach((band, b) => {
    if (!band.meet) return;
    const seen = new Set();
    for (let i = 0; i < 3000; i++) { const r = drawReading(b, 'f', rand); if (r.kind === 'meet') seen.add(r.age); }
    assert.equal(seen.size, band.meet[1] - band.meet[0] + 1, `${band.label}: only ${[...seen].sort()} reachable`);
  });
});

test('calibration: the band check reds on a draw that meets inside the chosen band', () => {
  const inside = (b, want, rand) => {
    const r = drawReading(b, want, rand);
    return r.kind === 'meet' && BANDS[b].meet ? { ...r, age: bandTop(BANDS[b].label) } : r;
  };
  assert.throws(() => assertMeetAboveBand(inside, 50), /is not above/);
});

test('the open band answers in the relative form, and its card pool is the 45-and-over cards', () => {
  const open = BANDS.findIndex((b) => !b.meet);
  assert.equal(BANDS[open].label, '50 ขึ้นไป');
  assert.deepEqual(OPEN_BAND_YEARS, [2, 5]);
  assert.equal(OPEN_BAND_CARD_FLOOR, 45);
  const rand = lcg(50);
  const years = new Set();
  for (let i = 0; i < 2000; i++) {
    const r = drawReading(open, i % 2 ? 'm' : 'f', rand);
    if (r.kind !== 'meet') continue;
    assert.equal(r.age, undefined, 'the open band produced an absolute age');
    assert.ok(r.years >= 2 && r.years <= 5, `years-from-now ${r.years} outside 2..5`);
    assert.ok(r.card.age >= OPEN_BAND_CARD_FLOOR, `open band drew ${r.card.id} aged ${r.card.age}`);
    years.add(r.years);
  }
  assert.deepEqual([...years].sort(), [2, 3, 4, 5]);
  assert.deepEqual(cardPool(open, 'm').map((c) => c.id), ['M8', 'M13', 'M17']);
  assert.deepEqual(cardPool(open, 'f').map((c) => c.id), ['F7', 'F11', 'F16', 'F19']);
});

test('the card pool is never empty: at least three per gender at every meeting age, all inside the window', () => {
  assert.equal(AGE_WINDOW, 8);
  let smallest = Infinity;
  BANDS.forEach((band, b) => {
    for (const want of ['m', 'f']) {
      const ages = band.meet ? Array.from({ length: band.meet[1] - band.meet[0] + 1 }, (_, i) => band.meet[0] + i) : [undefined];
      for (const age of ages) {
        const pool = cardPool(b, want, age);
        smallest = Math.min(smallest, pool.length);
        assert.ok(pool.length >= 3, `${band.label}, ${want}, age ${age}: pool of ${pool.length}`);
        for (const c of pool) {
          assert.equal(c.gender, want, `${c.id} drawn for the other gender`);
          if (age !== undefined) assert.ok(Math.abs(c.age - age) <= AGE_WINDOW, `${c.id} aged ${c.age} drawn for meeting age ${age}`);
        }
      }
    }
  });
  assert.equal(smallest, 3, 'the measured minimum moved — re-read gh#101 before changing either constant');
  // And the draw actually uses the pool it claims to.
  const rand = lcg(9);
  for (let i = 0; i < 3000; i++) {
    const b = i % BANDS.length;
    const r = drawReading(b, i % 2 ? 'm' : 'f', rand);
    if (r.kind === 'meet') assert.ok(cardPool(b, r.card.gender, r.age).includes(r.card), `drew ${r.card.id} outside its pool`);
  }
});

test('eight in ten meet someone, two in ten are their own; every place and variant is reachable', () => {
  assert.equal(MEET_ODDS, 0.8);
  assertSplit(drawReading, 20000);
  const rand = lcg(77);
  const places = new Set();
  const variants = new Set();
  for (let i = 0; i < 5000; i++) {
    const r = drawReading(i % BANDS.length, 'f', rand);
    if (r.kind === 'meet') places.add(r.place); else variants.add(r.variant);
  }
  assert.equal(places.size, PLACES.length, 'a meeting place is unreachable');
  assert.equal(variants.size, SELF_VARIANTS.length, 'a self-branch variant is unreachable');
  assert.equal(SELF_VARIANTS.length, 4);
});

test('calibration: the split check reds on a coin-flip draw', () => {
  const coin = (b, want, rand) => (rand() < 0.5 ? { kind: 'self', variant: 0 } : drawReading(b, want, () => 0));
  assert.throws(() => assertSplit(coin, 4000), /not near eight in ten/);
});

// ---- The page ----

function spyCtx() {
  const calls = [];
  const rec = (name) => (...args) => { calls.push([name, args]); };
  return {
    calls,
    ctx: {
      roster: { names: () => [], add: rec('roster.add') },
      session: {
        players: [], played: [], checkpoint: null,
        setPlayers: rec('setPlayers'), markPlayed: rec('markPlayed'), saveCheckpoint: rec('saveCheckpoint'), clear: rec('clear'),
      },
    },
  };
}

function installWebStateSpies() {
  const writes = [];
  const store = (name) => ({
    setItem: (...a) => writes.push([`${name}.setItem`, a]),
    removeItem: (...a) => writes.push([`${name}.removeItem`, a]),
    clear: () => writes.push([`${name}.clear`]),
    getItem: () => null,
  });
  const saved = {};
  for (const k of ['localStorage', 'sessionStorage', 'history', 'location']) saved[k] = globalThis[k];
  globalThis.localStorage = store('localStorage');
  globalThis.sessionStorage = store('sessionStorage');
  globalThis.history = { pushState: (...a) => writes.push(['history.pushState', a]), replaceState: (...a) => writes.push(['history.replaceState', a]) };
  globalThis.location = { href: 'https://x.test/game/love-match/', hash: '', search: '' };
  return {
    writes,
    restore() { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } },
  };
}

function arm(t) { t.mock.timers.tick(ARM_DELAY_MS + 1); }

function mountAsk(t) {
  const stage = fakeDocument.createElement('div');
  const spy = spyCtx();
  game.mount(stage, spy.ctx);
  arm(t);
  return { stage, spy };
}

function drawWith(stage, value, t) {
  const real = Math.random;
  Math.random = () => value;
  try { byId(stage, 'lm-go').click(); } finally { Math.random = real; }
  return stage;
}

const assertNoAnchor = (stage, where) => assert.equal(byTag(stage, 'a').length, 0, `an <a> renders inside #stage on ${where} — ADR-0014`);

test('the ask screen: three questions, want pre-set opposite and freely changeable, open disabled until answered', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  game.mount(stage, spyCtx().ctx);
  const go = byId(stage, 'lm-go');
  assert.equal(go.disabled, true, 'the open control is live at mount — a ghost tap would press it');
  assert.equal(byClass(stage, 'lm-choice').every((b) => b.disabled), true, 'a choice is live at mount');
  arm(t);
  assertNoAnchor(stage, 'the ask screen');
  assert.equal(byTag(stage, 'input').length, 0, 'the ask screen asks for typed input');
  assert.equal(go.disabled, true, 'open is pressable with nothing answered');

  byId(stage, 'lm-me-m').click();
  assert.equal(byId(stage, 'lm-want-f').getAttribute('aria-pressed'), 'true', 'want is not pre-set opposite to ผู้ชาย');
  byId(stage, 'lm-me-f').click();
  assert.equal(byId(stage, 'lm-want-m').getAttribute('aria-pressed'), 'true', 'want did not follow the changed answer');
  assert.equal(byId(stage, 'lm-want-f').getAttribute('aria-pressed'), 'false');
  byId(stage, 'lm-want-f').click();
  byId(stage, 'lm-me-m').click();
  assert.equal(byId(stage, 'lm-want-f').getAttribute('aria-pressed'), 'true', 'a want the reader chose was overwritten');
  assert.equal(go.disabled, true, 'open is pressable before the age band is answered');
  byId(stage, 'lm-band-2').click();
  assert.equal(go.disabled, false, 'open stayed disabled with all three answered');
  game.dispose();
});

test('both branches render, read correctly, and hold no navigation target; nothing is written anywhere', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const web = installWebStateSpies();
  try {
    const { stage, spy } = mountAsk(t);
    byId(stage, 'lm-me-f').click();
    byId(stage, 'lm-band-1').click();

    // rand 0.1 is below MEET_ODDS: the eighty-percent screen.
    drawWith(stage, 0.1, t);
    assertNoAnchor(stage, 'the meet screen');
    assert.equal(byClass(stage, 'lm-heading')[0]?.textContent, 'คุณจะได้เจอเขา');
    assert.match(byClass(stage, 'lm-when')[0]?.textContent ?? '', /^ตอนคุณอายุ 3\d ปี$/);
    assert.match(byClass(stage, 'lm-where')[0]?.textContent ?? '', /^ที่ /);
    const img = byTag(stage, 'img')[0];
    assert.ok(img, 'the meet screen has no portrait');
    const shown = CARDS.find((c) => img.getAttribute('src') === `/art/nuea-khu/${c.portrait}`);
    assert.ok(shown, `portrait src ${img.getAttribute('src')} is no card's`);
    assert.equal(shown.gender, 'm', 'the reader wanted ผู้ชาย and got another gender');
    assert.deepEqual(byClass(stage, 'lm-row').map((r) => r.children.map((c) => c.textContent)), cardRows(shown),
      'the rendered card lines are not the portrait card');
    const again = byId(stage, 'lm-again');
    assert.equal(again.disabled, true, 'redo is live at reveal — a ghost tap skips the reading');
    arm(t);

    // Redo returns to the ask screen with the answers still held, so one tap redraws.
    again.click();
    assert.equal(byId(stage, 'lm-band-1').getAttribute('aria-pressed'), 'true', 'the band answer was dropped');
    assert.equal(byId(stage, 'lm-go').disabled, true, 'open is live the instant the ask screen returns');
    arm(t);
    assert.equal(byId(stage, 'lm-go').disabled, false);

    // rand 0.9 is at or above MEET_ODDS: the self branch — no portrait, no generated asset.
    drawWith(stage, 0.9, t);
    assertNoAnchor(stage, 'the self screen');
    assert.equal(byTag(stage, 'img').length, 0, 'the self screen carries a raster');
    assert.equal(byClass(stage, 'lm-heading')[0]?.textContent, SELF_VARIANTS[3].heading);
    assert.equal(byClass(stage, 'lm-body')[0]?.textContent, SELF_VARIANTS[3].body);
    assert.ok(byTag(stage, 'svg').length <= 1, 'more than one piece of art on the self screen');

    // The open band renders the relative form.
    arm(t);
    byId(stage, 'lm-again').click();
    arm(t);
    byId(stage, 'lm-band-5').click();
    drawWith(stage, 0.1, t);
    assert.match(byClass(stage, 'lm-when')[0]?.textContent ?? '', /^อีกประมาณ [2-5] ปีจากนี้$/);

    assert.deepEqual(spy.calls, [], `the page wrote to the session or roster: ${JSON.stringify(spy.calls)}`);
    assert.deepEqual(web.writes, [], `the page wrote storage or the URL: ${JSON.stringify(web.writes)}`);
    game.dispose();
  } finally {
    web.restore();
  }
});

test('a missing portrait falls back to the signed-off placeholder copy', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { stage } = mountAsk(t);
  byId(stage, 'lm-me-m').click();
  byId(stage, 'lm-band-0').click();
  drawWith(stage, 0.1, t);
  const box = byClass(stage, 'lm-portrait')[0];
  box.children[0].dispatch('error');
  assert.equal(box.children.length, 1);
  assert.equal(box.children[0].textContent, 'ยังไม่มีภาพ');
  game.dispose();
});

test('the module source touches no storage, no URL and no session write', () => {
  const src = read('src/games/love-match.ts').replace(/^\s*\/\/.*$/gm, '');
  for (const banned of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'history.', 'location', 'saveCheckpoint', 'setPlayers', 'markPlayed', 'fetch(']) {
    assert.ok(!src.includes(banned), `love-match.ts references ${banned}`);
  }
});

test('manifest shape: a solo fortune page that starts no round', () => {
  assert.equal(game.id, 'love-match');
  assert.equal(game.category, 'fortune');
  assert.deepEqual(game.players, [1, 1]);
  assert.equal(game.startsRound, false);
  assert.equal(game.names.th, 'เนื้อคู่ของคุณ');
  assert.equal(game.og, 'love-match.png');
  assert.equal(game.playRoute, undefined);
});
