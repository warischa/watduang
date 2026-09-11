// node --test src/games/daily-fortune.test.mjs — no framework, no dependency
// gh#99: the page is a one-press comedy fortune. The invariant the whole thing rests on is the
// draw: three lines, one from each of three pools that never overlap ("eat", "money", "travel"),
// each carrying a luck value, and a verdict that is the sum of those three and nothing else.
// A wrong selector renders perfectly while being wrong, so the selector is checked against two
// deliberately broken ones below — if those do not fail, this file proves nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import game, {
  POOLS,
  drawFortune,
  luckSum,
  verdictFor,
  bangkokDate,
  thaiDayLabel,
  hashPick,
  normalizeName,
} from './daily-fortune.ts';
import { ARM_DELAY_MS } from './_arm-gate.ts';

// ---- Minimal fake DOM — the harness this repo already uses (lifted from short-stick.test.mjs),
// no jsdom/happy-dom dependency.
class FakeElement {
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
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren() { this.children = []; }
  addEventListener(type, fn) { (this._listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn);
  }
  dispatch(type) { (this._listeners[type] || []).forEach((fn) => fn()); }
  // A disabled control dispatches no activation — the platform swallows the click before any
  // listener runs. The fake models that on purpose: without it every gate assertion passes vacuously.
  click() { if (!this.disabled) this.dispatch('click'); }
}
const fakeDocument = { createElement: (tag) => new FakeElement(tag) };
globalThis.document = fakeDocument;

// The page asks for nobody, so the context carries an empty group on every mount.
function makeCtx() {
  return {
    roster: { names: () => [], add() {} },
    session: {
      players: [],
      setPlayers() {},
      played: [],
      markPlayed() {},
      checkpoint: null,
      saveCheckpoint() {},
      clear() {},
    },
  };
}

function collect(node, pred, out = []) {
  if (pred(node)) out.push(node);
  for (const c of node.children || []) collect(c, pred, out);
  return out;
}
const byClass = (node, cls) => collect(node, (n) => n.className === cls);
const findById = (node, id) => collect(node, (n) => n.id === id)[0] ?? null;
const findByTag = (node, tag) => collect(node, (n) => (n.tagName || '').toUpperCase() === tag)[0] ?? null;

// A fixed generator, so every result in this file is pass-always or fail-always: no Math.random
// anywhere, and a failure reproduces on the next run.
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const ALL_LINES = POOLS.flatMap((p) => p.lines);
const poolIndexOf = (line) => POOLS.findIndex((p) => p.lines.some((l) => l.text === line.text));

// ---- The seam. This runs against the shipped selector AND against broken ones. ----
function assertDrawInvariants(drawFn, draws) {
  const rand = lcg(20260911);
  for (let i = 0; i < draws; i++) {
    const lines = drawFn(rand);
    assert.equal(lines.length, POOLS.length, `draw ${i}: expected one line per pool`);
    const pools = lines.map(poolIndexOf);
    assert.ok(pools.every((p) => p >= 0), `draw ${i}: drew a line that belongs to no pool`);
    assert.equal(new Set(pools).size, POOLS.length, `draw ${i}: two lines came from the same pool`);
    assert.equal(new Set(lines.map((l) => l.text)).size, POOLS.length, `draw ${i}: a line repeated inside one draw`);
  }
}

test('one press draws one line per pool, never two from the same pool, never a repeat', () => {
  assertDrawInvariants(drawFortune, 2000);

  // Every line is reachable, or a pool entry is dead weight nobody ever reads.
  const seen = new Set();
  const rand = lcg(7);
  for (let i = 0; i < 4000; i++) for (const line of drawFortune(rand)) seen.add(line.text);
  assert.equal(seen.size, ALL_LINES.length, `only ${seen.size}/${ALL_LINES.length} lines are reachable`);
});

