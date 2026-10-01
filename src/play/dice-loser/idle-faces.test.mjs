// gh#240: before every roll the three dice show DIMMED random faces, never three blank squares --
// on the first turn of a round, on every later turn, and on the first turn of every tiebreak round.
// Owner ruling 2026-10-01: the idle faces are dimmed so a phone passed to the next player never
// looks as if that player already rolled.
//
// It runs the REAL module. main.ts's top level wires the whole route to `document`, so it cannot be
// imported; instead its types are stripped, its imports are rewritten into stub lookups and its body
// is executed -- the idiom croc-bite/seed-order.test.mjs and setup-bridge-group-writeback.test.mjs
// already use. The turn screens are then reached the way a player reaches them, by firing the click
// listeners main.ts itself registered: start, roll, next, summary, tiebreak. Calling renderTurn
// directly would skip the three different call paths into it, and those paths are the subject.
//
// Never asserted: WHICH face an idle die shows. The idle source is random by design, so every
// assertion is a range (one to six pips on) plus the dimming class, never a specific face.
//
// ponytail: no layout and no CSS. This proves the class and the pips are on the die and that the
// idle path never reaches the roll; that the class actually DIMS anything is a browser question,
// answered by the computed-style and pixel readings in the gh#240 evidence directory, not here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { makeDocumentStub } from '../_dom-stub.mjs';
// The real rule module: resolveRound decides the round for real, and rollDice is wrapped, not
// replaced, so a roll result in this file is one the shipped function produced.
import game, { rollDice as realRollDice, resolveRound, CONDITION_LABEL } from '../../games/dice-loser.ts';
import { mascotEmoji, mascotNames, resetCastNames } from '../_mascots.ts';

const MAIN = path.join(import.meta.dirname, 'main.ts');

/** One import line into a stub lookup. Three shapes occur in main.ts -- a named list, a bare
 *  default, and a default followed by a named list -- and anything else THROWS rather than emitting
 *  a body that will not parse. */
function rewriteImport(binding, spec, seq) {
  const req = `__require(${JSON.stringify(spec)})`;
  const trimmed = binding.trim();
  const tmp = `__imp${seq}`;
  if (trimmed.startsWith('{')) return `const ${trimmed} = ${req};`;
  if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) return `const ${tmp} = ${req}; const ${trimmed} = ${tmp}.default;`;
  const mixed = trimmed.match(/^([A-Za-z_$][\w$]*)\s*,\s*(\{[\s\S]*\})$/);
  if (mixed) return `const ${tmp} = ${req}; const ${mixed[1]} = ${tmp}.default; const ${mixed[2]} = ${tmp};`;
  throw new Error(`unhandled import shape in ${spec}: ${JSON.stringify(binding)}`);
}

/** The stub's classList is inert by design (`contains` always answers false), which would make the
 *  dimming class unobservable. This one is backed by `className`, so a class added through classList
 *  and a pip written through `className` read back through the same string. */
function withClassList(node) {
  const tokens = () => new Set(node.className.split(/\s+/).filter(Boolean));
  const write = (set) => {
    node.className = [...set].join(' ');
  };
  node.classList = {
    add: (...names) => write(new Set([...tokens(), ...names])),
    remove: (...names) => write(new Set([...tokens()].filter((t) => !names.includes(t)))),
    toggle(name, force) {
      const set = tokens();
      const on = force === undefined ? !set.has(name) : Boolean(force);
      if (on) set.add(name);
      else set.delete(name);
      write(set);
      return on;
    },
    contains: (name) => tokens().has(name),
  };
  return node;
}

/** Scripted faces for the wrapped rollDice: a face f is produced by handing the real rollDice a
 *  rand() that lands inside f's sixth of [0, 1). */
const randFor = (faces) => {
  const queue = [...faces];
  return () => (queue.shift() - 1) / 6 + 0.01;
};

/** Three seats, high total loses. Seats 0 and 1 tie on the top total, seat 2 is far below, so the
 *  real resolveRound must send exactly seats 0 and 1 into a tiebreak round. */
const SCRIPT = [
  [6, 5, 6],
  [5, 6, 6],
  [1, 2, 1],
];

