// node --test src/games/daily-fortune.test.mjs — no framework, no dependency
// checks only the pure draw exported from daily-fortune.ts (no DOM needed).
// The invariant under test is the one the game exists for (#33): the fortune is a pure function of
// (normalized name, Bangkok date) — same pair same answer, new day new answer, whole pool reachable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import game, { FORTUNES, bangkokDate, fortuneFor, hashPick, normalizeName } from './daily-fortune.ts';
import { ARM_DELAY_MS } from './_arm-gate.ts';

// ---- Minimal fake DOM for the #42 gate test below — lifted from short-stick.test.mjs's harness
// (the reference DOM harness in this repo, no jsdom/happy-dom dependency) rather than inventing a second one.
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

function makeCtx(players) {
  return {
    roster: { names: () => [], add() {} },
    session: {
      players,
      setPlayers() {},
      played: [],
      markPlayed() {},
      checkpoint: null,
      saveCheckpoint() {},
      clear() {},
    },
  };
}

// The reveal path builds nested cards, so the shallow stage.children lookups that served the ask
// screen no longer reach the button or the name — walk recursively instead.
function findByClass(node, cls) {
  if (node.className === cls) return node;
  for (const c of node.children || []) {
    const hit = findByClass(c, cls);
    if (hit) return hit;
  }
  return null;
}
function findById(node, id) {
  if (node.id === id) return node;
  for (const c of node.children || []) {
    const hit = findById(c, id);
    if (hit) return hit;
  }
  return null;
}
function findByTag(node, tag) {
  if (node.tagName && node.tagName.toUpperCase() === tag) return node;
  for (const c of node.children || []) {
    const hit = findByTag(c, tag);
    if (hit) return hit;
  }
  return null;
}

// A fixed name space — no RNG anywhere in this file, so every result is pass-always or fail-always.
const FIRST = ['ก้อง', 'ฟ้า', 'ตูน', 'แนน', 'บอส', 'มิ้น', 'เจ', 'ปอ', 'หมิว', 'ต้น', 'ใบเตย', 'ขวัญ',
  'Bank', 'Ploy', 'Jane', 'Nice'];
const LAST = ['', ' ใหญ่', ' เล็ก', ' น้อย', 'ๆ', '1', '2', '3', 'อร', 'ณี', 'ชัย', 'พร'];
const NAMES = FIRST.flatMap((f) => LAST.map((l) => `${f}${l}`)); // 192 distinct names
const DAYS = Array.from({ length: 60 }, (_, i) => `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`);

test('the pool itself: ~50 distinct lines, none blank', () => {
  assert.ok(FORTUNES.length >= 48, `pool is ${FORTUNES.length} items`);
  // A duplicate line keeps coverage looking full while two draws read identically to a player.
  assert.equal(new Set(FORTUNES).size, FORTUNES.length, 'the pool contains a duplicate line');
  for (const f of FORTUNES) assert.ok(f.trim().length > 0, 'blank fortune in the pool');
});

test('same name + same Bangkok day → the same fortune, every time it is asked', () => {
  for (const name of NAMES) {
    const first = fortuneFor(name, '2026-08-15');
    // A negative index would return undefined, and undefined === undefined would pass this test.
    assert.ok(FORTUNES.includes(first), `"${name}" drew something that is not in the pool: ${first}`);
    for (let again = 0; again < 5; again++) {
      assert.equal(fortuneFor(name, '2026-08-15'), first, `"${name}" changed on repeat draw ${again}`);
    }
  }
});

