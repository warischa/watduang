// Self-check for the shared test harness — node --test src/games/_fake-dom.test.mjs
//
// Every hole below is proven closed twice: once positively (the new template does the right thing)
// and once as a must-red control that reconstructs the OLD inlined shape and asserts it FAILS the
// same check. Without the control, a green here would only prove the assertions run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeElement, makeDocument, makeWindow } from './_fake-dom.mjs';
import { exportedStrings, copyOf } from './_module-copy.mjs';

// The fake DOM as all six game tests inlined it before this template existed. Reproduced here as
// the positive control's negative leg: each hole must be demonstrably present in this shape.
class OldFakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this._text = '';
    this.style = {};
    this._attrs = {};
    this._listeners = {};
    this.disabled = false;
    this.hidden = false;
  }
  set textContent(v) { this._text = v; }
  get textContent() { return this._text; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  appendChild(child) { this.children.push(child); return child; }
}
const oldMatchMedia = () => ({ matches: true }); // the frozen object every test used

// ---- Hole (a): innerHTML must expose children ----------------------------------------------

test('(a) innerHTML assignment exposes real children — the old fake shows none', () => {
  const markup = '<div class="pl-burst"><svg viewBox="0 0 10 10"><path d="M0 0"/></svg>' +
    '<span class="pl-name">เอ</span></div>';

  // must-red control: the old shape stored the string and nothing became a child
  const old = new OldFakeElement('div');
  old.innerHTML = markup;
  assert.equal(old.children.length, 0,
    'control invalid: the old fake already exposed children, so hole (a) was never a hole');
  assert.equal(typeof old.querySelector, 'undefined',
    'control invalid: the old fake could already be queried');

  const box = new FakeElement('div');
  box.innerHTML = markup;
  assert.equal(box.children.length, 1, 'the outer div must exist as a child');
  const svg = box.querySelector('svg');
  assert.ok(svg, 'an element rendered through innerHTML must be reachable');
  assert.equal(svg.getAttribute('viewBox'), '0 0 10 10', 'attributes must survive the parse');
  assert.equal(box.querySelector('.pl-name').textContent, 'เอ', 'text inside markup must be readable');
  assert.equal(box.innerHTML, markup, 'the raw string must still round-trip');
});

test('(a) an <a href> hidden inside an innerHTML constant is findable — the ADR-0014 blind spot', () => {
  // This is power-meter mutant 1: the sweep read stage.children and the link lived in a markup
  // constant, so a violating link survived a green test suite.
  const stage = new FakeElement('div');
  stage.innerHTML = '<section><p>ok</p><a href="/">กลับหน้าแรก</a></section>';
  assert.equal(stage.querySelectorAll('a').length, 1,
    'a link inside a markup constant must be visible to a stage sweep');
  assert.equal(stage.querySelectorAll('[href]').length, 1);

  const clean = new FakeElement('div');
  clean.innerHTML = '<section><p>ok</p><button type="button">ไป</button></section>';
  assert.equal(clean.querySelectorAll('a').length, 0, 'a clean stage must report zero links');
});

test('(a) innerHTML replaces children and void/self-closing tags do not swallow siblings', () => {
  const box = new FakeElement('div');
  box.appendChild(new FakeElement('span'));
  box.innerHTML = '<p>หนึ่ง</p><br><img src="x.png"><p>สอง</p>';
  assert.deepEqual(box.children.map((c) => c.tagName), ['p', 'br', 'img', 'p'],
    'a void tag must not become a parent, and innerHTML must replace the pre-existing child');
  assert.equal(box.children[3].textContent, 'สอง');
  assert.equal(box.querySelectorAll('p').length, 2);
});

// ---- Hole (b): matchMedia must register listeners ------------------------------------------

test('(b) a matchMedia listener fires on change — the old fake could not register one', () => {
  // must-red control
  const oldMql = oldMatchMedia('(prefers-reduced-motion: reduce)');
  assert.equal(typeof oldMql.addEventListener, 'undefined',
    'control invalid: the old matchMedia already took listeners, so hole (b) was never a hole');

  const win = makeWindow({ reducedMotion: false });
  const mql = win.matchMedia('(prefers-reduced-motion: reduce)');
  assert.equal(mql.matches, false);

  const seen = [];
  const onChange = (e) => seen.push(e.matches);
  mql.addEventListener('change', onChange);
  assert.equal(win.mediaListeners(), 1, 'the listener must be registered');

  win.setReducedMotion(true);
  assert.deepEqual(seen, [true], 'the listener must fire on the flip');
  assert.equal(mql.matches, true, 'the same MediaQueryList must report the new value');
  assert.equal(win.matchMedia('(prefers-reduced-motion: reduce)').matches, true,
    'a later matchMedia() call must see the same state');

  mql.removeEventListener('change', onChange);
  win.setReducedMotion(false);
  assert.deepEqual(seen, [true], 'a removed listener must not fire — this is the leak detector');
  assert.equal(win.mediaListeners(), 0, 'dispose() leaking a media listener must be visible here');
});

// ---- Hole (c): clientWidth must be non-zero -------------------------------------------------

test('(c) clientWidth is non-zero — the old fake reported 0 and hid every layout branch', () => {
  const old = new OldFakeElement('div');
  assert.equal(old.clientWidth ?? 0, 0,
    'control invalid: the old fake already had a width, so hole (c) was never a hole');

  const box = new FakeElement('div');
  assert.ok(box.clientWidth > 0, 'a mounted element must have a width');
  assert.ok(box.clientHeight > 0);
  box.clientWidth = 320; // the narrowest supported phone, settable per test
  assert.equal(box.clientWidth, 320);
  assert.ok(makeDocument().createElement('div').clientWidth > 0,
    'elements from document.createElement must carry the width too');
});

// ---- document ------------------------------------------------------------------------------

test('makeDocument records dispatched events and hands out parsed-capable elements', () => {
  const doc = makeDocument();
  doc.dispatchEvent(new CustomEvent('watduang:change-players'));
  assert.deepEqual(doc.dispatchedTypes(), ['watduang:change-players']);
  const el = doc.createElement('DIV');
  assert.equal(el.tagName, 'div');
  el.innerHTML = '<b>x</b>';
  assert.equal(el.children.length, 1);
});

// ---- the copy extractor ----------------------------------------------------------------------

test('exportedStrings flattens nested exports and skips non-strings', () => {
  const mod = {
    COPY: { AGAIN: 'เล่นอีกรอบ', nested: { HINT: 'กันนิ้วลั่น' } },
    FORTUNES: [{ text: 'ดี' }, { text: 'ร้าย' }],
    DELAY_MS: 400,
    mount() {},
  };
  const strings = exportedStrings(mod);
  assert.equal(strings.get('COPY.AGAIN'), 'เล่นอีกรอบ');
  assert.equal(strings.get('COPY.nested.HINT'), 'กันนิ้วลั่น');
  assert.equal(strings.get('FORTUNES.1.text'), 'ร้าย');
  assert.ok(!strings.has('DELAY_MS'), 'numbers are not copy');
  assert.ok(!strings.has('mount'), 'functions are not copy');
});

test('copyOf throws on an unknown key instead of comparing against undefined', () => {
  const copy = copyOf({ COPY: { AGAIN: 'เล่นอีกรอบ' } });
  assert.equal(copy['COPY.AGAIN'], 'เล่นอีกรอบ');
  assert.throws(() => copy['COPY.TYPO'], /no exported string at "COPY.TYPO"/);
});