/** Boots the shipped module once and returns the handles a test drives it through. */
function boot() {
  const stub = makeDocumentStub();
  const byId = stub.document.getElementById.bind(stub.document);
  const patched = new Set();
  stub.document.getElementById = (id) => {
    const node = byId(id);
    if (!patched.has(node)) {
      withClassList(node);
      patched.add(node);
    }
    return node;
  };
  const create = stub.document.createElement.bind(stub.document);
  stub.document.createElement = (tag) => withClassList(create(tag));

  const calls = { rollDice: 0, armed: [] };
  const results = [];
  const rollDice = () => {
    calls.rollDice += 1;
    const faces = SCRIPT[results.length] ?? [3, 3, 3];
    const roll = realRollDice(randFor(faces));
    results.push(roll);
    return roll;
  };

  const timers = [];
  const resolve = (spec) => {
    if (spec.endsWith('/games/dice-loser.ts')) return { default: game, rollDice, resolveRound, CONDITION_LABEL };
    if (spec.endsWith('/games/_arm-gate.ts')) return { armAllButtons: (el) => calls.armed.push(el?.id) };
    if (spec.endsWith('shell/roster')) {
      return { loadGroup: () => [], loadRoster: () => ({ names: () => [] }), saveGroup: () => {} };
    }
    if (spec.endsWith('_setup-bridge')) return { saveOnSetupComplete: () => {}, takeSetupEditRequest: () => false };
    if (spec.endsWith('_mascots.ts')) return { mascotEmoji, mascotNames, resetCastNames };
    throw new Error(`unstubbed import in dice-loser/main.ts: ${spec}`);
  };

  const raw = fs.readFileSync(MAIN, 'utf8');
  let seq = 0;
  const js = stripTypeScriptTypes(raw, { mode: 'strip' }).replace(
    /^import\s+([\s\S]*?)\s+from\s+'([^']+)';/gm,
    (_m, binding, spec) => rewriteImport(binding, spec, (seq += 1)),
  );
  assert.doesNotMatch(js, /^import\s/m, 'an import in main.ts was not rewritten -- the module body would not run');

  // renderPips is handed back ONLY for the calibration test below; every turn screen in this file is
  // reached through the route's own click listeners.
  // eslint-disable-next-line no-new-func -- executing the shipped module body is the whole point.
  const api = new Function(
    '__require',
    'document',
    'window',
    'localStorage',
    'setTimeout',
    'clearTimeout',
    `${js}\n;return { renderPips };`,
  )(
    resolve,
    stub.document,
    { addEventListener() {} },
    { getItem: () => null, setItem() {}, removeItem() {} },
    (fn, ms) => timers.push({ fn, ms }),
    () => {},
  );

  const el = (id) => stub.document.getElementById(id);
  const click = (id) => {
    const fns = el(id).listeners.click ?? [];
    assert.ok(fns.length > 0, `#${id} has no click listener -- the route cannot be driven through it`);
    for (const fn of fns) fn({ type: 'click' });
  };
  const flushTimers = () => {
    assert.ok(timers.length > 0, 'no roll timer was scheduled -- the roll never started');
    while (timers.length) timers.shift().fn();
  };
  return { el, click, flushTimers, calls, results, api, document: stub.document };
}

const DIE_IDS = ['dl-die-1', 'dl-die-2', 'dl-die-3'];
const pipsOn = (die) => die.children.filter((p) => p.className.split(/\s+/).includes('is-on')).length;
const pattern = (die) => die.children.map((p) => p.className).join('|');

/** Every property an idle turn screen must hold, asserted per die so a failure names the die. */
function assertIdle(route, label, rollCallsBefore) {
  for (const id of DIE_IDS) {
    const die = route.el(id);
    assert.equal(die.children.length, 9, `${label}: #${id} lost its 3x3 pip grid`);
    const on = pipsOn(die);
    assert.ok(
      on >= 1 && on <= 6,
      `${label}: #${id} shows ${on} pips on before the roll -- an idle die must show a face (1..6 pips), not a blank`,
    );
    assert.ok(die.classList.contains('is-idle'), `${label}: #${id} is not marked is-idle, so its idle face is not dimmed`);
    assert.ok(!die.classList.contains('is-rolling'), `${label}: #${id} is still tumbling on a fresh turn`);
  }
  assert.equal(
    route.calls.rollDice,
    rollCallsBefore,
    `${label}: the idle path called rollDice -- an idle face must never come from, or count as, a roll`,
  );
  assert.equal(route.el('dl-score').textContent, '', `${label}: score text is showing before the roll`);

  const turnName = route.el('dl-turn-name').textContent;
  const name = turnName.replace(/^ตาของ /, '');
  assert.notEqual(name, turnName, `${label}: the turn line changed shape -- this test can no longer read the seat`);
  const current = route.el('dl-pills').children.filter((p) => p.classList.contains('is-current'));
  assert.equal(current.length, 1, `${label}: expected exactly one current-seat pill`);
  assert.equal(current[0].textContent, name, `${label}: the current seat's pill carries a score before the roll`);
  assert.equal(
    route.el('dl-live').textContent,
    `ถึงตาของ ${name} แล้ว`,
    `${label}: the live region announced something other than the turn line while the dice were idle`,
  );
  assert.ok(route.el('dl-roll').hidden === false, `${label}: the roll control is not on screen`);
}

/** Roll the current seat: the tumble must keep the dimmed idle faces, and only the landed result
 *  lifts the dimming. Returns the result the real rollDice produced. */