test('a new day deals a new fortune to nearly everyone', () => {
  // Not 100% by construction: with a 50-item pool two consecutive days collide for roughly 1 name
  // in 50 by chance, and asserting 100% would be asserting something false.
  let changed = 0;
  for (const name of NAMES) {
    if (fortuneFor(name, '2026-08-15') !== fortuneFor(name, '2026-08-16')) changed++;
  }
  const fraction = changed / NAMES.length;
  assert.ok(fraction >= 0.9, `only ${changed}/${NAMES.length} names changed fortune overnight (${fraction})`);

  // And it is not just one lucky pair of days — every day must move most of the group.
  for (let i = 1; i < DAYS.length; i++) {
    const moved = NAMES.filter((n) => fortuneFor(n, DAYS[i - 1]) !== fortuneFor(n, DAYS[i])).length;
    assert.ok(moved / NAMES.length >= 0.85, `${DAYS[i - 1]} → ${DAYS[i]}: only ${moved}/${NAMES.length} moved`);
  }
});

test('every line in the pool is reachable — no fortune nobody can ever draw', () => {
  const seen = new Set();
  for (const name of NAMES) for (const day of DAYS) seen.add(fortuneFor(name, day));
  assert.equal(seen.size, FORTUNES.length, `only ${seen.size}/${FORTUNES.length} lines are reachable`);

  // Same claim one level down, against the raw picker: consecutive integer seeds must cover the pool.
  const direct = new Set();
  for (let i = 0; i < 5000; i++) direct.add(hashPick(`seed-${i}`, FORTUNES));
  assert.equal(direct.size, FORTUNES.length, `hashPick reaches only ${direct.size}/${FORTUNES.length}`);
});

test('names normalise: surrounding and internal spaces, Latin case, Thai composition', () => {
  const day = '2026-08-15';
  const base = fortuneFor('ก้อง', day);
  assert.equal(fortuneFor(' ก้อง ', day), base, 'padding changed the fortune');
  assert.equal(fortuneFor('\tก้อง\n', day), base, 'tab/newline padding changed the fortune');
  assert.equal(fortuneFor('ก้อง  ใหญ่', day), fortuneFor('ก้อง ใหญ่', day), 'double space changed the fortune');
  // Latin case only — Thai has no case, so toLowerCase leaves it byte-identical.
  assert.equal(fortuneFor('BANK', day), fortuneFor('bank', day), 'Latin case changed the fortune');
  assert.equal(fortuneFor('Bank', day), fortuneFor('bank', day), 'Latin case changed the fortune');
  // NFC folds the two spellings of an accented Latin name (measured: Thai has no canonical
  // decomposition — '\u0E01\u0E49\u0E2D\u0E07', the fixture used above, is byte-identical under
  // NFD, so NFC is a Latin-only guard here). Written as escapes, not Thai script, because the #36
  // gate counts any Thai character in a comment; those codepoints are ko-kai, mai-tho, o-ang, ngo-ngu.
  const nfd = 'José'.normalize('NFD');
  assert.notEqual(nfd, 'José', 'this string has no decomposed form — pick another to test NFC with');
  assert.equal(fortuneFor(nfd, day), fortuneFor('José', day), 'a decomposed spelling drew a different fortune');
  // What deliberately does NOT normalise: two different people are two different names.
  assert.equal(normalizeName(' ก้อง '), 'ก้อง');
  assert.notEqual(normalizeName('ก้อง'), normalizeName('กอง'));

  // Zero-width characters: `\s` does not match them, so trim/collapse alone leaves them in and a
  // name pasted out of LINE or Facebook hashes differently from the identical-looking typed name.
  for (const [label, zw] of [['ZWSP', '\u200B'], ['ZWNJ', '\u200C'], ['ZWJ', '\u200D'], ['BOM', '\uFEFF']]) {
    assert.equal(normalizeName(`${zw}ก้อง${zw}`), 'ก้อง', `${label} survived normalisation`);
    assert.equal(fortuneFor(`ก้อง${zw}`, day), base, `${label} changed the fortune`);
  }
  // A name that is nothing but zero-width must not masquerade as a real one.
  assert.equal(normalizeName('\u200B\uFEFF'), '');

  // SARA AM: '\u0E33' is U+0E33 on a Thai keyboard, but NIKHAHIT + SARA AA (U+0E4D U+0E32) renders
  // identically and comes out of some PDFs and older systems. NFC does not fold the two, so
  // without an explicit rule the same-looking name draws a different fortune.
  const amComposed = '\u0E19\u0E33';       // NO NU + SARA AM
  const amDecomposed = '\u0E19\u0E4D\u0E32'; // NO NU + NIKHAHIT + SARA AA
  assert.notEqual(amComposed, amDecomposed, 'these must differ as strings, or this proves nothing');
  assert.equal(normalizeName(amDecomposed), amComposed, 'SARA AM spellings did not unify');
  assert.equal(fortuneFor(amDecomposed, day), fortuneFor(amComposed, day), 'SARA AM changed the fortune');
});

