#!/usr/bin/env node
// gh#230: a game's manifest declares a player range; its engine enforces a seat ceiling. Nothing
// compared the two, and three games disagreed with themselves in silence. This gate compares them.
//
// WHAT THE DECLARATION IS LOAD-BEARING FOR, per consumer, because the gate follows from that answer
// and not from the field's existence (ADR-0065 asked for this first):
//   1. COPY — a game's own Thai how-to and seo strings restate the range by hand. Nothing derives
//      them, so they can drift; party-size-claim-check classifies WHERE a range claim may appear,
//      never WHICH numbers it holds. Must agree with the declaration.
//   2. THE OG COUNT LINE — cardLines() in scripts/og-card-text.mjs interpolates players[0] and
//      players[1] straight into the share card. Derived, so it cannot drift, but it propagates the
//      declaration into a rendered PNG that og-card-check pins. Must agree, and does by construction.
//   3. THE SETUP PANEL CEILING — GameLayout.astro hands players[1] to PlayerSetup as its maximum,
//      and the panel refuses or warns above it. Must agree WITH THE ENGINE, and this is the one that
//      bites: a declaration under the engine's ceiling turns away players the game could seat, and a
//      declaration over it admits players the engine will silently drop.
//   4. THE WRITE-BACK CEILING — deliberately does NOT consume the declaration. It uses the seats a
//      page can show, so a saved group larger than the page is never trimmed. Must NOT be made to
//      agree; it is why a route may legitimately exceed the declared maximum internally.
// So the invariant this gate enforces is consumer 3: THE DECLARED MAXIMUM EQUALS THE MAXIMUM SEATS
// THE ROUTE'S OWN ENGINE WILL ACCEPT.
//
// WHY THIS IS A GATE AND NOT A LIST OF CONSTANTS. gh#230 rules out a hand-maintained list of seat
// numbers as "the same unchecked pairing with more places to forget", and no seat number appears
// anywhere in this file. Two independent readers produce the number instead:
//   READER A, EXECUTION — the real bytes of the route's own seat surface are sliced out of its engine
//     and RUN. A clamp is called with an absurd count and the resulting count read back; a stepper's
//     click handler is driven until the count stops rising. That is a runtime value, not a parsed
//     one, which is the only thing that can answer a question about what an engine does.
//   READER B, TEXT — a narrow family of count-guard shapes, each anchored on a player-count
//     IDENTIFIER rather than on a bare numeral, so a copy string holding a number is not a match.
//   Where both apply they must AGREE, and the gate reds if they do not. That cross-check is what
//   caught this instrument lying during development: an early tolerant scope shadowed the real
//   `Math`, and every clamp measured a plausible, wrong number.
//
// WHY IT CONVERGES DESPITE READING A SET THIS REPO DOES NOT OWN. ADR-0065 names the engine-clamp
// reader as an unowned set, and it is right: these engines are verbatim mockup lifts, rewritten
// wholesale by scripts/extract-mockup.mjs, authored outside this repo, and free to express a ceiling
// a new way at any time. So the readers are never trusted to be complete. Every party route must
// land in exactly one class below, and a route no reader can locate is a FAILURE, not a skip:
//   measured  - reader A ran; reader B agreed.
//   located   - reader B found a ceiling; no reader-A driver is built for that surface shape.
//   derived   - the route computes its own bounds FROM the manifest, so it cannot disagree. Proved
//               by the derivation's shape in the route's own module, which is a structural question.
//   unlocated - no reader found anything. RED. There is no green for "we could not tell".
// The route set is enumerated from the manifest AT RUNTIME, so it cannot quietly shrink: a new party
// game with a play route and no entry reds on the day it lands. That is the difference from a list --
// a list of six constants goes green when a seventh game arrives.
//
// ponytail: three stated ceilings.
//   (1) THE FLOOR IS NOT COVERED. Only the maximum is compared. players[0] is already constrained by
//       scripts/validate-games.mjs, which requires at least 2 for a party page.
//   (2) A reader-A driver slices a named surface out of an extractor-owned file. When the next
//       extraction renames that surface the slice fails and this gate reds saying so. That is the
//       safe direction and the message names the repair, but it is maintenance, not zero-cost.
//   (3) Reader B reads text, so it can only recognise shapes it knows. Its blindness is bounded by
//       the unlocated class above rather than by the pattern family being complete.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sliceBlock } from '../src/play/_dom-stub.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROBE_COUNT = 9999;
const SATURATION_LIMIT = 200;