test('calibration: the check above goes red on a selector that draws from one flat pool', () => {
  // Mutant 1 — flat pool with replacement: can hand back the same line twice.
  const flatWithRepeat = (rand) =>
    Array.from({ length: POOLS.length }, () => ALL_LINES[Math.floor(rand() * ALL_LINES.length)]);
  assert.throws(() => assertDrawInvariants(flatWithRepeat, 300), /repeated inside one draw|same pool/);

  // Mutant 2 — flat pool WITHOUT replacement: three distinct lines, so a distinctness-only check
  // stays green while two of them are about the same thing. This is the one that matters.
  const flatDistinct = (rand) => {
    const picked = [];
    while (picked.length < POOLS.length) {
      const line = ALL_LINES[Math.floor(rand() * ALL_LINES.length)];
      if (!picked.some((l) => l.text === line.text)) picked.push(line);
    }
    return picked;
  };
  assert.throws(() => assertDrawInvariants(flatDistinct, 300), /same pool/);
});

test('the pools: disjoint, non-blank, and each one can swing the verdict both ways', () => {
  assert.equal(POOLS.length, 3, 'the ticket specifies exactly three pools');
  assert.deepEqual(POOLS.map((p) => p.key), ['eat', 'money', 'travel']);
  for (const pool of POOLS) {
    assert.ok(pool.lines.length >= 4, `pool ${pool.key} ships ${pool.lines.length} lines, the starter size is 4`);
    assert.ok(pool.label.trim().length > 0, `pool ${pool.key} has no label`);
    for (const line of pool.lines) {
      assert.ok(line.text.trim().length > 0, `blank line in pool ${pool.key}`);
      assert.ok([-1, 0, 1].includes(line.luck), `pool ${pool.key} carries luck ${line.luck}`);
    }
    // Without both signs in every pool the sum cannot reach -3 or +3, and the end bands are dead.
    assert.ok(pool.lines.some((l) => l.luck === 1), `pool ${pool.key} has no +1 line`);
    assert.ok(pool.lines.some((l) => l.luck === -1), `pool ${pool.key} has no -1 line`);
  }
  const texts = ALL_LINES.map((l) => l.text);
  assert.equal(new Set(texts).size, texts.length, 'the same line appears in two pools — they must never overlap');
});

test('the verdict is the sum and nothing else: five bands, both ends included', () => {
  const bands = [];
  for (let sum = -3; sum <= 3; sum++) {
    const v = verdictFor(sum);
    assert.ok(typeof v === 'string' && v.trim().length > 0, `no verdict for sum ${sum}`);
    if (!bands.includes(v)) bands.push(v);
  }
  assert.equal(bands.length, 5, `expected five verdict bands, got ${bands.length}`);
  // The two ends are real, distinct bands and not a fallback.
  assert.notEqual(verdictFor(-3), verdictFor(3));
  assert.equal(verdictFor(-3), verdictFor(-2), 'the worst band covers -3 and -2');
  assert.equal(verdictFor(3), verdictFor(2), 'the best band covers +3 and +2');
  // Monotone: a better sum never returns a band that a worse sum already used.
  for (let sum = -3; sum < 3; sum++) {
    assert.ok(bands.indexOf(verdictFor(sum)) <= bands.indexOf(verdictFor(sum + 1)), `band order breaks at ${sum}`);
  }
  assert.equal(luckSum([{ luck: 1 }, { luck: 0 }, { luck: -1 }]), 0);
});

test('the Bangkok day is Bangkok\'s, not the device\'s, and the day label follows it across midnight', () => {
  const before = new Date('2026-08-24T16:59:59Z'); // 23:59:59 in Bangkok
  const after = new Date('2026-08-24T17:00:00Z'); // 00:00:00 the next Bangkok day
  assert.equal(bangkokDate(before), '2026-08-24');
  assert.equal(bangkokDate(after), '2026-08-25');
  assert.notEqual(thaiDayLabel(bangkokDate(before)), thaiDayLabel(bangkokDate(after)),
    'the displayed label did not move when the Bangkok day did');
  // 2026-08-25 is a Tuesday: the label carries that weekday, the day number and the month.
  assert.equal(thaiDayLabel('2026-08-25'), 'อ. 25 ส.ค.');
  assert.equal(thaiDayLabel('2026-01-01'), 'พฤ. 1 ม.ค.');
});

