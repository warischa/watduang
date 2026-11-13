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
  // Only the screens with a name field take it; the lanes, the result and the cold screen keep the frame.
  assert.match(STAGE, /const FIELD_SCREENS = new Set\(\['round', 'reveal', 'final'\]\)/);
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

test('owner-approved copy, byte for byte: the deal press, the lane-pick line, the two card rules in full; lane labels are the digits the frame draws', () => {
  assert.equal(CARDS.ruleInFull.clubs, 'ดอกจิกอยู่ต่อ ดอกอื่นตกรอบ');
  assert.equal(CARDS.ruleInFull.face, 'ไพ่หน้าคนอยู่ต่อ ไพ่อื่นตกรอบ');
  assert.match(STAGE, /deal: 'แจกไพ่',/);
  assert.match(STAGE, /lanePick: 'ให้ผู้เข้ารอบชิงเลือกเส้น แตะเส้นแล้วแตะชื่อ',/);
  assert.match(STAGE, /lane: \(lane: number\): string => String\(lane\),/);
  assert.doesNotMatch(STAGE, /\[copy:/, 'an owner placeholder is left on the projector');
});