// --- The tolerant scope -------------------------------------------------------------------------
// A sliced surface names module neighbours this gate has no intention of building. Every free
// identifier that is not a real global resolves to a value that tolerates any use, so the slice runs
// and only the count it computes is measured. Same "tolerant, not faithful" principle as
// src/play/_dom-stub.mjs, and the same reason: a stub that throws on the first unknown name would
// make the gate a measurement of the stub.
function anything() {
  const callable = function () { return anything(); };
  return new Proxy(callable, {
    // A minted value must never look like a seat count. NaN poisons arithmetic visibly, so a
    // measurement that depended on a mint fails the integer check below instead of passing as a
    // plausible number.
    get: (_t, key) => (key === Symbol.unscopables ? undefined : key === Symbol.toPrimitive ? () => NaN : anything()),
    apply: () => anything(),
    set: () => true,
  });
}

const freeScope = new Proxy({}, {
  // Real globals keep their real behaviour: shadowing `Math` is what made an early version of this
  // gate report a wrong clamp. Names prefixed with a double underscore are this harness's own
  // parameters and must not be captured either.
  has: (_t, key) => typeof key === 'string' && !key.startsWith('__') && !(key in globalThis),
  get: (_t, key) => (key === Symbol.unscopables ? undefined : anything()),
});

/** A receiver that keeps the state a probe seeded and answers anything else tolerantly. */
function tolerantReceiver(state) {
  return new Proxy(state, { get: (t, key) => (key in t ? t[key] : anything()), has: () => true });
}

// --- Reader A: execution ------------------------------------------------------------------------

/** Compile a sliced method, plus any helper declarations it needs, into a callable. */
function compileMethod(source, header, helpers = []) {
  const body = sliceBlock(source, header);
  if (!body) return { error: `no surface answers to \`${header}\`` };
  let declarations = '';
  for (const helper of helpers) {
    const helperBody = sliceBlock(source, helper);
    if (!helperBody) return { error: `no helper answers to \`${helper}\`` };
    declarations += `function ${helperBody}\n`;
  }
  try {
    const factory = new Function('__scope', '__env',
      `with (__scope) { with (__env) { ${declarations}\n return function ${body} } }`);
    return { make: (env) => factory(freeScope, env) };
  } catch (error) { return { error: `slice will not compile: ${error.message}` }; }
}

/** Compile a sliced addEventListener registration and hand back the listener it installs. */
function compileListener(source, header) {
  const body = sliceBlock(source, header);
  if (!body) return { error: `no surface answers to \`${header}\`` };
  const at = body.indexOf('.addEventListener(');
  if (at === -1) return { error: `\`${header}\` is no longer an addEventListener registration` };
  // The registration target is replaced with a captor, so the real handler bytes are kept while the
  // element lookup around them is not built. The trailing paren closes the call the slice cut.
  const registration = `__captor${body.slice(at)})`;
  try {
    const factory = new Function('__scope', '__env', '__receiver', '__captor',
      `with (__scope) { with (__env) { (function () { ${registration} }).call(__receiver) } }`);
    return {
      make: (env, receiver) => {
        let handler = null;
        factory(freeScope, env, receiver, { addEventListener: (_type, fn) => { handler = fn; } });
        return handler;
      },
    };
  } catch (error) { return { error: `slice will not compile: ${error.message}` }; }
}

/** Fire a surface until the count it guards stops rising. The stall point is the ceiling. */
function saturate(fire, read) {
  let previous = read();
  for (let step = 0; step < SATURATION_LIMIT; step += 1) {
    try { fire(); } catch (error) { return { error: `the surface threw after ${step} step(s): ${error.message}` }; }
    const now = read();
    if (now === previous) return { cap: now, steps: step };
    previous = now;
  }
  return { error: `the count never stopped rising in ${SATURATION_LIMIT} step(s), reaching ${read()}` };
}

