// node --test src/games/love-match.test.mjs — no framework, no dependency
// Mostly checks the pure reading exported from love-match.ts (no DOM needed).
// The invariant under test is the one the game exists for (#34): the reading is a pure function of
// (sorted normalized pair, Bangkok date) — tap order cannot change it, the same group on the same day
// gets the same answer, and the score can never contradict the line printed next to it.
// The DOM tests near the bottom (#36, #42) cover a different seam — the pick SCREEN, not the reading —
// using a hand-rolled fake `document` (no jsdom/happy-dom in this repo), the same pattern
// short-stick.test.mjs uses (the reference DOM harness in this repo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import game, { BANDS, HEADER_NAME_MAX, SCORES, bandFor, lineFor, pairSeed, scoreFor } from './love-match.ts';
import { normalizeName } from './daily-fortune.ts';
import { ARM_DELAY_MS } from './_arm-gate.ts';

// ---- Minimal fake DOM for the two #36 tests below — see the header comment for why. ----
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

/** A GameContext stub with a fixed roster — enough surface for love-match.ts's mount/pick/dispose. */
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

// The test's OWN copy of the band boundaries, written as a literal on purpose. Deriving them from
// BANDS would make a shifted boundary unkillable: bandFor() and the expectation would move together
// and every assertion below would still pass. This table is the independent side of that check.
const EXPECTED_BANDS = [
  [0, 24, 'far'],
  [25, 49, 'slow'],
  [50, 69, 'steady'],
  [70, 89, 'close'],
  [90, 100, 'locked'],
];

/** Band id a score should map to, computed without touching the module. */
function expectedBandId(score) {
  const row = EXPECTED_BANDS.find(([min, max]) => score >= min && score <= max);
  assert.ok(row, `no expected band covers score ${score}`);
  return row[2];
}

/** The module's line pool for a band id. Looked up by NAME, never by boundary — the boundaries are
 *  what the mutation moves, and this lookup must not follow them. */
function linesOf(id) {
  const band = BANDS.find((b) => b.id === id);
  assert.ok(band, `no band with id ${id}`);
  return band.lines;
}

// A fixed name space — no RNG anywhere in this file, so every result is pass-always or fail-always.
const PEOPLE = ['ก้อง', 'ฟ้า', 'ตูน', 'แนน', 'บอส', 'มิ้น', 'เจ', 'ปอ', 'หมิว', 'ต้น', 'ใบเตย', 'ขวัญ',
  'Bank', 'Ploy', 'Jane', 'Nice', 'พี่หมี', 'น้องเมย์', 'อาร์ม', 'กิ๊ฟ', 'ตาล 2', 'ตั้ม', 'หนึ่ง', 'สอง'];
const PAIRS = PEOPLE.flatMap((a, i) => PEOPLE.slice(i + 1).map((b) => [a, b])); // 276 unordered pairs
const DAYS = Array.from({ length: 60 }, (_, i) =>
  `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`);

test('the pools: 25–35 lines across the bands, all distinct, none blank', () => {
  const all = BANDS.flatMap((b) => b.lines);
  assert.ok(all.length >= 25 && all.length <= 35, `${all.length} lines total, #34 asked for 25–35`);
  // A duplicate keeps coverage looking full while two bands read identically to a player — and a
  // line shared across two bands would make "the line belongs to that score's band" ambiguous.
  assert.equal(new Set(all).size, all.length, 'a line is duplicated across the pools');
  for (const line of all) assert.ok(line.trim().length > 0, 'blank line in a pool');
  for (const band of BANDS) assert.ok(band.lines.length >= 4, `band ${band.id} has only ${band.lines.length} lines`);
});