test('hashPick and normalizeName survive for love-match, which imports them from here', () => {
  assert.equal(normalizeName('  Bank  Ploy '), 'bank ploy');
  assert.throws(() => hashPick('seed', []), /empty pool/);
  assert.equal(hashPick('seed', ['a', 'b', 'c']), hashPick('seed', ['a', 'b', 'c']));
});

// ---- The page ----

test('the page never asks for a name and never asks who is playing', () => {
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx());
  assert.equal(findByTag(stage, 'INPUT'), null, 'an input renders on the idle screen');
  assert.equal(findByTag(stage, 'FORM'), null, 'a form renders on the idle screen');
  assert.equal(collect(stage, (n) => n.tagName === 'button').length, 1, 'the idle screen has exactly one control');
  assert.equal(findByTag(stage, 'A'), null, 'an <a> renders inside #stage — ADR-0014');
  assert.equal(game.players[0], 1);
  assert.equal(game.players[1], 1);
  game.dispose();
});

test('it says it is a joke above the draw button, where a horoscope searcher reads it first', () => {
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx());
  const joke = byClass(stage, 'df-joke')[0];
  assert.ok(joke, 'no joke line on the idle screen');
  assert.ok(joke.textContent.includes('ขำๆ'), `the joke line does not say so: ${joke.textContent}`);
  const order = collect(stage, () => true);
  assert.ok(order.indexOf(joke) < order.indexOf(findById(stage, 'df-go')),
    'the joke line renders after the draw button, so it is below the press');
  // And the search result itself says it, before anyone reaches the page.
  assert.ok(/ขำๆ|ไม่จริงจัง/.test(game.seo.description), 'the search snippet does not say this is a joke');
  assert.ok(/ขำๆ|ไม่จริงจัง/.test(game.tagline), 'the tagline does not say this is a joke');
  game.dispose();
});

// The draw runs on Math.random, so the two end-of-range checks rig it: 0 takes the first line of
// every pool, 0.999 takes the last. The pools are ordered +1 first and -1 last for exactly this.
function drawWith(value, t) {
  const stage = fakeDocument.createElement('div');
  const realRandom = Math.random;
  Math.random = () => value;
  try {
    game.mount(stage, makeCtx());
    const go = findById(stage, 'df-go');
    assert.equal(go.disabled, true, 'the draw control must be gated at mount — a ghost tap must not press it');
    t.mock.timers.tick(ARM_DELAY_MS + 1);
    go.click();
  } finally {
    Math.random = realRandom;
  }
  return stage;
}

function readLines(stage) {
  return byClass(stage, 'df-line-text').map((p) => {
    const line = ALL_LINES.find((l) => l.text === p.textContent);
    assert.ok(line, `the page rendered "${p.textContent}", which is not a whole pool line`);
    return line;
  });
}

test('one press renders exactly three whole lines, one per pool, with the verdict their sum names', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = drawWith(0.42, t);
  const lines = readLines(stage);
  assert.equal(lines.length, 3, `the result screen shows ${lines.length} lines`);
  assert.equal(new Set(lines.map(poolIndexOf)).size, 3, 'two rendered lines come from the same pool');

  const verdict = byClass(stage, 'df-verdict')[0];
  assert.ok(verdict, 'no verdict rendered');
  assert.equal(verdict.textContent, verdictFor(luckSum(lines)),
    'the verdict on the page is not the one the three rendered lines sum to');

  // The pool label is shown per line, so the reader can see the three are about different things.
  assert.deepEqual(byClass(stage, 'df-line-cat').map((s) => s.textContent), POOLS.map((p) => p.label));
  assert.equal(findByTag(stage, 'A'), null, 'an <a> renders inside #stage — ADR-0014');

  // The date on the page is the Bangkok day, not the device day.
  const date = byClass(stage, 'df-date')[0];
  assert.ok(date, 'no date on the result screen');
  assert.equal(date.textContent, thaiDayLabel(bangkokDate(new Date())));
  game.dispose();
});