// --- The locator table --------------------------------------------------------------------------
// A locator says WHERE a route's seat surface is and how to drive it. It never says what the answer
// should be. Every entry is a decision about one engine's shape, and an entry whose surface has moved
// fails loudly rather than measuring nothing.
const DRIVERS = {
  'freeze-tap': {
    what: 'setPlayerCount clamps the requested count before it seats anyone',
    run: (source) => {
      const compiled = compileMethod(source, 'setPlayerCount(count)');
      if (compiled.error) return compiled;
      const env = { playerCount: undefined, players: [] };
      const fn = compiled.make(env);
      try { fn.call(tolerantReceiver(env), PROBE_COUNT); } catch { /* the clamp lands before the seating loop */ }
      return { cap: env.playerCount };
    },
  },
  'one-bomb': {
    what: 'setPlayerCount routes the requested count through the engine clamp helper',
    run: (source) => {
      const compiled = compileMethod(source, 'setPlayerCount(n)', ['clamp(v, min, max)']);
      if (compiled.error) return compiled;
      const env = { game: { playerCount: undefined } };
      try { compiled.make(env)(PROBE_COUNT); } catch { /* the clamp lands before the board rebuild */ }
      return { cap: env.game.playerCount };
    },
  },
  'cannon-flag': {
    what: 'the setup stepper increments only while the count is under its ceiling',
    run: (source) => {
      const compiled = compileListener(source, "DOM.btnIncPlayers.addEventListener('click', () =>");
      if (compiled.error) return compiled;
      const env = { setupPlayerCount: 2 };
      const handler = compiled.make(env, tolerantReceiver({}));
      if (typeof handler !== 'function') return { error: 'the stepper registered no click handler' };
      return saturate(() => handler(), () => env.setupPlayerCount);
    },
  },
  'bangkok-drift': {
    what: 'the roster stepper increments only while the count is under its ceiling',
    run: (source) => {
      const compiled = compileListener(source, "$('incPlayerBtn').addEventListener('click', () =>");
      if (compiled.error) return compiled;
      const env = { game: { count: 2 } };
      const handler = compiled.make(env, tolerantReceiver({}));
      if (typeof handler !== 'function') return { error: 'the stepper registered no click handler' };
      return saturate(() => handler(), () => env.game.count);
    },
  },
  'cursed-number': {
    what: 'the setup stepper increments only while the engine count is under its ceiling',
    run: (source) => {
      const compiled = compileListener(source, "document.getElementById('countPlusBtn').addEventListener('click', () =>");
      if (compiled.error) return compiled;
      const receiver = tolerantReceiver({
        game: { playerCount: 2 },
        setPlayerCount(next) { this.game.playerCount = next; },
      });
      const handler = compiled.make({}, receiver);
      if (typeof handler !== 'function') return { error: 'the stepper registered no click handler' };
      return saturate(() => handler(), () => receiver.game.playerCount);
    },
  },
  'zero-trigger': {
    what: 'addNewPlayer refuses to append past the roster ceiling',
    run: (source) => {
      const compiled = compileMethod(source, 'addNewPlayer()');
      if (compiled.error) return compiled;
      const receiver = tolerantReceiver({ state: { players: [{ name: 'a' }, { name: 'b' }] } });
      const fn = compiled.make({});
      return saturate(() => fn.call(receiver), () => receiver.state.players.length);
    },
  },
};

