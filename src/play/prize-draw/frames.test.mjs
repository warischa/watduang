// node --test — the owner-picked projector frames that are values rather than walks (gh#314, gh#305):
//   1a B  the MC's button at the play band's right end, off the projected frame (design/Gh314Frames.dc.html
//         i1-mc B: right 24px, top 2px of the band);
//   1d B  the reveal wave spread over --motion-scroll for any head count (i1-wave B: step = 450ms / (n - 1));
//   5 B   the projector under 640px as a phone layout, names in two columns at 16px (i5-phone B);
//   and the owner-approved copy: the card round's deal press, the lane labels, the two card rules in full.
// Stated ceiling: the stylesheet legs read the rule text, never a laid-out page; layout itself (where the
// button lands, that two columns fit at 320) is a browser's to measure, and no browser runs here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeDoc } from '../../prize-event/fake-dom.mjs';
import { renderScreen } from '../_prize-reveal/reveal.ts';
import { fitName, nameBox } from '../_prize-reveal/names-dom.ts';
import { COPY as CARDS } from '../prize-cards/renderer/copy.ts';
import { layoutFloors } from './stage.ts';
import { renderLanes } from './lanes.ts';
import { fakeOrigin, mount, seedRaw, seeded, storedEvent } from './stage-harness.mjs';
import { advance, drawNext, encodeEvent, revealDrawn } from '../../prize-event/event.ts';

const read = (rel) => fs.readFileSync(path.join(import.meta.dirname, rel), 'utf8');
const PLAY_CSS = read('play.css');
const REVEAL_CSS = read('../_prize-reveal/reveal.css');
const STAGE = read('stage.ts');