test('the date is Bangkok\'s, not the device\'s and not UTC', () => {
  // Injected instants — nothing here depends on when the suite runs.
  const beforeMidnight = new Date('2026-08-15T16:59:59Z'); // 23:59:59 in Bangkok
  const afterMidnight = new Date('2026-08-15T17:00:00Z'); // 00:00:00 the next day in Bangkok

  assert.match(bangkokDate(beforeMidnight), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(bangkokDate(beforeMidnight), '2026-08-15');
  assert.equal(bangkokDate(afterMidnight), '2026-08-16', 'Bangkok midnight did not roll the day over');

  // Machine-independent: at 17:00Z the UTC day is still the 15th. An implementation that sliced
  // toISOString() (or ran off a UTC device clock) fails here on any machine, in any timezone.
  assert.notEqual(bangkokDate(afterMidnight), afterMidnight.toISOString().slice(0, 10));

  // And the fortune moves with the Bangkok day, not the UTC one.
  assert.notEqual(
    fortuneFor('ก้อง', bangkokDate(beforeMidnight)),
    fortuneFor('ก้อง', bangkokDate(afterMidnight)),
  );
});

test('hashPick refuses an empty pool instead of returning undefined', () => {
  assert.throws(() => hashPick('ก้อง|2026-08-15', []), /empty pool/);
});

// #42: the ghost-tap gate — a rapid double-tap on a game-page transition must not steal an action.
test('#42: ghost-tap gate — "another" disables at reveal, roster chips stay live (documented exception)', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  const players = ['เอ', 'บี'];
  game.mount(stage, makeCtx(players));

  // renderAsk: df-go is a real render-function button, so it is gated like everything else here.
  const form = stage.children[1];
  const go = form.children[1];
  assert.equal(go.disabled, true, 'df-go must be disabled at mount — no exception applies to it');

  // renderAsk's roster chips are the documented exception: df-again → chip is the same finger tapping
  // through the roster, so gating them would break real play. They must stay live from the first render,
  // before any tick — that is what "exception" means, not "arms sooner than everything else".
  const chipsRow = stage.children[3];
  assert.equal(chipsRow.children.length, players.length, 'setup: one chip per roster name');
  for (const chip of chipsRow.children) {
    assert.equal(chip.disabled, false, `${chip.textContent} chip must stay live — the documented same-finger exception`);
  }

  chipsRow.children[0].click(); // reveals players[0]'s fortune, same as a real same-finger chip tap — and
  // this must actually work at t0, or the "stays live" assertion above proves nothing

  const again = findById(stage, 'df-again');
  assert.ok(again, 'df-again missing after reveal');
  assert.equal(again.disabled, true,
    'df-again must be disabled the instant the result screen renders — a ghost tap must not skip past the fortune nobody read yet');

  // The revealed name now paints inside the fortune card's name row (design/GameDailyFortune.dc.html).
  const nameEl = findByClass(stage, 'df-card-name');
  assert.ok(nameEl, 'renderResult did not paint the card name row');
  assert.equal(nameEl.textContent, players[0],
    'the revealed name must be exactly what was tapped, unaffected by the gate arming');

  // the ghost: a click before the window elapses must not fire — the result screen (fortune nobody
  // read yet) must still be exactly what the chip tap produced, not what "another" would have shown.
  again.click();
  assert.equal(findById(stage, 'df-again'), again,
    'a disabled "another" fired anyway — the result screen was already gone');
  assert.ok(!findById(stage, 'df-name'),
    'a disabled "another" fired anyway — the ask screen reappeared before the window elapsed');

  // and one window later the same press really does move on to the next player
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(again.disabled, false, '"another" never armed');
  again.click();
  assert.ok(findById(stage, 'df-name'),
    '"another" did not return to the ask screen once armed');

  game.dispose();
});