test('both ends of the range: an all-lucky draw and an all-unlucky draw get the end verdicts', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const best = drawWith(0, t);
  assert.equal(luckSum(readLines(best)), 3, 'the rigged draw did not reach +3 — reorder the pools');
  assert.equal(byClass(best, 'df-verdict')[0].textContent, verdictFor(3));
  game.dispose();

  const worst = drawWith(0.999, t);
  assert.equal(luckSum(readLines(worst)), -3, 'the rigged draw did not reach -3 — reorder the pools');
  assert.equal(byClass(worst, 'df-verdict')[0].textContent, verdictFor(-3));
  assert.notEqual(byClass(worst, 'df-verdict')[0].textContent, verdictFor(3));
  game.dispose();
});

test('gh#42 ghost-tap gate: the redraw control is dead the instant the result screen appears', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = drawWith(0.31, t);
  const again = findById(stage, 'df-again');
  assert.ok(again, 'no redraw control on the result screen');
  assert.equal(again.disabled, true, 'the redraw control is live at reveal — a ghost tap skips the fortune nobody read');

  const first = byClass(stage, 'df-line-text').map((p) => p.textContent);
  again.click();
  assert.deepEqual(byClass(stage, 'df-line-text').map((p) => p.textContent), first,
    'a disabled redraw fired anyway — the screen changed under the reader');

  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(again.disabled, false, 'the redraw control never armed');
  again.click();
  assert.equal(byClass(stage, 'df-line-text').length, 3, 'the armed redraw did not produce a new draw');
  game.dispose();
});

// ADR-0033: the values below come from design/DuangTodayResult.dc.html, which is the approved
// canvas for this redesign. A cramped line card is the failure this pins: the text must be able to
// grow, and it must stay at the size the canvas sets.
test('the line cards own their height and keep the canvas type size', () => {
  const css = readFileSync(new URL('./../styles/games/daily-fortune.css', import.meta.url), 'utf8');
  for (const cls of ['df-line', 'df-line-text', 'df-verdict-card', 'df-verdict']) {
    const rule = new RegExp(`\\.${cls}(?![\\w-])\\s*\\{([^}]*)\\}`).exec(css);
    assert.ok(rule, `.${cls} rule missing from daily-fortune.css`);
    assert.ok(!/(?<![\w-])height\s*:/.test(rule[1]), `.${cls} declares a fixed height`);
    assert.ok(!/(?<![\w-])overflow\s*:/.test(rule[1]), `.${cls} declares overflow (scroll/clip)`);
  }

  // Every block, not just the first: a later rule could shrink the rendered text while a
  // first-match check stayed green.
  const floors = { 'df-line-text': 15, 'df-verdict': 24 };
  for (const [cls, floor] of Object.entries(floors)) {
    const blocks = [...css.matchAll(new RegExp(`\\.${cls}(?![\\w-])[^{}]*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]);
    assert.ok(blocks.length > 0, `no .${cls} rule found at all — the extractor matched nothing`);
    const sizes = blocks
      .map((body) => /(?<![\w-])font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem|em)/.exec(body))
      .filter(Boolean);
    assert.ok(sizes.length > 0, `.${cls} declares no font-size, so it silently inherits the shell size`);
    for (const s of sizes) {
      assert.equal(s[2], 'px', `.${cls} uses ${s[2]}, which this floor cannot compare to the canvas px value`);
      assert.ok(Number(s[1]) >= floor, `.${cls} is ${s[1]}px, below the canvas value of ${floor}px`);
    }
  }
});