test('bands tile 0..100 exactly once, matching the table this file holds', () => {
  assert.equal(BANDS.length, EXPECTED_BANDS.length, 'band count changed');
  BANDS.forEach((band, i) => {
    const [min, max, id] = EXPECTED_BANDS[i];
    assert.equal(band.id, id, `band ${i} id`);
    assert.equal(band.min, min, `band ${id} min moved`);
    assert.equal(band.max, max, `band ${id} max moved`);
  });
  // Every score in the whole space resolves, and resolves to what the literal table says. This is
  // the assertion a one-off boundary shift dies on.
  for (let s = 0; s <= 100; s++) {
    assert.equal(bandFor(s).id, expectedBandId(s), `score ${s} landed in the wrong band`);
  }
  assert.throws(() => bandFor(101), /outside/);
  assert.throws(() => bandFor(-1), /outside/);
});

test('tap order cannot change the reading — (a,b) and (b,a) are one pair', () => {
  for (const day of DAYS.slice(0, 10)) {
    for (const [a, b] of PAIRS) {
      assert.equal(pairSeed(a, b, day), pairSeed(b, a, day), `seed differs by order for ${a}/${b}`);
      assert.equal(scoreFor(a, b, day), scoreFor(b, a, day), `score differs by order for ${a}/${b}`);
      assert.equal(lineFor(a, b, day), lineFor(b, a, day), `line differs by order for ${a}/${b}`);
    }
  }
});

test('same pair + same Bangkok day → the same score and line, every time it is asked', () => {
  const day = '2026-08-15';
  for (const [a, b] of PAIRS) {
    const score = scoreFor(a, b, day);
    const line = lineFor(a, b, day);
    // A negative index would return undefined, and undefined === undefined would pass this test.
    assert.ok(SCORES.includes(score), `${a}/${b} scored something unproducible: ${score}`);
    assert.ok(linesOf(expectedBandId(score)).includes(line), `${a}/${b} drew a line from no pool`);
    for (let again = 0; again < 5; again++) {
      assert.equal(scoreFor(a, b, day), score, `${a}/${b} score changed on repeat ${again}`);
      assert.equal(lineFor(a, b, day), line, `${a}/${b} line changed on repeat ${again}`);
    }
  }
});

test('a new day re-deals most pairs — measured, not assumed 100%', () => {
  // Not 100% by construction: 94 producible scores and 31 lines mean consecutive days collide for a
  // small fraction of pairs by chance, and asserting 100% would be asserting something false.
  // Measured over these 276 pairs: 96.7% of scores and 96.7% of lines move from 08-15 to 08-16, and
  // the worst of the 59 day-to-day steps below moves 97.1% of scores and 94.9% of lines. Thresholds
  // sit under those measurements with room for a content edit, not flush against them.
  let scoreMoved = 0;
  let lineMoved = 0;
  for (const [a, b] of PAIRS) {
    if (scoreFor(a, b, '2026-08-15') !== scoreFor(a, b, '2026-08-16')) scoreMoved++;
    if (lineFor(a, b, '2026-08-15') !== lineFor(a, b, '2026-08-16')) lineMoved++;
  }
  assert.ok(scoreMoved / PAIRS.length >= 0.93, `only ${scoreMoved}/${PAIRS.length} scores moved overnight`);
  assert.ok(lineMoved / PAIRS.length >= 0.93, `only ${lineMoved}/${PAIRS.length} lines moved overnight`);

  // And it is not one lucky pair of days — every day must move most of the group, on both outputs.
  for (let i = 1; i < DAYS.length; i++) {
    const s = PAIRS.filter(([a, b]) => scoreFor(a, b, DAYS[i - 1]) !== scoreFor(a, b, DAYS[i])).length;
    const l = PAIRS.filter(([a, b]) => lineFor(a, b, DAYS[i - 1]) !== lineFor(a, b, DAYS[i])).length;
    assert.ok(s / PAIRS.length >= 0.92, `${DAYS[i - 1]} → ${DAYS[i]}: only ${s}/${PAIRS.length} scores moved`);
    assert.ok(l / PAIRS.length >= 0.85, `${DAYS[i - 1]} → ${DAYS[i]}: only ${l}/${PAIRS.length} lines moved`);
  }
});