// gh#80 — the approved result screen (design/GameDailyFortune.dc.html). The card is the hero motif:
// its type is set large (19px / 1.75) and it owns its height, so the longest line in the pool must
// render in full — never clipped, never scrolled. No anchor may enter #stage on any screen.
test('the revealed fortune paints as the card text, whole and with no navigation target', () => {
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx(['ก้อง']));

  stage.children[3].children[0].click(); // roster chip reveals players[0]'s fortune (ungated by design)

  const fortuneEl = findByClass(stage, 'df-fortune-text');
  assert.ok(fortuneEl, 'no .df-fortune-text element painted after reveal');

  // A truncation produces a substring that is no longer a member of the pool — the cheap
  // "rendered in full" check that never depends on which line was drawn.
  assert.ok(FORTUNES.includes(fortuneEl.textContent),
    `rendered fortune "${fortuneEl.textContent}" is not a whole pool line — truncated or invented`);

  assert.ok(!findByTag(stage, 'A'), 'an <a> renders inside #stage — ADR-0014');

  game.dispose();
});

test('the longest fortune in the pool renders in full — the card grows, nothing clips', () => {
  const longest = FORTUNES.reduce((a, b) => (b.length > a.length ? b : a), '');
  const today = bangkokDate(new Date());
  // Find a name that draws the longest line today — 5000 candidates cover a ~53-line pool many times
  // over, so the search always lands (loud if it somehow does not).
  let name = null;
  for (let i = 0; i < 5000 && !name; i += 1) {
    const candidate = `คนที่ ${i}`;
    if (fortuneFor(candidate, today) === longest) name = candidate;
  }
  assert.ok(name, 'no candidate draws the longest fortune today — widen the search');

  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx([name]));
  stage.children[3].children[0].click(); // reveal

  const fortuneEl = findByClass(stage, 'df-fortune-text');
  assert.ok(fortuneEl, 'no .df-fortune-text element painted after reveal');
  assert.equal(fortuneEl.textContent, longest,
    `the longest fortune (${longest.length} chars) was truncated to ${fortuneEl.textContent.length}`);

  game.dispose();
});

test('the card pins no fixed height and no scroll/clip overflow', () => {
  const css = readFileSync(new URL('./../styles/games/daily-fortune.css', import.meta.url), 'utf8');
  const card = /\.df-fortune-card\s*\{([^}]*)\}/.exec(css);
  assert.ok(card, '.df-fortune-card rule missing from daily-fortune.css');
  assert.ok(!/(?<![\w-])height\s*:/.test(card[1]), '.df-fortune-card declares a fixed height');
  assert.ok(!/(?<![\w-])overflow\s*:/.test(card[1]), '.df-fortune-card declares overflow (scroll/clip)');

  const text = /\.df-fortune-text\s*\{([^}]*)\}/.exec(css);
  assert.ok(text, '.df-fortune-text rule missing from daily-fortune.css');
  assert.ok(!/(?<![\w-])height\s*:/.test(text[1]), '.df-fortune-text declares a fixed height');
  assert.ok(!/(?<![\w-])overflow\s*:/.test(text[1]), '.df-fortune-text declares overflow (scroll/clip)');
});