// --- Reader B: the count-guard text family ------------------------------------------------------
// Every shape is anchored on a player-count IDENTIFIER or on a rendered count control, never on a
// bare numeral: power-meter's copy holds the literal "10.00" and must not read as ten seats.
const TEXT_FAMILY = [
  { name: 'roster-length guard', re: /\b(?:players|cast)\s*\.\s*length\s*(?:<|<=|>=|>)\s*(\d{1,3})\b/g },
  { name: 'count-variable guard', re: /\b\w*[Pp]layerCount\s*(?:<|<=|>=|>)\s*(\d{1,3})\b/g },
  { name: 'count-property guard', re: /\bgame\s*\.\s*count\s*(?:<|<=|>=|>)\s*(\d{1,3})\b/g },
  { name: 'count clamp', re: /Math\s*\.\s*min\s*\(\s*(\d{1,3})\s*,\s*\w*(?:count|Count)\w*\s*\)/g },
  { name: 'count validity range', re: /\b\w+\s*>=\s*\d{1,3}\s*&&\s*\w+\s*<=\s*(\d{1,3})\b/g, needsCountContext: true },
  { name: 'count-chip range', re: /for\s*\(\s*let\s+\w+\s*=\s*\d{1,3}\s*;\s*\w+\s*<=\s*(\d{1,3})\s*;/g, needsCountContext: true },
];
// A shape that is not self-anchoring only counts inside a window that talks about a count, which is
// what keeps an ordinary loop or an unrelated range check out of the reading.
const COUNT_CONTEXT = /count/i;

function readText(source) {
  const found = [];
  for (const shape of TEXT_FAMILY) {
    for (const match of source.matchAll(shape.re)) {
      if (shape.needsCountContext && !COUNT_CONTEXT.test(source.slice(match.index, match.index + 300))) continue;
      const value = Number(match[1]);
      if (Number.isInteger(value) && value >= 2) found.push({ shape: shape.name, value, text: match[0].replace(/\s+/g, ' ') });
    }
  }
  return found;
}

/** The ceiling a text reading implies is the largest seat count any of its guards names. */
function textCap(found) {
  return found.length ? Math.max(...found.map((f) => f.value)) : null;
}

// --- Routes whose bounds come from the manifest -------------------------------------------------
// These cannot disagree with the declaration because they compute from it. The check is structural:
// the route's own module must still read the maximum out of the manifest.
const DERIVED_FROM_MANIFEST = new Set(['dice-loser', 'timebomb']);
const DERIVATION = /=\s*(?:Math\.min\(\s*)?game\.players\[1\]/;

// --- The audit ----------------------------------------------------------------------------------

function engineFileFor(routeId) {
  for (const name of ['main.js', 'main.ts']) {
    const candidate = path.join(root, 'src/play', routeId, name);
    if (fs.existsSync(candidate)) return { name, source: fs.readFileSync(candidate, 'utf8') };
  }
  return null;
}

function routeIdFor(game) {
  const match = /^\/game\/([^/]+)\/play\/$/.exec(game.playRoute ?? '');
  return match ? match[1] : null;
}

/**
 * Classify one party game and report every disagreement it carries.
 * Pure over its inputs so the selftest can drive it with fixtures.
 */
export function auditGame({ id, declaredMax, routeId, engine, driver }) {
  const failures = [];
  const say = (detail) => failures.push({ id, detail });
  if (!routeId) return { id, klass: 'no-route', failures };
  if (!engine) {
    say(`${id} declares a play route at "${routeId}" but no engine module is there to read a seat ceiling from`);
    return { id, klass: 'unlocated', failures };
  }

  if (DERIVED_FROM_MANIFEST.has(routeId)) {
    if (!DERIVATION.test(engine.source)) {
      say(`${routeId} was classified as deriving its ceiling from the manifest, but its ${engine.name} no longer reads the declared maximum — give it a driver entry or restore the derivation`);
    }
    return { id, klass: 'derived', failures };
  }

  const textFound = readText(engine.source);
  const fromText = textCap(textFound);
  let fromExecution = null;

  if (driver) {
    const result = driver.run(engine.source);
    if (result.error) {
      say(`${routeId}: the seat surface could not be driven — ${result.error}. This gate is measuring nothing for this route until its locator is re-pointed (${driver.what})`);
    } else if (!Number.isInteger(result.cap) || result.cap < 2) {
      say(`${routeId}: driving the seat surface produced ${JSON.stringify(result.cap)}, which is not a seat count — the measurement did not happen`);
    } else {
      fromExecution = result.cap;
    }
  }

  if (fromExecution !== null && fromText !== null && fromExecution !== fromText) {
    say(`${routeId}: the two readers disagree — running the seat surface gives ${fromExecution}, its count guards read ${fromText}. One of them is wrong, so neither reading may be trusted`);
    return { id, klass: 'conflicted', failures };
  }

  const cap = fromExecution ?? fromText;
  if (cap === null) {
    say(`${routeId}: no seat ceiling could be located in its ${engine.name} — no driver is built for it and no known count-guard shape matched. Add a locator entry rather than leaving the pairing unchecked`);
    return { id, klass: 'unlocated', failures };
  }

  if (cap !== declaredMax) {
    const how = fromExecution !== null ? `its engine seats ${cap} (measured by running the seat surface)` : `its engine seats ${cap} (read from a count guard: ${textFound.filter((f) => f.value === cap).map((f) => `\`${f.text}\``).join(', ')})`;
    say(`${id} declares a maximum of ${declaredMax} but ${how}. The setup panel admits players using the declared maximum, so these must agree — raise the declaration or lower the ceiling`);
  }

  return { id, klass: fromExecution !== null ? 'measured' : 'located', cap, failures };
}

async function audit() {
  const { games } = await import(pathToFileURL(path.join(root, 'src/games/manifest.ts')).href);
  if (!Array.isArray(games) || games.length === 0) {
    console.error('seat-cap-check: src/games/manifest.ts exported no games — an empty work set is a failure, not a pass');
    process.exit(1);
  }
  const party = games.filter((game) => game.category === 'party');
  if (party.length === 0) {
    console.error('seat-cap-check: the manifest holds no party games — nothing was checked, which is a failure, not a pass');
    process.exit(1);
  }

  const results = [];
  for (const game of party) {
    const routeId = routeIdFor(game);
    results.push(auditGame({
      id: game.id,
      declaredMax: game.players[1],
      routeId,
      engine: routeId ? engineFileFor(routeId) : null,
      driver: routeId ? DRIVERS[routeId] : null,
    }));
  }

  const failures = results.flatMap((result) => result.failures);
  const tally = (klass) => results.filter((result) => result.klass === klass).length;

  if (failures.length > 0) {
    for (const failure of failures) console.error(`::error::${failure.detail}`);
    console.error(`\ngh#230 / ADR-0065: a manifest player range and the seats its engine accepts are two statements of one promise. ${failures.length} disagreement(s) across ${party.length} party game(s).`);
    process.exit(1);
  }

  const unlocatedDrivers = Object.keys(DRIVERS).filter((routeId) => !party.some((game) => routeIdFor(game) === routeId));
  if (unlocatedDrivers.length > 0) {
    console.error(`::error::these routes have a driver entry but no party game claims them: ${unlocatedDrivers.join(', ')} — delete the stale entry`);
    process.exit(1);
  }

  console.log(
    `seat-cap-check: ${party.length} party game(s), every declared maximum agrees with the seats its engine accepts ` +
    `(${tally('measured')} measured by running the engine's own seat surface, ${tally('located')} read from a count guard, ` +
    `${tally('derived')} derived from the manifest so they cannot disagree). ` +
    'The MINIMUM is not covered here — scripts/validate-games.mjs owns it.',
  );
}

