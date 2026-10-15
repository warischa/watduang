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
import { stripTypeScriptTypes } from 'node:module';
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
  // gh#264 / ADR-0071: the route's own stepper is gone -- the count is the shared player screen's,
  // whose clamp is proved once by sharedScreenAudit below. What is still this route's is the ENGINE
  // the players are seated into, so that is what is run: the real CursedNumberGameModel, imported,
  // asked to seat an absurd count. The route must still seat into that model, or the measurement is
  // of a class the route no longer uses -- that is checked on the route's own source first.
  'cursed-number': {
    what: 'the engine model the route seats its players into clamps the count (CursedNumberGameModel.setPlayerCount, imported and run)',
    engineModule: 'src/games/cursed-number.ts',
    run: (source, engineModule) => {
      if (!/new CursedNumberGameModel\(/.test(source) || !/\.setPlayerCount\(/.test(source)) {
        return { error: 'the route no longer seats its players through CursedNumberGameModel.setPlayerCount' };
      }
      const Model = engineModule?.CursedNumberGameModel;
      if (typeof Model !== 'function') return { error: 'src/games/cursed-number.ts no longer exports CursedNumberGameModel' };
      const model = new Model([]);
      model.setPlayerCount(PROBE_COUNT);
      return { cap: model.playerCount };
    },
  },
  // gh#264 / ADR-0071: the route's own count field and its validity guard are gone -- the count is
  // the shared player screen's. What is still this route's is the ENGINE: makeMatch seats any number
  // of names, but every wrong answer is dealt a distinct nose value from one fixed pool, so the
  // largest group that can ALL answer wrong in one round is the seat limit. That round is played on
  // the real engine, imported, for a growing group, until it throws.
  'pinocchio-luck': {
    what: 'the engine deals each wrong answer a distinct value from one growth pool (makeMatch + resolveChoice + advanceTurn, imported and run with every answer wrong)',
    engineModule: 'src/games/pinocchio-luck.ts',
    run: (source, engine) => {
      if (!/makeMatch\(/.test(source)) return { error: 'the route no longer seats its players through makeMatch' };
      const { makeMatch, resolveChoice, advanceTurn, currentPlayer, PHASE } = engine ?? {};
      if (![makeMatch, resolveChoice, advanceTurn, currentPlayer].every((fn) => typeof fn === 'function') || !PHASE) {
        return { error: 'src/games/pinocchio-luck.ts no longer exports makeMatch, resolveChoice, advanceTurn, currentPlayer and PHASE' };
      }
      for (let seats = 2; seats <= SATURATION_LIMIT; seats += 1) {
        const match = makeMatch(Array.from({ length: seats }, (_, i) => `seat-${i + 1}`));
        try {
          for (let turn = 0; turn < seats; turn += 1) {
            match.phase = PHASE.QUESTION;
            const player = currentPlayer(match);
            resolveChoice(match, ['A', 'B', 'C'].find((c) => c !== player.assignedCorrectChoice));
            match.phase = PHASE.TURN_RESULT;
            advanceTurn(match);
          }
        } catch {
          return { cap: seats - 1 };
        }
      }
      return { error: `an all-wrong round never failed up to ${SATURATION_LIMIT} seat(s)` };
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
// Two shapes: the maximum read out (`= game.players[1]`, dice-loser), or the whole declared tuple
// handed to the shared player screen (`range: game.players`, timebomb since gh#264) -- whose clamp
// sharedScreenAudit below then runs against that same tuple.
const DERIVATION = /(?:=|range:)\s*(?:Math\.min\(\s*)?game\.players(?:\[1\]|(?![\w[]))/;

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
    const result = driver.run(engine.source, engine.module);
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

// --- The shared player screen (gh#264, ADR-0071) ------------------------------------------------
// A converted route has no count control of its own: the shared screen's stepper and its clamp
// admit the players, and they read the range the route hands over. So for every route that mounts
// it, two facts are proved, and either failing is RED:
//   STRUCTURAL -- the mount call's `range:` is `<x>.players`, where <x> is the route's DEFAULT import
//     of its own game module (the object the manifest registers). A literal range, or a players
//     field from any other module, is a second statement of the range and reds.
//   EXECUTED -- the real clampCount, imported from the shared screen, asked for an absurd count
//     against that game's declared tuple, returns the declared maximum; and the declared maximum
//     sits under the shared ROSTER_CEILING (ADR-0071 ruling 7: above it reds the build).
// The ENGINE's own seat limit is still the per-route audit above; this adds the admission side.
const MOUNT = /mountPlayerScreen\(\{/;

export function sharedScreenAudit({ id, routeId, source, declared, screen }) {
  const failures = [];
  const say = (detail) => failures.push({ id, detail });
  const fed = /mountPlayerScreen\(\{[\s\S]*?range:\s*([A-Za-z_$][\w$]*)\.players\b(?!\s*\[)/.exec(source);
  const importer = new RegExp(`import\\s+([A-Za-z_$][\\w$]*)\\s*(?:,\\s*\\{[^}]*\\})?\\s*from\\s*['"]\\.\\./\\.\\./games/${routeId}(?:\\.ts)?['"]`).exec(source);
  if (!fed || !importer || fed[1] !== importer[1]) {
    say(`${routeId} mounts the shared player screen but does not hand it its own manifest range (\`range: <its default game import>.players\`) — the screen would admit a range nothing checks`);
  }
  let clamped;
  try {
    clamped = screen.clampCount(PROBE_COUNT, declared);
  } catch (error) {
    clamped = `nothing (it refused the range: ${error.message})`;
  }
  if (clamped !== declared[1]) {
    say(`${routeId}: the shared screen's clamp admits ${clamped} against a declared maximum of ${declared[1]}`);
  }
  if (declared[1] > screen.ROSTER_CEILING) {
    say(`${id} declares a maximum of ${declared[1]}, above the shared roster ceiling of ${screen.ROSTER_CEILING} (ADR-0071 ruling 7)`);
  }
  return failures;
}

// --- The handoff (gh#265) -----------------------------------------------------------------------
// The readers above measure the surface that ADMITS a count: a clamp, a stepper, a guard, the shared
// screen's clamp. None of them runs the HANDOFF -- the route's own function that receives the chosen
// players and seats them. A handoff that keeps 2 of the 20 it was given passed every leg above
// (gh#265: executed on cursed-number and timebomb, and on the base tree). Under ADR-0071 every party
// route receives its players through exactly one such function, so that function is run here.
// For every route that mounts the shared screen, its handoff bytes are sliced out and RUN with the
// declared minimum and the declared maximum of distinct players; each must seat exactly what it was
// handed. A mounting route with no entry below is RED, never skipped: a route converted later must
// name its handoff here on the day it converts.
const HANDOFF_SIZES = (declared) => [...new Set([declared[0], declared[1]])];

function makePlayers(count) {
  return Array.from({ length: count }, (_, i) => ({ name: `seat-${i + 1}`, emoji: '?', mascot: i }));
}

/** Slice one or more TypeScript functions, strip their types, and compile them in one tolerant scope. */
function compileTsFunctions(source, headers) {
  const parts = [];
  for (const header of headers) {
    const body = sliceBlock(source, header);
    if (!body) return { error: `no surface answers to \`${header}\`` };
    try {
      parts.push(stripTypeScriptTypes(`function ${body}`));
    } catch (error) { return { error: `\`${header}\` will not strip to JavaScript: ${error.message}` }; }
  }
  const [entry, ...helpers] = parts;
  try {
    const factory = new Function('__scope', '__env',
      `with (__scope) { with (__env) { ${helpers.join('\n')}\n return ${entry} } }`);
    return { make: (env) => factory(freeScope, env) };
  } catch (error) { return { error: `slice will not compile: ${error.message}` }; }
}

const HANDOFFS = {
  timebomb: {
    what: 'begin() keeps the players the shared screen hands it, and buildContext() hands that list to the engine as session.players',
    run: (source, _module, players) => {
      const compiled = compileTsFunctions(source, ['begin(players: Player[]): void', 'buildContext(): GameContext']);
      if (compiled.error) return compiled;
      let mounted = null;
      const env = {
        playing: [],
        stageEl: { hidden: true },
        game: { dispose() {}, mount(_el, context) { mounted = context; } },
      };
      compiled.make(env)(players);
      if (!mounted) return { error: 'begin() never mounted the engine, so no seated list could be read' };
      return { seated: mounted.session?.players?.length };
    },
  },
  'cursed-number': {
    what: 'startWithPlayers() builds the CursedNumberGameModel the round is played on',
    engineModule: 'src/games/cursed-number.ts',
    run: (source, engineModule, players) => {
      const Model = engineModule?.CursedNumberGameModel;
      if (typeof Model !== 'function') return { error: 'src/games/cursed-number.ts no longer exports CursedNumberGameModel' };
      const compiled = compileMethod(source, 'startWithPlayers(players)');
      if (compiled.error) return compiled;
      const env = {
        CursedNumberGameModel: Model,
        seatColorVar: engineModule.seatColorVar,
        window: {},
        document: { getElementById: () => ({}) },
      };
      const receiver = tolerantReceiver({});
      compiled.make(env).call(receiver, players);
      const model = receiver.game;
      if (!(model instanceof Model)) return { error: 'startWithPlayers() did not leave a CursedNumberGameModel on the route' };
      // Both views of the seat count must agree with the hand: the count the round reads and the
      // seats it iterates.
      return { seated: model.playerCount === model.players.length ? model.playerCount : NaN };
    },
  },
  'pinocchio-luck': {
    what: 'startWithPlayers() builds the match the round is played on (makeMatch, imported)',
    engineModule: 'src/games/pinocchio-luck.ts',
    run: (source, engineModule, players) => {
      if (typeof engineModule?.makeMatch !== 'function') return { error: 'src/games/pinocchio-luck.ts no longer exports makeMatch' };
      const compiled = compileMethod(source, 'startWithPlayers(players)');
      if (compiled.error) return compiled;
      // `game` must be a key here, so the handoff's assignment lands in this scope and is read back.
      const env = { game: null, makeMatch: engineModule.makeMatch, liveRng: engineModule.liveRng, panel: {} };
      compiled.make(env)(players);
      const match = env.game;
      if (!match || !Array.isArray(match.players)) return { error: 'startWithPlayers() left no match on the route' };
      // Both views of the seat count must agree with the hand: the seats and the turn order played.
      return { seated: match.players.length === match.turnOrder?.length ? match.players.length : NaN };
    },
  },
};

export function handoffAudit({ id, routeId, source, module, declared, handoff }) {
  const failures = [];
  const say = (detail) => failures.push({ id, detail });
  if (!handoff) {
    say(`${routeId} mounts the shared player screen but has no handoff locator in seat-cap-check's HANDOFFS — the function that seats the players it is handed is unmeasured. Add an entry naming that function (gh#265)`);
    return failures;
  }
  for (const count of HANDOFF_SIZES(declared)) {
    let result;
    try {
      result = handoff.run(source, module, makePlayers(count));
    } catch (error) {
      result = { error: `the handoff threw: ${error.message}` };
    }
    if (result.error) {
      say(`${routeId}: the handoff could not be run — ${result.error}. This gate is measuring nothing for this route's handoff until its locator is re-pointed (${handoff.what})`);
      return failures;
    }
    if (!Number.isInteger(result.seated)) {
      say(`${routeId}: running the handoff with ${count} players produced ${JSON.stringify(result.seated)}, which is not a seat count — the measurement did not happen`);
    } else if (result.seated !== count) {
      say(`${routeId}: the handoff was handed ${count} players and seated ${result.seated}. The shared screen admits up to the declared maximum, so the route must seat every player it is handed (${handoff.what})`);
    }
  }
  return failures;
}

async function audit() {
  const { games } = await import(pathToFileURL(path.join(root, 'src/games/manifest.ts')).href);
  const screen = await import(pathToFileURL(path.join(root, 'src/play/_player-screen/player-screen.ts')).href);
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
  const sharedFailures = [];
  let sharedCount = 0;
  let handoffCount = 0;
  for (const game of party) {
    const routeId = routeIdFor(game);
    const engine = routeId ? engineFileFor(routeId) : null;
    const driver = routeId ? DRIVERS[routeId] : null;
    if (engine && driver?.engineModule) {
      engine.module = await import(pathToFileURL(path.join(root, driver.engineModule)).href);
    }
    results.push(auditGame({ id: game.id, declaredMax: game.players[1], routeId, engine, driver }));
    if (engine && MOUNT.test(engine.source)) {
      sharedCount += 1;
      sharedFailures.push(...sharedScreenAudit({ id: game.id, routeId, source: engine.source, declared: game.players, screen }));
      const handoff = HANDOFFS[routeId];
      const handoffModule = handoff?.engineModule
        ? await import(pathToFileURL(path.join(root, handoff.engineModule)).href)
        : undefined;
      sharedFailures.push(...handoffAudit({ id: game.id, routeId, source: engine.source, module: handoffModule, declared: game.players, handoff }));
      if (handoff) handoffCount += 1;
    }
  }
  const staleHandoffs = Object.keys(HANDOFFS).filter((routeId) => {
    const game = party.find((g) => routeIdFor(g) === routeId);
    const engine = game ? engineFileFor(routeId) : null;
    return !engine || !MOUNT.test(engine.source);
  });
  for (const routeId of staleHandoffs) {
    sharedFailures.push({ id: routeId, detail: `${routeId} has a handoff entry but no party route by that id mounts the shared player screen — delete or re-point the stale entry` });
  }

  const failures = [...results.flatMap((result) => result.failures), ...sharedFailures];
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
    `${tally('derived')} derived from the manifest so they cannot disagree); ` +
    `${sharedCount} route(s) mount the shared player screen, each handing it its own manifest range, ` +
    'and its clamp admits exactly the declared maximum (run, not read); ' +
    `${handoffCount} handoff(s) run at the declared minimum and maximum, each seating every player it is handed. ` +
    'The MINIMUM is not covered here — scripts/validate-games.mjs owns it.',
  );
}

// --- Selftest -----------------------------------------------------------------------------------

async function selftest() {
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

  // gh#264: the hand-off to the shared screen is a derivation too, in its tuple form.
  const tupleDerivation = auditGame({ id: 'g', declaredMax: 10, routeId: 'timebomb', engine: { name: 'main.ts', source: 'mountPlayerScreen({ root, range: game.players, onStart });' }, driver: null });
  assert.deepEqual(tupleDerivation.failures, [], 'POSITIVE CONTROL: handing the declared tuple over is a live derivation');
  const indexed = auditGame({ id: 'g', declaredMax: 10, routeId: 'timebomb', engine: { name: 'main.ts', source: 'mountPlayerScreen({ root, range: game.players0, onStart });' }, driver: null });
  assert.match(indexed.failures[0].detail, /no longer reads the declared maximum/, 'a different identifier must not read as the tuple');
  console.log('PASS derived (tuple): handing game.players to the shared screen derives; a lookalike identifier does not');

  // gh#264: the shared screen audit, against the REAL shared clamp, both directions.
  const screen = await import(pathToFileURL(path.join(root, 'src/play/_player-screen/player-screen.ts')).href);
  const good = "import game from '../../games/g.ts';\nmountPlayerScreen({ root, range: game.players, onStart });";
  assert.deepEqual(sharedScreenAudit({ id: 'g', routeId: 'g', source: good, declared: [2, 10], screen }), [],
    'POSITIVE CONTROL: a route handing its own manifest range to the real clamp is silent');
  const literal = "import game from '../../games/g.ts';\nmountPlayerScreen({ root, range: [2, 99], onStart });";
  assert.match(sharedScreenAudit({ id: 'g', routeId: 'g', source: literal, declared: [2, 10], screen })[0].detail, /does not hand it its own manifest range/,
    'a literal range must red');
  const foreign = "import game from '../../games/g.ts';\nimport other from '../../games/h.ts';\nmountPlayerScreen({ root, range: other.players, onStart });";
  assert.match(sharedScreenAudit({ id: 'g', routeId: 'g', source: foreign, declared: [2, 10], screen })[0].detail, /does not hand it its own manifest range/,
    'another module\'s range must red');
  const tooMany = sharedScreenAudit({ id: 'g', routeId: 'g', source: good, declared: [2, 25], screen });
  assert.ok(tooMany.some((f) => /above the shared roster ceiling/.test(f.detail)), 'a maximum above the ceiling must red');
  const broken = { ...screen, clampCount: () => PROBE_COUNT };
  assert.match(sharedScreenAudit({ id: 'g', routeId: 'g', source: good, declared: [2, 10], screen: broken })[0].detail, /clamp admits 9999/,
    'a clamp that does not clamp must red');
  console.log('PASS shared screen: own range + real clamp is silent; a literal or foreign range, a maximum over the ceiling, and a non-clamping clamp each red');

  // gh#265: the handoff, against fixtures first -- every class in both directions.
  const seatsAll = { what: 'fixture', run: (_s, _m, players) => ({ seated: players.length }) };
  const keepsTwo = { what: 'fixture', run: (_s, _m, players) => ({ seated: Math.min(players.length, 2) }) };
  const goneSurface = { what: 'fixture', run: (source) => compileMethod(source, 'startWithPlayers(players)') };
  const mintedSeat = { what: 'fixture', run: () => ({ seated: NaN }) };
  const fixtureArgs = { id: 'g', routeId: 'r', source: '', module: undefined, declared: [2, 10] };
  assert.deepEqual(handoffAudit({ ...fixtureArgs, handoff: seatsAll }), [], 'POSITIVE CONTROL: a handoff that seats every player is silent');
  assert.match(handoffAudit({ ...fixtureArgs, handoff: keepsTwo })[0].detail, /handed 10 players and seated 2/, 'a handoff that drops seats must red, naming both numbers');
  assert.match(handoffAudit({ ...fixtureArgs, handoff: goneSurface })[0].detail, /measuring nothing/, 'a handoff locator whose surface moved must say it measures nothing');
  assert.match(handoffAudit({ ...fixtureArgs, handoff: mintedSeat })[0].detail, /the measurement did not happen/, 'a non-integer seat count must fail as a failed measurement');
  assert.match(handoffAudit({ ...fixtureArgs, handoff: undefined })[0].detail, /has no handoff locator/, 'a mounting route with no locator must red, not skip');
  console.log('PASS handoff fixtures: seats-all is silent; dropped seats, a moved surface, a minted count and a missing locator each red');

  // gh#265: the REAL handoffs, run on the real route bytes, then on the two mutants the gap was
  // found with. A mutant that no longer applies is itself a failure: a dead mutant proves nothing.
  const { games } = await import(pathToFileURL(path.join(root, 'src/games/manifest.ts')).href);
  const real = async (routeId) => {
    const game = games.find((g) => routeIdFor(g) === routeId);
    const handoff = HANDOFFS[routeId];
    const module = handoff.engineModule ? await import(pathToFileURL(path.join(root, handoff.engineModule)).href) : undefined;
    return { id: game.id, routeId, source: engineFileFor(routeId).source, module, declared: game.players, handoff };
  };
  const mutate = (args, from, to) => {
    assert.ok(args.source.includes(from), `the gh#265 mutant no longer applies to ${args.routeId}: \`${from}\` is gone — re-point this leg to the route's current handoff`);
    return { ...args, source: args.source.replace(from, to) };
  };
  const timebombArgs = await real('timebomb');
  assert.deepEqual(handoffAudit(timebombArgs), [], 'POSITIVE CONTROL: the real timebomb handoff seats every player');
  assert.match(handoffAudit(mutate(timebombArgs, 'playing = players.map((p) => p.name);', 'playing = players.slice(0, 2).map((p) => p.name);'))[0].detail,
    /handed 10 players and seated 2/, 'a timebomb handoff keeping two players must red');
  const cursedArgs = await real('cursed-number');
  assert.deepEqual(handoffAudit(cursedArgs), [], 'POSITIVE CONTROL: the real cursed-number handoff seats every player');
  assert.match(handoffAudit(mutate(cursedArgs, 'this.game.setPlayerCount(seats.length);', 'this.game.setPlayerCount(2);'))[0].detail,
    /handed 20 players and seated 2/, 'a cursed-number handoff seating two of twenty must red');
  console.log('PASS handoff (real): both pilot handoffs seat every player at min and max; each gh#265 mutant reds');

  console.log('seat-cap-check --selftest: all legs passed');
}

if (process.argv.includes('--selftest')) await selftest();
else await audit();