/** The declarations of the first rule whose selector list is exactly `selector`, inside `css`. */
function rule(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`, 'm'));
  assert.ok(m, `no rule for ${selector}`);
  return m[1];
}
/** The body of the first @media block for `query`. */
function media(css, query) {
  const at = css.indexOf(`@media ${query}`);
  assert.ok(at > -1, `no @media ${query}`);
  let depth = 0;
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', at) + 1, i);
  }
  throw new Error('unbalanced @media block');
}

test('1a B: the MC button sits at the play band\'s right end, 24px in and 2px down, painted over the band', () => {
  const mc = rule(PLAY_CSS, '.pd-mc');
  assert.match(mc, /position:\s*fixed/);
  assert.match(mc, /inset-block-start:\s*2px/);
  assert.match(mc, /inset-inline-end:\s*24px/);
  assert.doesNotMatch(mc, /inset-block-end|inset-inline-start/, 'the as-built bottom-left anchor is gone');
  // The band is z-index 299 (PlayExit.astro): the route's layer must sit above it, or the band covers the button.
  assert.match(rule(PLAY_CSS, '.pd-viewport'), /z-index:\s*300/);
  // The notice must still cover the frame and the controls under the band.
  assert.match(rule(PLAY_CSS, '.pd-notice'), /z-index:\s*300/);
});

test('1d B: the wave spans --motion-scroll whatever the head count; the 4ms step is gone', () => {
  const block = media(REVEAL_CSS, '(prefers-reduced-motion: no-preference)');
  assert.match(block, /transition-delay:\s*calc\(var\(--motion-scroll\) \* var\(--wave, 0\) \/ var\(--wave-last, 1\)\)/);
  assert.doesNotMatch(REVEAL_CSS, /\b4ms\b/);
  // The field carries its last index, so the stylesheet can divide by it; one name has no wave to spread.
  for (const [n, last] of [[196, '195'], [9, '8'], [1, '1']]) {
    const doc = makeDoc();
    const frame = doc.createElement('div');
    const chips = Array.from({ length: n }, (_, i) => ({ name: `N${i}`, mark: 'in' }));
    renderScreen(frame, { kind: 'reveal', eventName: 'E', round: 1, rounds: 4, dots: ['on', 'todo', 'todo', 'todo', 'todo'], chips, passed: n, game: null }, doc);
    const field = frame.querySelector('.pd-field');
    assert.equal(field.style.getPropertyValue('--wave-last'), last, `n=${n}`);
    const chipsOut = field.querySelectorAll('.pd-chip');
    assert.equal(chipsOut[n - 1].style.getPropertyValue('--wave'), String(n - 1));
  }
});

test('5 B: under 640px the projector is a phone layout: the frame unscaled, the page scrolls, names in two columns at 16px', () => {
  const phone = media(PLAY_CSS, '(max-width: 639px)');
  const field = /\.pd-viewport\[data-field\] \.pd-field\s*\{([^}]*)\}/.exec(phone);
  assert.ok(field, 'no phone rule for the name field');
  assert.match(field[1], /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(field[1], /grid-auto-rows:\s*32px/);
  assert.match(field[1], /gap:\s*4px 10px/);
  assert.match(phone, /\.pd-viewport\[data-field\] \.pd-chip\s*\{[^}]*--fit-size:\s*16;/, 'names at the phone size, through the fit rule');
  assert.match(phone, /\.pd-viewport\[data-field\] \.pd-scaled\s*\{[^}]*transform:\s*none/);
  assert.match(phone, /\.pd-viewport\[data-field\]\s*\{[^}]*overflow-y:\s*auto/);
  // Only the screens with a name field take it; the lanes, the result and the cold screen keep the frame. A zones
  // round before its draw is a name field too (gh#315, REFUTE 2026-11-17: it had no phone layout without this).
  assert.match(STAGE, /const FIELD_SCREENS = new Set\(\['round', 'reveal', 'final', 'zones'\]\)/);
});

test('5 B: the fit rule starts a name at the size its stylesheet asks for (--fit-size), else at its surface size', () => {
  const doc = makeDoc();
  const box = nameBox(doc, 'span', 'pd-chip', 'Name', { size: 20, floor: 14 });
  const writes = [];
  box.style.setProperty = (k, v) => k === 'font-size' && writes.push(v);
  Object.defineProperty(box.style, 'fontSize', { set: (v) => writes.push(v), get: () => writes.at(-1) });
  Object.assign(box, { clientWidth: 1000 });
  Object.assign(box.firstElementChild, { offsetWidth: 10 });
  const css = (props) => () => ({ paddingLeft: '0', paddingRight: '0', getPropertyValue: (k) => props[k] ?? '' });
  const saved = globalThis.getComputedStyle;
  try {
    globalThis.getComputedStyle = css({ '--fit-size': ' 16' });
    fitName(box);
    assert.deepEqual(writes, ['16px'], 'the phone size, not the projector size');
    writes.length = 0;
    globalThis.getComputedStyle = css({});
    fitName(box);
    assert.deepEqual(writes, ['20px'], 'with no stylesheet size, the surface size');
  } finally {
    if (saved) globalThis.getComputedStyle = saved;
    else delete globalThis.getComputedStyle;
  }
});

/** A stored event that has run every round with no 3D game; `final` true runs the final too (the result). */
function walked(origin, final) {
  let ev = storedEvent(origin, { n: 50, games: { rounds: [null, null, null, null], final: final ? null : 'ladder' } });
  const rng = seeded(4);
  for (let r = 1; r <= 4; r++) ev = advance(revealDrawn(drawNext(ev, rng)), rng);
  if (final) ev = revealDrawn(drawNext(ev, rng));
  seedRaw(origin, encodeEvent(ev));
  return ev;
}

/** Runs `fn` with a getComputedStyle that answers `--fit-floor` for a box inside an element of the given
 *  class (fitName needs the API; the fake DOM has no selector engine, so the class is walked up to). */
async function withFloors(floors, fn) {
  const saved = globalThis.getComputedStyle;
  globalThis.getComputedStyle = (box) => ({
    paddingLeft: '0',
    paddingRight: '0',
    getPropertyValue: (k) => {
      if (k !== '--fit-floor') return '';
      const inside = (cls) => {
        for (let n = box; n; n = n.parentNode) if (n.classList?.contains(cls)) return true;
        return false;
      };
      const hit = Object.keys(floors).find(inside);
      return hit ? ` ${floors[hit]}` : '';
    },
  });
  try {
    return await fn();
  } finally {
    if (saved) globalThis.getComputedStyle = saved;
    else delete globalThis.getComputedStyle;
  }
}

test('PD-305-05: under 640px the final result is a phone layout (Gh305AuditFrames frame 2): unscaled, one column, i5-phone B sizes', () => {
  const phone = media(PLAY_CSS, '(max-width: 639px)');
  const R = (sel) => rule(phone, `.pd-viewport[data-result]${sel ? ` ${sel}` : ''}`);
  assert.match(R(''), /overflow-y:\s*auto/, 'the page scrolls past the fold');
  assert.match(R('.pd-scaled'), /transform:\s*none/);
  assert.match(R('.pd-frame'), /position:\s*static/);
  assert.match(R('.pd-frame'), /padding:\s*16px;/);
  assert.match(R('.pd-ev'), /font-size:\s*22px/);
  assert.match(R('.pd-spot'), /position:\s*static/);
  assert.match(R('.pd-spot'), /text-align:\s*start/);
  assert.match(R('.pd-spot h2'), /margin:\s*12px 0 0;/);
  assert.match(R('.pd-spot h2'), /font-size:\s*22px/);
  assert.match(R('.pd-spot .pd-pz'), /margin-block-start:\s*18px/);
  assert.match(R('.pd-spot .pd-pz'), /font-size:\s*18px/);
  // The winner leads: 50px, its fit floor 24px (NEW VALUE, NAME FIT at 320), its glow at 24px.
  const winner = R('.pd-spot .pd-wn');
  assert.match(winner, /--fit-size:\s*50;/);
  assert.match(winner, /--fit-floor:\s*24;/);
  assert.match(winner, /line-height:\s*1\.1;/);
  assert.match(winner, /text-shadow:\s*0 0 24px var\(--pd-glow\)/);
  assert.match(winner, /text-align:\s*start/, 'a wrapped winner stays left, as frame 2 draws it');
  // The prize cards in one column, 10px apart, 18px under the winner.
  const cards = R('.pd-wcards');
  assert.match(cards, /position:\s*static/);
  assert.match(cards, /grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(cards, /gap:\s*10px;/);
  assert.match(cards, /margin-block-start:\s*18px/);
  assert.match(R('.pd-wcard'), /padding:\s*16px;/);
  assert.match(R('.pd-wcard .pd-pz'), /font-size:\s*16px/);
  const name = R('.pd-wcard .pd-wn');
  assert.match(name, /--fit-size:\s*22;/);
  assert.match(name, /--fit-floor:\s*21;/);
  assert.match(name, /line-height:\s*1\.15;/);
  assert.match(name, /text-align:\s*start/);
  // A phone rule that pinned nowrap on a name would cancel the fit rule's last resort (.nm-wrap).
  assert.doesNotMatch(phone, /\[data-result\][^{]*\.pd-wn\s*\{[^}]*white-space/);
});

test('PD-305-05: the stage marks the result screen for its phone layout, and only that screen', async () => {
  const origin = fakeOrigin();
  walked(origin, true);
  const s = await mount({ origin });
  const viewport = s.root.querySelector('.pd-viewport');
  assert.equal(s.frame.getAttribute('data-screen'), 'result');
  assert.equal(viewport.hasAttribute('data-result'), true);
  assert.equal(viewport.hasAttribute('data-field'), false);
  assert.equal(viewport.hasAttribute('data-lanes'), false);
  const plain = fakeOrigin();
  storedEvent(plain, { n: 50 });
  const r = await mount({ origin: plain });
  assert.equal(r.root.querySelector('.pd-viewport').hasAttribute('data-result'), false);
});

test('PD-305-05: a layout\'s --fit-floor becomes the name\'s floor, and the surface floor comes back without it', async () => {
  const doc = makeDoc();
  const frame = doc.createElement('div');
  const winners = [1, 2, 3].map((place) => ({ place, prize: `P${place}`, name: `N${place}` }));
  renderScreen(frame, { kind: 'result', eventName: 'E', winners }, doc);
  const floors = () => [...frame.querySelectorAll('[data-fit-floor]')].map((b) => b.getAttribute('data-fit-floor'));
  assert.deepEqual(floors(), ['132', '35', '35'], 'the projector floors (FIT)');
  await withFloors({ 'pd-spot': 24, 'pd-wcard': 21 }, () => layoutFloors(frame));
  assert.deepEqual(floors(), ['24', '21', '21'], 'the phone layout\'s floors');
  await withFloors({}, () => layoutFloors(frame));
  assert.deepEqual(floors(), ['132', '35', '35'], 'back at the projector floors');
  // The stage applies them on its own render, after the screen is marked.
  const origin = fakeOrigin();
  walked(origin, true);
  await withFloors({ 'pd-spot': 24, 'pd-wcard': 21 }, async () => {
    const s = await mount({ origin });
    assert.equal(s.frame.querySelector('.pd-spot').querySelector('.pd-wn').getAttribute('data-fit-floor'), '24');
  });
});

test('PD-305-05: crossing 640px on the result re-fits at the new layout\'s floors: phone 24/21, projector 132/35, phone again', async () => {
  // A window whose width the test moves; the stylesheet's floors answer only under 640, as its @media does.
  const listeners = [];
  const win = { innerWidth: 320, addEventListener: (type, fn) => type === 'resize' && listeners.push(fn) };
  const resize = (w) => {
    win.innerWidth = w;
    for (const fn of listeners) fn();
  };
  const doc = makeDoc();
  doc.defaultView = win;
  const origin = fakeOrigin();
  walked(origin, true);
  await withFloors({ 'pd-spot': 24, 'pd-wcard': 21 }, async () => {
    const phoneFloors = globalThis.getComputedStyle;
    globalThis.getComputedStyle = (box) => {
      const cs = phoneFloors(box);
      return { ...cs, getPropertyValue: (k) => (win.innerWidth < 640 ? cs.getPropertyValue(k) : '') };
    };
    const s = await mount({ origin, doc });
    for (const cb of s.frames.splice(0)) cb(); // the first refit, at 320
    const floors = () => [...s.frame.querySelectorAll('[data-fit-floor]')].map((b) => b.getAttribute('data-fit-floor'));
    const phone = ['24', '21'];
    const projector = ['132', '35'];
    assert.deepEqual([...new Set(floors())], phone, 'at 320, the phone floors');
    resize(1920);
    assert.deepEqual([...new Set(floors())], projector, 'widened past 640, every name is back at its projector floor');
    resize(320);
    assert.deepEqual([...new Set(floors())], phone, 'narrowed again, the phone floors');
  });
});

test('PD-307-03: at 1920 the lane-pick HUD line breaks at its own space, each half on one line; the phone layout is unchanged', async () => {
  const origin = fakeOrigin();
  walked(origin, false);
  const s = await mount({ origin });
  assert.equal(s.frame.getAttribute('data-screen'), 'lanes');
  const hud = s.frame.querySelector('.pd-hud2').querySelector('.pd-lk');
  assert.equal(hud.textContent, 'ให้ผู้เข้ารอบชิงเลือกเส้น\nแตะเส้นแล้วแตะชื่อ');
  assert.match(rule(PLAY_CSS, '.pd-hud2 .pd-lk'), /white-space:\s*pre;/, 'the break holds, and neither half wraps');
  // PD-307-01 (owner-ratified phone lanes): the break is a plain space again there.
  assert.match(rule(media(PLAY_CSS, '(max-width: 639px)'), '.pd-viewport[data-lanes] .pd-hud2 .pd-lk'), /white-space:\s*normal;/);
});

test('owner-approved copy, byte for byte: the deal press, the lane-pick line, the two card rules in full; lane labels are the digits the frame draws', () => {
  assert.equal(CARDS.ruleInFull.clubs, 'ดอกจิกอยู่ต่อ ดอกอื่นตกรอบ');
  assert.equal(CARDS.ruleInFull.face, 'ไพ่หน้าคนอยู่ต่อ ไพ่อื่นตกรอบ');
  assert.match(STAGE, /deal: 'แจกไพ่',/);
  assert.match(STAGE, /lanePick: 'ให้ผู้เข้ารอบชิงเลือกเส้น แตะเส้นแล้วแตะชื่อ',/);
  assert.match(STAGE, /lane: \(lane: number\): string => String\(lane\),/);
  assert.doesNotMatch(STAGE, /\[copy:/, 'an owner placeholder is left on the projector');
});

test('the projector lane picks draw every rail line in the 50% rail colour (PD-307-04)', () => {
  const doc = makeDoc();
  const frame = doc.createElement('div');
  renderLanes(
    frame,
    {
      eventName: 'งาน',
      dots: [],
      prizes: ['ก', 'ข'],
      slotRanks: [0, 1, 2, 3, 4],
      names: [],
      plates: [null, null, null, null, null],
      next: 0,
      laneLabel: (lane) => `${lane}`,
      picking: 'x',
    },
    doc,
  );
  const lines = frame.all().filter((e) => e.tagName === 'LINE');
  assert.equal(lines.length, 10, 'two rail segments per lane');
  for (const l of lines) assert.equal(l.getAttribute('stroke'), '#7a7897');
});