// --- Selftest -----------------------------------------------------------------------------------

function selftest() {
  const engine = (source) => ({ name: 'main.js', source });

  // Reader B must read a real guard and must NOT read a numeral out of copy.
  assert.equal(textCap(readText('if (game.players.length < 10) { seat(); }')), 10, 'a roster-length guard must read as a seat ceiling');
  assert.equal(textCap(readText('const label = "stop at 10.00 exactly";')), null, 'a numeral inside copy must not read as a seat ceiling');
  console.log('PASS reader B: a count guard reads, a numeral in copy does not');

  // The two shapes that are NOT self-anchoring carry the whole weight of COUNT_CONTEXT, so each is
  // calibrated on both sides of that window. Without these legs a wrong window would still read a
  // number, and reading a wrong number is the silent failure this gate cannot otherwise catch.
  assert.equal(textCap(readText('for (let i = 2; i <= 10; i++) { html += `<button class="count-btn">${i}</button>`; }')), 10,
    'a seat-count chip loop must read as a seat ceiling');
  assert.equal(textCap(readText('for (let i = 2; i <= 10; i++) { pos += 1; }')), null,
    'a loop with nothing to do with a count must not read as a seat ceiling');
  assert.equal(textCap(readText('const valid = v >= 2 && v <= 10; count.setAttribute("aria-invalid", String(!valid));')), 10,
    'a validity range over a count field must read as a seat ceiling');
  assert.equal(textCap(readText('const ok = tier >= 2 && tier <= 10; applyDifficulty(tier);')), null,
    'a validity range over something that is not a count must not read as a seat ceiling');
  console.log('PASS reader B context window: a chip loop and a count validity range read, their non-count twins do not');

  // The whole point, in both directions, against a fixture with no driver.
  const under = auditGame({ id: 'g', declaredMax: 10, routeId: 'r', engine: engine('if (playerCount < 20) { step(); }'), driver: null });
  assert.equal(under.failures.length, 1, 'an under-declaration must fail exactly once');
  assert.match(under.failures[0].detail, /declares a maximum of 10 but its engine seats 20/, 'the failure must name both numbers');
  console.log('PASS known-bad under-declaration: declaring ten against an engine that seats twenty fails');

  const over = auditGame({ id: 'g', declaredMax: 30, routeId: 'r', engine: engine('if (playerCount < 20) { step(); }'), driver: null });
  assert.equal(over.failures.length, 1, 'an over-declaration must fail exactly once');
  assert.match(over.failures[0].detail, /declares a maximum of 30 but its engine seats 20/, 'the failure must name both numbers');
  console.log('PASS known-bad over-declaration: declaring thirty against an engine that seats twenty fails');

  const agreed = auditGame({ id: 'g', declaredMax: 20, routeId: 'r', engine: engine('if (playerCount < 20) { step(); }'), driver: null });
  assert.deepEqual(agreed.failures, [], 'known-good: a declaration equal to the engine ceiling must be silent');
  assert.equal(agreed.klass, 'located');
  console.log('PASS known-good: a declaration equal to the engine ceiling is silent');

  // A route no reader can read must be a failure. This is the leg that stops the gate greening on
  // a set it never looked at.
  const blind = auditGame({ id: 'g', declaredMax: 10, routeId: 'r', engine: engine('function play() { return 1; }'), driver: null });
  assert.equal(blind.klass, 'unlocated', 'a route with no locatable ceiling must be classified unlocated');
  assert.match(blind.failures[0].detail, /no seat ceiling could be located/, 'and it must fail, not skip');
  console.log('PASS unlocated: a route no reader can read fails instead of passing');

  // A driver whose surface has moved must say it is measuring nothing.
  const moved = auditGame({
    id: 'g', declaredMax: 10, routeId: 'r', engine: engine('if (playerCount < 10) { step(); }'),
    driver: { what: 'a surface that is gone', run: (source) => compileMethod(source, 'setPlayerCount(count)') },
  });
  assert.match(moved.failures[0].detail, /measuring nothing/, 'a moved surface must report that the gate stopped measuring');
  console.log('PASS moved surface: a locator that no longer slices reports it is measuring nothing');

  // A mint must never pass as a measurement.
  const minted = auditGame({
    id: 'g', declaredMax: 10, routeId: 'r', engine: engine('if (playerCount < 10) { step(); }'),
    driver: { what: 'a driver that measures nothing real', run: () => ({ cap: NaN }) },
  });
  assert.match(minted.failures[0].detail, /the measurement did not happen/, 'a non-integer cap must fail as a failed measurement');
  console.log('PASS poisoned mint: a measurement that is not a seat count fails instead of passing');

  // The two readers disagreeing must red rather than one winning silently.
  const conflicted = auditGame({
    id: 'g', declaredMax: 10, routeId: 'r', engine: engine('if (playerCount < 10) { step(); }'),
    driver: { what: 'a driver that disagrees', run: () => ({ cap: 20 }) },
  });
  assert.equal(conflicted.klass, 'conflicted');
  assert.match(conflicted.failures[0].detail, /the two readers disagree/, 'a reader conflict must be reported as such');
  console.log('PASS reader conflict: execution and text disagreeing reds instead of picking a winner');

  // A route classified as manifest-derived must lose that status if the derivation goes away.
  const brokenDerivation = auditGame({ id: 'g', declaredMax: 10, routeId: 'dice-loser', engine: { name: 'main.ts', source: 'const MAX_PLAYERS = 10;' }, driver: null });
  assert.match(brokenDerivation.failures[0].detail, /no longer reads the declared maximum/, 'a lost derivation must fail');
  const liveDerivation = auditGame({ id: 'g', declaredMax: 10, routeId: 'dice-loser', engine: { name: 'main.ts', source: 'const MAX_PLAYERS = game.players[1];' }, driver: null });
  assert.deepEqual(liveDerivation.failures, [], 'POSITIVE CONTROL: a live derivation must stay silent');
  console.log('PASS derived: a route that stops deriving from the manifest fails, one that still derives is silent');

  console.log('seat-cap-check --selftest: all legs passed');
}

if (process.argv.includes('--selftest')) selftest();
else await audit();