test('every band, every line and every producible score is reachable', () => {
  const bandHits = new Map(BANDS.map((b) => [b.id, 0]));
  const seenLines = new Set();
  const seenScores = new Set();
  for (const [a, b] of PAIRS) {
    for (const day of DAYS) {
      const score = scoreFor(a, b, day);
      seenScores.add(score);
      seenLines.add(lineFor(a, b, day));
      bandHits.set(expectedBandId(score), bandHits.get(expectedBandId(score)) + 1);
    }
  }
  // Per band, not in aggregate: an aggregate line count can look full while one band is starved.
  for (const band of BANDS) {
    assert.ok(bandHits.get(band.id) > 0, `band ${band.id} is unreachable`);
    const missing = band.lines.filter((l) => !seenLines.has(l));
    assert.equal(missing.length, 0, `band ${band.id}: ${missing.length} line(s) nobody can draw`);
  }
  assert.equal(seenScores.size, new Set(SCORES).size, `only ${seenScores.size} distinct scores are reachable`);
});

test('score and line never disagree — the reason one seed drives both', () => {
  // For every reachable reading, the line must come from the pool of the band THIS FILE says the
  // score belongs to. Two independent hashes would print 95% beside a difficult-match line.
  // `owner` maps line → the one band that holds it, so "in the right pool" cannot be satisfied by a
  // line that several pools share.
  const owner = new Map();
  for (const band of BANDS) for (const line of band.lines) owner.set(line, band.id);
  for (const [a, b] of PAIRS) {
    for (const day of DAYS) {
      const score = scoreFor(a, b, day);
      const id = expectedBandId(score);
      assert.equal(owner.get(lineFor(a, b, day)), id, `${a}/${b} on ${day}: ${score}% printed a ${id}-mismatched line`);
    }
  }
});

test('the middling number is deliberately rare, and both ends are fat', () => {
  // #34: a flat distribution hands every group a mediocre middling percentage, which is the boring
  // outcome. Measured over the whole pair space, not asserted from the weights table.
  const counts = { middling: 0, low: 0, high: 0, total: 0 };
  for (const [a, b] of PAIRS) {
    for (const day of DAYS) {
      const score = scoreFor(a, b, day);
      counts.total++;
      if (score >= 45 && score <= 59) counts.middling++;
      if (score <= 24) counts.low++;
      if (score >= 90) counts.high++;
    }
  }
  const flat = 15 / 101; // what 45..59 would get from a uniform 0..100 score
  assert.ok(counts.middling / counts.total < flat * 0.75,
    `45–59 takes ${(counts.middling / counts.total * 100).toFixed(1)}% — no flatter than uniform`);
  assert.ok(counts.low / counts.total > 0.18, `low readings are only ${counts.low / counts.total}`);
  assert.ok(counts.high / counts.total > 0.18, `high readings are only ${counts.high / counts.total}`);
});

test('a person paired with themselves reads, it does not crash', () => {
  // Reachable for real: two players in one group may share a name (the roster allows duplicates), and
  // they are two different people who deserve a real reading — forcing a fixed 100% would be wrong.
  // The UI separately refuses the same roster INDEX twice; that is a screen rule, not this seam's.
  const day = '2026-08-15';
  for (const name of PEOPLE) {
    const score = scoreFor(name, name, day);
    const line = lineFor(name, name, day);
    assert.ok(SCORES.includes(score), `self-pair "${name}" scored ${score}, which is unproducible`);
    assert.ok(linesOf(expectedBandId(score)).includes(line), `self-pair "${name}" drew a mismatched line`);
    assert.equal(scoreFor(name, name, day), score, 'self-pair is not deterministic');
    assert.equal(pairSeed(name, name, day), pairSeed(name, name, day));
  }
});