function rollAndLand(route, label) {
  const before = DIE_IDS.map((id) => pattern(route.el(id)));
  route.click('dl-roll');
  for (const [i, id] of DIE_IDS.entries()) {
    const die = route.el(id);
    assert.ok(die.classList.contains('is-rolling'), `${label}: #${id} did not start tumbling`);
    assert.ok(die.classList.contains('is-idle'), `${label}: #${id} lost its dimming before the result landed`);
    assert.equal(pattern(die), before[i], `${label}: #${id} changed face mid-tumble -- only the result may replace the idle face`);
  }
  route.flushTimers();
  const result = route.results.at(-1);
  for (const [i, id] of DIE_IDS.entries()) {
    const die = route.el(id);
    assert.ok(!die.classList.contains('is-idle'), `${label}: #${id} is still dimmed after the real result landed`);
    assert.ok(!die.classList.contains('is-rolling'), `${label}: #${id} is still tumbling after the result landed`);
    assert.equal(pipsOn(die), result.dice[i], `${label}: #${id} does not show the rolled face`);
  }
  assert.equal(route.el('dl-score').textContent, `แต้มรวม ${result.total} แต้ม`, `${label}: the landed score is wrong`);
  return result;
}

test('the first turn, a later turn and a tiebreak turn all open on dimmed idle faces', () => {
  const route = boot();
  assert.equal(route.calls.rollDice, 0, 'rollDice ran at boot');

  // First turn: the setup screen's start control -> begin -> startRound -> renderTurn.
  route.calls.armed.length = 0;
  route.click('dl-begin');
  assert.equal(route.el('dl-play').hidden, false, 'the start control did not reach the turn screen');
  assertIdle(route, 'first turn', 0);
  assert.ok(route.calls.armed.includes('dl-play'), 'the first turn screen was not armed');
  rollAndLand(route, 'first turn');

  // Later turns: next -> nextTurn -> renderTurn, with no panel change.
  for (const seat of [1, 2]) {
    route.calls.armed.length = 0;
    const rollsSoFar = route.calls.rollDice;
    route.click('dl-next');
    assertIdle(route, `turn ${seat + 1}`, rollsSoFar);
    assert.ok(route.calls.armed.includes('dl-play'), `turn ${seat + 1}: the turn screen was not re-armed`);
    // The seats that already rolled carry their REAL totals; the idle faces never reach a pill.
    const done = route.el('dl-pills').children.filter((p) => p.classList.contains('is-done'));
    assert.deepEqual(
      done.map((p) => p.textContent.split(' ').at(-1)),
      route.results.map((r) => String(r.total)),
      `turn ${seat + 1}: a finished seat's pill does not carry its rolled total`,
    );
    rollAndLand(route, `turn ${seat + 1}`);
  }

  // The round's totals are exactly the three rolls -- nothing an idle face showed was counted.
  route.click('dl-next');
  assert.equal(route.el('dl-summary').hidden, false, 'the last next did not reach the summary');
  const totals = route.el('dl-summary-list').children.map((li) => Number(li.children[1].textContent.split(' ')[0]));
  assert.deepEqual(
    [...totals].sort((a, b) => a - b),
    route.results.map((r) => r.total).sort((a, b) => a - b),
    'the summary totals are not the rolled totals',
  );

  // Tiebreak: summary -> resolve -> tiebreak panel -> start -> startRound -> renderTurn.
  route.click('dl-summary-continue');
  assert.equal(route.el('dl-tiebreak').hidden, false, 'the scripted tie did not reach the tiebreak panel');
  route.calls.armed.length = 0;
  const rollsBeforeTiebreak = route.calls.rollDice;
  route.click('dl-tiebreak-start');
  assert.equal(route.el('dl-play').hidden, false, 'the tiebreak start did not reach the turn screen');
  assert.equal(route.el('dl-round-label').textContent, 'รอบตัดสินที่ 1', 'this is not the tiebreak round');
  assertIdle(route, 'tiebreak first turn', rollsBeforeTiebreak);
  assert.ok(route.calls.armed.includes('dl-play'), 'the tiebreak turn screen was not armed');
  assert.equal(route.el('dl-pills').children.length, 2, 'the tiebreak round is not the two tied seats');
  rollAndLand(route, 'tiebreak first turn');
});

// Calibration, in the shape that can actually fail: through THIS harness a blank die reads as zero
// pips on and no dimming class, so the first test's ">= 1 pip on" and "is-idle" assertions are ones a
// blank reset would break -- and the classList really records, so a missing class is not the stub
// answering false.
test('RED CALIBRATION: the harness tells a blank undimmed die from an idle one', () => {
  const route = boot();
  const die = withClassList({ className: '', children: [], replaceChildren(...kids) { this.children = kids; }, appendChild(c) { this.children.push(c); } });
  route.api.renderPips(die, 0);
  assert.equal(pipsOn(die), 0, 'a blank face did not read as zero pips on');
  assert.equal(die.classList.contains('is-idle'), false, 'a plain face read as dimmed');
  route.api.renderPips(die, 5, true);
  assert.equal(pipsOn(die), 5);
  assert.equal(die.classList.contains('is-idle'), true, 'the recording classList did not record the dimming class');
  route.api.renderPips(die, 2);
  assert.equal(die.classList.contains('is-idle'), false, 'a real face did not lift the dimming');
});