test('normalisation survives the pair path — padding, case, zero-width, composition', () => {
  const day = '2026-08-15';
  const base = scoreFor('ก้อง', 'ฟ้า', day);
  const baseLine = lineFor('ก้อง', 'ฟ้า', day);
  const same = (a, b, why) => {
    assert.equal(scoreFor(a, b, day), base, `${why} changed the score`);
    assert.equal(lineFor(a, b, day), baseLine, `${why} changed the line`);
  };
  same(' ก้อง ', 'ฟ้า', 'padding on the first name');
  same('ก้อง', '\tฟ้า\n', 'tab/newline padding on the second name');
  same(' ฟ้า ', ' ก้อง ', 'padding plus swapped order');
  assert.equal(scoreFor('ก้อง  ใหญ่', 'ฟ้า', day), scoreFor('ก้อง ใหญ่', 'ฟ้า', day), 'double space');
  assert.equal(scoreFor('BANK', 'Ploy', day), scoreFor('bank', 'ploy', day), 'Latin case');

  // Zero-width chars: `\s` does not match them, so a name pasted out of LINE carries an invisible
  // U+200B and would seed differently from the identical-looking typed name.
  // Escapes, not the literal characters — an invisible char in source is edited away by accident.
  for (const [label, zw] of [['ZWSP', '\u200B'], ['ZWNJ', '\u200C'], ['ZWJ', '\u200D'], ['BOM', '\uFEFF']]) {
    same(`${zw}ก้อง${zw}`, `ฟ้า${zw}`, `${label} in the pair`);
  }
  // NFC folds the two spellings of an accented Latin name (Thai has no canonical decomposition).
  const nfd = 'José'.normalize('NFD');
  assert.notEqual(nfd, 'José', 'this string has no decomposed form — pick another to test NFC with');
  assert.equal(scoreFor(nfd, 'ก้อง', day), scoreFor('José', 'ก้อง', day), 'a decomposed spelling re-seeded');

  // What deliberately does NOT normalise: two different names are two different pairs.
  assert.equal(normalizeName(' ก้อง '), 'ก้อง');
  assert.notEqual(scoreFor('ก้อง', 'ฟ้า', day) + lineFor('ก้อง', 'ฟ้า', day),
    scoreFor('กอง', 'ฟ้า', day) + lineFor('กอง', 'ฟ้า', day));
});

test('the pair is ordered by code unit, so no locale can reorder it', () => {
  // `<` on strings compares UTF-16 code units, which are the same on every runtime. localeCompare
  // and Intl.Collator read ICU locale data that varies by build — that is the trap this avoids.
  const day = '2026-08-15';
  const [x, y] = ['ฟ้า', 'ก้อง'];
  const lo = x <= y ? x : y;
  assert.ok(pairSeed(x, y, day).startsWith(`${lo}|`), 'the seed is not built from the lower name first');
  assert.equal(pairSeed(x, y, day), `${lo}|${lo === x ? y : x}|${day}`);
  // And the date really is in the seed — drop it and every day would read the same.
  assert.ok(pairSeed(x, y, day).endsWith(day), 'the date is missing from the seed');
  assert.notEqual(pairSeed(x, y, day), pairSeed(x, y, '2026-08-16'));
});

// ---- #36: the pick SCREEN, not the reading — a rapid double-tap must not announce a pair the group
// never chose. Both tests below drive the real mount()/pick() path through the fake DOM above. ----

test('#36: a first tap does not reflow or rebuild the chip row', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  const players = ['เอ', 'บี', 'ซี'];
  game.mount(stage, makeCtx(players));
  t.mock.timers.tick(ARM_DELAY_MS + 1); // #42 gates the fresh chip row; wait past it, as a real tap would

  const chipsBefore = stage.children[1].children.slice();
  const textBefore = chipsBefore.map((c) => c.textContent);
  assert.equal(chipsBefore.length, players.length, 'setup: one chip per player before any tap');

  chipsBefore[0].click(); // tap 1: pick players[0]

  const chipsAfter = stage.children[1].children.slice();
  assert.equal(chipsAfter.length, chipsBefore.length, 'chip count changed after tap 1');
  assert.deepEqual(chipsAfter.map((c) => c.textContent), textBefore, 'chip text/order changed after tap 1');
  chipsAfter.forEach((chip, i) => {
    assert.strictEqual(chip, chipsBefore[i], `chip at position ${i} is a different node after tap 1 — the row was rebuilt`);
  });

  game.dispose();
});

test('#36: a fast double-tap on one chip cannot pair a person with themselves', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  const players = ['เอ', 'บี', 'ซี'];
  game.mount(stage, makeCtx(players));
  t.mock.timers.tick(ARM_DELAY_MS + 1); // #42 gates the fresh chip row; wait past it, as a real tap would

  const tapped = stage.children[1].children[0]; // players[0]'s chip — the exact node under the finger both times
  tapped.click();
  tapped.click();

  // renderResult's pair paragraph is the only one styled with PAIR_STYLE (identified by its unique
  // '1.25rem' substring, same discriminator used in docs/verification/evidence/34's browser capture).
  const pairPara = stage.children.find((c) => (c.getAttribute('style') || '').includes('1.25rem'));
  assert.equal(pairPara, undefined,
    `a double-tap on one chip alone must not complete a pair at all, let alone a self-pair — got: ${pairPara && pairPara.textContent}`);

  game.dispose();
});

test('#42: ghost-tap gate — every button on the pick screen disables at render, including a hidden one', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  const players = ['เอ', 'บี', 'ซี'];
  game.mount(stage, makeCtx(players));

  // The chip row: unlike daily-fortune's roster chips, chip→chip here crosses no #stage swap (the
  // first tap mutates the row in place, see pick()), so there is no same-finger exception to carve out.
  const chips = stage.children[1].children;
  assert.equal(chips.length, players.length, 'setup: one chip per player');
  for (const chip of chips) {
    assert.equal(chip.disabled, true, `${chip.textContent} chip must be disabled the instant the row is painted`);
  }

  // lm-reset ('back') starts hidden but is still a real button in this render — armAllButtons finds
  // every <button> under the stage, not a hand-picked list, so a control nobody named is gated too.
  const back = stage.children[2];
  assert.equal(back.disabled, true, 'lm-reset must be disabled at render even though it starts hidden');

  // before arming: a click on a gated chip must not register a pick
  chips[0].click();
  assert.equal(chips[0].getAttribute('aria-pressed'), null,
    'a ghost tap picked a player before the window elapsed — the disabled chip fired anyway');

  // one window later the same tap really does register the pick
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(chips[0].disabled, false, 'the chip row never armed');
  chips[0].click();
  assert.equal(chips[0].getAttribute('aria-pressed'), 'true', 'a real tap after arming did not register the pick');

  game.dispose();
});

test('a long player name cannot grow the header past its HEADER_NAME_MAX-truncated length', () => {
  const stage = fakeDocument.createElement('div');
  const longName = 'ก'.repeat(50); // far past a maxlength=24 input, and past any old uncapped localStorage name
  const players = [longName, 'บี'];
  game.mount(stage, makeCtx(players));

  const header = stage.children[0];
  // dispatch(), not click(): this test's own concern is header truncation, not the #42 gate — going
  // straight at the listener keeps it decoupled from ARM_DELAY_MS timing, the same way the #36 tests
  // did before #42 existed.
  stage.children[1].children[0].dispatch('click'); // tap 1: pick players[0], the long name

  // The header string is a fixed prefix plus the (possibly truncated) name plus an ellipsis when cut —
  // so its length must never exceed prefix + HEADER_NAME_MAX + 1 (the ellipsis char), regardless of how
  // long the underlying player name is.
  const prefix = 'เลือกคู่ของ ';
  assert.ok(
    header.textContent.length <= prefix.length + HEADER_NAME_MAX + 1,
    `header grew past its truncation budget: "${header.textContent}" (${header.textContent.length} chars)`,
  );
  assert.ok(header.textContent.includes('…'), 'a name past HEADER_NAME_MAX should be shown truncated with an ellipsis');

  game.dispose();
});
