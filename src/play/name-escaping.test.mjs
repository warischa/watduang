// Player names are typed by players, persisted, and re-read — they are untrusted text on every play
// route. This file pins ONE invariant across the routes that build markup by string:
//
//   a roster name can never introduce an element, and can never terminate the attribute it sits in.
//
// It has TWO tiers, and they cover different things on purpose.
//
// Tier 1 — behavioural, per route, deep: the harnesses below drive the real render functions with a
// hostile name and assert on the resulting DOM. Deep, but it only ever covers routes someone wrote a
// harness for. That is exactly how wire-snip-panic shipped three raw sinks: this file used to name
// short-stick, power-meter and cannon-flag by hand, eight more routes landed, and a route simply not
// written into the file is never tested and nothing fails. A green earned coverage of 3 and read as
// coverage of the class.
//
// Tier 2 — static, across EVERY route derived from src/games/manifest.ts, so the next port is covered
// the day its manifest line lands. Each derived route must land in one of two evidence-checked
// classes, and anything else is a red that names the route:
//   NO_HTML_SINK  — the source performs no HTML-sink write at all (checked, not listed).
//   ESCAPED       — the source declares a helper that maps every character its own sink contexts can
//                   be broken out of, and calls that helper inside a sink template. The helper is
//                   found by BEHAVIOUR (the entities its body emits), never by name — `pinocchio-luck`
//                   calls its helper `esc`, and a name list would have missed it.
//
// What tier 2's green does NOT cover, stated plainly because it is the honest ceiling of a static
// check: it proves a route HAS a working escape helper and uses it in markup — not that it uses it at
// EVERY sink. A route that escapes nine names and misses the tenth passes tier 2. Only a tier 1
// harness catches that, and tier 1 is only the routes in the DEEP set below. Deciding which
// interpolations carry a roster name cannot be done from source text without guessing: `${res.name}`
// in cannon-flag is a QA test's own label and `${color.name}` in wire-snip-panic is a wire colour from
// a frozen table, so a name-shaped predicate needs per-site exemptions — the same hand-list that
// rotted the first version of this file. The lesson tier 2 does encode is the one that actually
// shipped the bug: wire-snip-panic declared no escape helper at all.
//
// A second, wider ceiling on tier 2: SINK_WRITE only matches a sink write immediately followed by an
// opening backtick (auditFile walks forward through whitespace and bails the moment the next
// character is not `` ` ``). Markup composed away from its sink is therefore never measured — and it
// arrives in TWO shapes, not one, which is the part that gets missed:
//   * the sink is handed a call or a variable instead of a template, as in an innerHTML assigned the
//     result of a build function. auditFile has nothing to read at the write site, so that sink
//     contributes no holes at all.
//   * the sink IS a scanned template, but the composed markup enters it through one opaque hole — a
//     single interpolation holding pre-built rows. The hole is counted; what was built into it never
//     is. The route can still class ESCAPED because a SIBLING hole in that same template calls the
//     helper. This is the shape that reads as covered, and grepping for the first shape misses it.
// NO ROUTE LIST IS WRITTEN HERE ON PURPOSE. A hand list rots exactly the way this file's own stale
// tier-1 count did, and the set is bigger than the obvious members. Derive it instead: reuse
// SINK_WRITE and scanTemplate over every module resolveModules returns, and treat an interpolation
// whose name says it already holds markup as suspect until read.
// Tier 1 DOES cover some routes in this shape, and the DEEP set below is the only honest statement of
// which — do not assume a composing route is uncovered, and do not assume it is covered. A composing
// route that is NOT in DEEP is still CLASSIFIED here, and can still class ESCAPED; what nothing in
// this file covers is that route's composed markup. ADR-0061 is the reason a
// reviewer must still read new play-route markup for name interpolation by hand — the gate does not
// discharge that.
//
// It runs the REAL bytes. Each render function is sliced out of its main.js by source text and
// evaluated (the same idiom as short-stick/fairness.test.mjs), because every main.js is a lifted
// IIFE with no exports — importing one would need a DOM, an AudioContext and a canvas. A rename or
// a rewrite of any sliced function fails this file loudly instead of silently testing nothing.
//
// escapeHtml is sliced OPTIONALLY and deliberately: on an unfixed file it simply is not there, the
// renderers never call it, and the injection assertions go red. That is what makes the red leg an
// honest reproduction of the bug rather than a slicing error. Never replace it with a stub — an
// identity stub would red the fixed code too, and a real stub would green the unfixed code.
//
// The one input where fixed and unfixed visibly diverge is HOSTILE below: the leading `">` closes
// any attribute the name lands in, and the anchor is an element in body context. One string, both
// contexts, on every sink.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FakeElement, makeDocument } from '../games/_fake-dom.mjs';
// Real modules, not fakes. loadFrom() brace-slices DECLARATIONS out of a route's own text, so an
// `import` its sliced functions depend on can never be sliced and has to be supplied. Supplying the
// genuine module beats hand-rolling a stub that drifts from it: that drift is exactly how this file
// broke when the cast moved to _mascots.ts and the losing rule moved to turn-rules.ts, and a stale
// `PLAYER_AVATARS` stub kept it green until CI ran the suite. Node >=22.18 strips the TS types,
// which package.json's check-node-version already requires.
import { MASCOTS, mascotEmoji } from './_mascots.ts';
import { loserOf } from './wire-snip-panic/turn-rules.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

// Thai, because a real roster name is Thai — a pure-ASCII payload would not prove the escape
// survives the characters this product actually carries. `boom` is the marker the assertions look
// for: escaped it survives as text inside the attribute, unescaped it lands outside it.
const HOSTILE = 'นัท"><a href="/x">boom</a>';

// Tier 1 membership, recorded by the harnesses themselves at the END of each test, so a route only
// counts as behaviourally covered once its assertions actually passed. Read by the coverage test.
const DEEP = new Set();

/** Slices a top-level `function name(...)`, `const name = ...` or `class name {` out of main.js by
 *  matching braces from the first `{` of its body. Returns null when the declaration is absent.
 *  The `class` form exists for zero-trigger's GameEngine: its renders are methods, not top-level
 *  declarations, so the whole class is sliced as one unit and its methods are reached off
 *  `GameEngine.prototype` afterwards. */
function sliceDecl(source, name) {
  for (const decl of [`function ${name}(`, `const ${name} = `, `let ${name} = `, `class ${name} `]) {
    const start = source.indexOf(decl);
    if (start === -1) continue;
    const open = source.indexOf('{', start);
    if (open === -1) continue;
    let depth = 0;
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) return source.slice(start, i + 1);
      }
    }
    throw new Error(`unbalanced braces while slicing ${name}`);
  }
  return null;
}

/** Evaluates the named declarations of `<game>/main.js` inside a scope built from `stubs`.
 *  Names in `optional` may be missing (that is how the unfixed leg is reproduced); every other name
 *  MUST be found, so a rename reds this file instead of shrinking what it covers. */
function loadFrom(game, names, stubs, optional = []) {
  const source = fs.readFileSync(path.join(here, game, 'main.js'), 'utf8');
  const found = [];
  const parts = [];
  for (const n of names) {
    const slice = sliceDecl(source, n);
    if (slice === null) {
      assert.ok(optional.includes(n), `${game}/main.js no longer declares ${n} — this test is measuring nothing`);
      continue;
    }
    found.push(n);
    parts.push(slice);
  }
  const keys = Object.keys(stubs);
  // eslint-disable-next-line no-new-func -- the whole point is to execute main.js's own text.
  const factory = new Function(...keys, `${parts.join('\n;\n')}\n;return { ${found.join(', ')} };`);
  return factory(...keys.map((k) => stubs[k]));
}

function makeDoc() {
  const doc = makeDocument();
  const byId = new Map();
  doc.getElementById = (id) => {
    if (!byId.has(id)) {
      const el = new FakeElement('div', doc);
      el.id = id;
      byId.set(id, el);
    }
    return byId.get(id);
  };
  doc.body = new FakeElement('body', doc);
  return doc;
}

const noopProxy = () => new Proxy({}, { get: () => () => {} });

/** Every character the render actually produced: own text plus every attribute value, walked. Read
 *  structurally rather than off `root.innerHTML`, because the containers these routes append into
 *  never had innerHTML written on them and would report an empty string. */
function renderedText(node) {
  let out = node.textContent || '';
  for (const value of Object.values(node._attrs || {})) out += ` ${value}`;
  for (const child of node.children) out += ` ${renderedText(child)}`;
  return out;
}

/** The whole assertion set, in one place: nothing the name carries may become an element. */
function assertNoInjection(root, label) {
  assert.ok(renderedText(root).includes('นัท'), `${label}: the hostile name never rendered — this check is measuring nothing`);
  assert.equal(root.querySelectorAll('a').length, 0,
    `${label}: a player name introduced an <a> element into the DOM`);
}

/** Attribute-context sinks only: the value must still carry the whole name, i.e. the payload never
 *  terminated the attribute early. */
function assertAttributeIntact(root, selector, label) {
  // Only the inputs that carry the hostile name: these renders also emit legitimately empty rows
  // (a seat with no name yet), and an empty value is not a truncation.
  const carrying = root.querySelectorAll(selector).filter((el) => String(el.getAttribute('value')).includes('นัท'));
  assert.ok(carrying.length > 0, `${label}: no ${selector} carried the name — this check is measuring nothing`);
  for (const input of carrying) {
    assert.ok(String(input.getAttribute('value')).includes('boom'),
      `${label}: the value attribute was terminated by the name (got ${JSON.stringify(input.getAttribute('value'))})`);
  }
}

/* ---- short-stick ---------------------------------------------------------------------------- */

test('short-stick: setup inputs, draw strip and history escape roster names', () => {
  const document = makeDoc();
  const game = {
    players: [HOSTILE, HOSTILE],
    penaltyMode: 'preset',
    selectedPenalty: 'x',
    turn: 0,
    drawIndex: 0,
    lengths: [10, 20],
    used: [false, false],
    shortIndices: [0],
    isResolving: false,
    loser: { player: HOSTILE, length: 10 },
    history: [{ player: HOSTILE, stickIndex: 0, length: 10, isShort: true }],
  };
  const api = loadFrom('short-stick', ['escapeHtml', 'renderSetup', 'renderDraw', 'renderResult'], {
    document,
    game,
    $: (id) => document.getElementById(id),
    AVATARS: ['🦊', '🐼'],
    PENALTY_PRESETS: ['ก', 'ข'],
    // gh#174 routed the seat default through mascotNames() in ../_mascots.ts. renderSetup prints it
    // into the placeholder attribute, but this factory evals sliced text and cannot resolve that
    // import, so the helper is stubbed like every other collaborator here. Benign on purpose: a
    // default name is OURS, never the attacker's, and the channel this file guards is the roster
    // value beside it. The real cast is pinned by ./mascot-defaults.test.mjs.
    defaultName: (i) => `P${i + 1}`,
    sounds: noopProxy(),
    saveDraft: () => {},
    handleDrawStick: () => {},
    lockFairCounts: () => {},
    // renderDraw re-arms the ghost-tap gate on every turn handover (ADR-0017). Stubbed like every
    // other collaborator here: this test measures escaping, and armAllButtons writes no markup.
    armAllButtons: () => {},
    // gh#184 ends this strip render with the shared `+N` seat counter from ../_strip-overflow.ts.
    // Stubbed like every other collaborator that crosses a module boundary here, and benign for a
    // reason that was checked rather than assumed: the module's ONLY text write is
    // `counter.textContent = "+" + hidden`, a number it computes from client rects. It never
    // receives a roster value, so it cannot be an escape sink. That digits-only claim is pinned by
    // ./strip-overflow-counter.test.mjs, which drives the real module over a hostile chip name.
    mountStripOverflowCounter: () => {},
    calculateOdds: () => ({ remaining: 2, text: '50%', isCritical: false, isWarning: false }),
  }, ['escapeHtml']);

  api.renderSetup();
  const list = document.getElementById('player-inputs-container');
  assertNoInjection(list, 'short-stick renderSetup');
  assertAttributeIntact(list, '.player-input', 'short-stick renderSetup');

  api.renderDraw();
  assertNoInjection(document.getElementById('draw-player-strip'), 'short-stick renderDraw');

  api.renderResult();
  assertNoInjection(document.getElementById('history-rows-container'), 'short-stick renderResult');
  DEEP.add('short-stick');
});

/* ---- power-meter ---------------------------------------------------------------------------- */

function powerMeterHarness() {
  const document = makeDoc();
  const viewRoot = new FakeElement('div', document);
  const player = { id: 'player_1', name: HOSTILE, avatar: '💪', color: '#0ff' };
  const outcome = {
    isFinished: true,
    minTotalHundredths: 100,
    tiedPlayerIds: ['player_1'],
    loserPlayerId: 'player_1',
  };
  const game = {
    players: [player],
    activePlayerIds: ['player_1'],
    currentTurnIndex: 0,
    currentAttempt: 1,
    currentRoundNumber: 1,
    isTiebreak: false,
    state: 'ATTEMPT_READY',
    playerCount: 1,
    meter: { currentValueHundredths: 500, lockedScoreHundredths: 500 },
    roundResults: new Map([['player_1', { attempts: [100, 200, 300], totalHundredths: 600 }]]),
    lastEvaluatedOutcome: outcome,
  };
  const api = loadFrom('power-meter', [
    'escapeHtml', 'formatScore', 'getCurrentActivePlayer', 'getGaugeHeightPercent',
    'renderSetupNamesView', 'renderTurnIntroView', 'renderAttemptView',
    'renderPlayerRoundResultView', 'renderRoundSummaryView', 'renderTiebreakIntroView',
    'renderFinalLoserView',
  ], {
    document,
    viewRoot,
    game,
    // `const GameState = Object.freeze({...})` does not brace-slice, and its values are its own key
    // names — a key-echoing proxy is the same object for every branch these views take on it.
    GameState: new Proxy({}, { get: (_t, k) => k }),
    announceSR: () => {},
    soundSynth: noopProxy(),
    addTrauma: () => {},
    evaluateRoundElimination: () => outcome,
    // gh#175 routed the seat default through mascotNames() in ../_mascots.ts, which this factory
    // cannot resolve — it evals sliced text. Stubbed like every other collaborator here, and benign
    // on purpose: a default name is OURS, never the attacker's, and the channel this file guards is
    // the roster value beside it. The real cast is pinned by ./mascot-defaults.test.mjs.
    defaultName: (i) => `P${i + 1}`,
  }, ['escapeHtml']);
  return { api, viewRoot };
}

test('power-meter: every view that prints a player name escapes it', () => {
  const { api, viewRoot } = powerMeterHarness();

  api.renderSetupNamesView();
  assertNoInjection(viewRoot, 'power-meter renderSetupNamesView');
  assertAttributeIntact(viewRoot, '.name-input', 'power-meter renderSetupNamesView');

  for (const name of ['renderTurnIntroView', 'renderAttemptView', 'renderPlayerRoundResultView',
    'renderRoundSummaryView', 'renderTiebreakIntroView', 'renderFinalLoserView']) {
    api[name]();
    assertNoInjection(viewRoot, `power-meter ${name}`);
  }
  DEEP.add('power-meter');
});

/* ---- cannon-flag ---------------------------------------------------------------------------- */

function cannonFlagHarness(standings) {
  const document = makeDoc();
  const el = (cls) => {
    const node = new FakeElement('div', document);
    node.className = cls;
    return node;
  };
  const DOM = {
    displayPlayerCount: el(''),
    labelPlayerCount: el(''),
    playerNamesContainer: el(''),
    leaderboardTbody: el(''),
    resultsVerdictContainer: el(''),
    screenResults: el(''),
    hudMatchSeed: el(''),
  };
  const api = loadFrom('cannon-flag', ['escapeHtml', 'renderSetupPlayerInputs', 'showResultsScreen'], {
    document,
    DOM,
    setupPlayerCount: 2,
    gameEngine: { calculateStandings: () => standings, startSuddenDeath: () => ({ seed: 1 }) },
    sound: noopProxy(),
    showScreen: () => {},
    showPassDeviceScreen: () => {},
    // Same as power-meter above: gh#175 put the seat default behind ../_mascots.ts, which this
    // factory cannot import. Benign by design — the attacker-controlled channel here is the typed
    // name this route re-reads off its own live inputs, not the placeholder beside it.
    defaultName: (i) => `P${i + 1}`,
    // gh#140: the row badge's animal icon. The real lookup, not a stub -- it takes an index and
    // returns a cast constant, so it carries no attacker-controlled channel for this file to model.
    mascotEmoji,
  }, ['escapeHtml']);
  return { api, DOM };
}

const scored = (name) => ({ name, bestDistance: 1.5, shot1Distance: 1.5, shot2Distance: 2.5 });

test('cannon-flag: setup inputs re-read a typed name and must re-emit it escaped', () => {
  // The real path: renderSetupPlayerInputs reads the LIVE inputs' .value back and re-renders them
  // into an attribute. That makes the typed name untrusted input to its own re-render.
  const { api, DOM } = cannonFlagHarness({ sortedLeaderboard: [], worstDistance: 0, isTie: false, singleLoser: scored('x') });
  const typed = new FakeElement('input', null);
  typed.className = 'player-name-input';
  typed.value = HOSTILE;
  DOM.playerNamesContainer.appendChild(typed);

  api.renderSetupPlayerInputs();
  assertNoInjection(DOM.playerNamesContainer, 'cannon-flag renderSetupPlayerInputs');
  assertAttributeIntact(DOM.playerNamesContainer, '.player-name-input', 'cannon-flag renderSetupPlayerInputs');
});

test('cannon-flag: leaderboard and both verdict banners escape player names', () => {
  const single = cannonFlagHarness({
    sortedLeaderboard: [scored(HOSTILE)],
    worstDistance: 1.5,
    isTie: false,
    singleLoser: scored(HOSTILE),
  });
  single.api.showResultsScreen();
  assertNoInjection(single.DOM.leaderboardTbody, 'cannon-flag leaderboard');
  assertNoInjection(single.DOM.resultsVerdictContainer, 'cannon-flag final-loser banner');

  const tied = cannonFlagHarness({
    sortedLeaderboard: [scored(HOSTILE)],
    worstDistance: 1.5,
    isTie: true,
    tiedLosers: [scored(HOSTILE), scored(HOSTILE)],
  });
  tied.api.showResultsScreen();
  assertNoInjection(tied.DOM.resultsVerdictContainer, 'cannon-flag tie banner');
  DEEP.add('cannon-flag');
});

/* ---- wire-snip-panic ------------------------------------------------------------------------- */

function wireSnipHarness() {
  const document = makeDoc();
  // FakeElement models children and attributes, not classes-as-a-list or scrolling; these renders
  // toggle a modal class and scroll the active badge into view. Stubbed here rather than in
  // _fake-dom.mjs so nothing else that shares that fake changes shape.
  const augment = (el) => Object.assign(el, {
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    scrollIntoView() {},
  });
  const rawById = document.getElementById;
  document.getElementById = (id) => augment(rawById(id));
  const rawCreate = document.createElement.bind(document);
  document.createElement = (tag) => augment(rawCreate(tag));
  const game = {
    players: [HOSTILE, HOSTILE],
    scores: [0, 0],
    currentPlayerIndex: 0,
    penaltyMode: 'none',
    selectedPenalty: '',
    state: 'MENU',
  };
  const api = loadFrom('wire-snip-panic',
    ['escapeHtml', 'avatarFor', 'renderSetupPlayerList', 'renderHUDPlayerStrip', 'showDetonationModal'], {
      document,
      game,
      // `const GameState = Object.freeze({...})` does not brace-slice; a key-echoing proxy is the
      // same object for every branch these renders take on it.
      GameState: new Proxy({}, { get: (_t, k) => k }),
      // The route's two imports, passed through real (see the header note). avatarFor and the
      // renders are SLICED, so the route's own lookup and its own escaping execute -- only what
      // crosses a module boundary is injected here.
      MASCOTS,
      loserOf,
      spawnConfetti: () => {},
      // renderSetupPlayerList and showDetonationModal now arm the ghost-tap gate on the container
      // they just rebuilt (ADR-0017). Stubbed like every other collaborator above, and for the same
      // reason as the short-stick harness: this test measures escaping, and armAllButtons writes no
      // markup. Without the stub the sliced renders throw before the assertions run.
      armAllButtons: () => {},
      // gh#184 ends renderHUDPlayerStrip with the shared `+N` seat counter from
      // ../_strip-overflow.ts. Stubbed for the same reason as in the short-stick harness above: it
      // crosses a module boundary, and its ONLY text write is `counter.textContent = "+" + hidden`,
      // a number computed from client rects and never a roster value — so it is not an escape sink.
      // ./strip-overflow-counter.test.mjs holds the digits-only assertion that licenses this stub.
      mountStripOverflowCounter: () => {},
    }, ['escapeHtml']);
  return { api, document };
}

test('wire-snip-panic: setup input, HUD strip and round-end scoreboard escape roster names', () => {
  const { api, document } = wireSnipHarness();

  api.renderSetupPlayerList();
  const list = document.getElementById('player-list-container');
  assertNoInjection(list, 'wire-snip-panic renderSetupPlayerList');
  assertAttributeIntact(list, '.player-input', 'wire-snip-panic renderSetupPlayerList');

  api.renderHUDPlayerStrip();
  assertNoInjection(document.getElementById('hud-player-strip'), 'wire-snip-panic renderHUDPlayerStrip');

  api.showDetonationModal();
  assertNoInjection(document.getElementById('scoreboard-container'), 'wire-snip-panic showDetonationModal');
  DEEP.add('wire-snip-panic');
});

/* ---- zero-trigger ---------------------------------------------------------------------------- */

function zeroTriggerHarness() {
  const document = makeDoc();
  // renderPlayerRoster ends with a penalty-button sync over document.querySelectorAll; the fake
  // document declares none (see makeDocument), so this closes the same gap wireSnipHarness's
  // `augment` closes for classList.
  document.querySelectorAll = () => [];
  const api = loadFrom('zero-trigger', ['escapeHtml', 'GameEngine'], {
    document,
    // AVATAR_LIST, defaultPlayerName and PRESET_PENALTIES are module-level `const`s that GameEngine's
    // constructor reads to seed its default roster. The sinks under test are driven without ever
    // constructing GameEngine (see the header note on why AVATAR_LIST cannot be sliced: brace-matching
    // from its first `{` runs forward into the next declaration), so these are slice-safe stand-ins,
    // not real cast data.
    AVATAR_LIST: ['a', 'b'],
    defaultPlayerName: (index) => `seat-${index}`,
    PRESET_PENALTIES: ['penalty'],
    armAllButtons: () => {},
    mountStripOverflowCounter: () => {},
  }, ['escapeHtml']);
  return { api, document };
}

test('zero-trigger: roster, active turn, live region, strip and defeat modal escape roster names', () => {
  const { api, document } = zeroTriggerHarness();

  // Bounds the sink set this test can see: `name` is a getter, not a plain field, so any sink that
  // reaches a roster name -- however aliased (`const n = player.name` defeats a source grep, never
  // a live read) -- bumps this counter. The total is asserted after every method below has run.
  // Residual ceiling: a one-for-one swap (one sink deleted, one new sink added) leaves this count
  // unchanged and would pass unnoticed -- this bounds the READ COUNT of a set this test owns, not
  // completeness of the sink inventory itself.
  let reads = 0;
  const hostilePlayer = (id, avatar) => ({
    id,
    avatar,
    score: 0,
    get name() { reads += 1; return HOSTILE; },
  });

  // 1. Setup screen: renderPlayerRoster's attribute-context sink (a chip strip too, per ADR-0054's
  // shared roster shape, but this is the route's own setup rows).
  const rosterCtx = { state: { players: [hostilePlayer(1, 'a'), hostilePlayer(2, 'b')] } };
  api.GameEngine.prototype.renderPlayerRoster.call(rosterCtx);
  const rosterContainer = document.getElementById('player-roster-container');
  // Attribute check first: a dropped escapeHtml here truncates the value AND spills an `<a>` into
  // the DOM in the same mutation, so ordering this ahead of assertNoInjection is what makes the
  // truncation itself (not just the spilled element) a named, reproduced failure.
  assertAttributeIntact(rosterContainer, '.player-name-input', 'zero-trigger renderPlayerRoster');
  assertNoInjection(rosterContainer, 'zero-trigger renderPlayerRoster');

  // 2. Active-turn screen: prepareTurn writes the lock-status (innerHTML) and active-name
  // (textContent) sinks directly, then calls renderPlayerStrip (innerHTML) and announceTurn
  // (textContent) itself -- the real methods, reached off the real prototype and bound so `this`
  // inside each stays the same hand-built context (GameEngine is never constructed: its constructor
  // builds a sound synth, an effects engine and a canvas).
  const turnCtx = {
    state: {
      tier: 1,
      roundNumber: 1,
      cycleCount: 1,
      turnIndex: 0,
      forbiddenDigit: 7,
      players: [hostilePlayer(1, 'a'), hostilePlayer(2, 'b')],
      timer: { isRunning: false, isLocked: false, elapsedMs: 0 },
    },
  };
  turnCtx.renderPlayerStrip = api.GameEngine.prototype.renderPlayerStrip.bind(turnCtx);
  turnCtx.announceTurn = api.GameEngine.prototype.announceTurn.bind(turnCtx);
  turnCtx.getDisplayPlaceholder = api.GameEngine.prototype.getDisplayPlaceholder.bind(turnCtx);
  api.GameEngine.prototype.prepareTurn.call(turnCtx);

  assertNoInjection(document.getElementById('lock-status-text'), 'zero-trigger prepareTurn lock-status');
  assertNoInjection(document.getElementById('game-active-name'), 'zero-trigger prepareTurn active-name');
  assertNoInjection(document.getElementById('zt-live'), 'zero-trigger announceTurn live-region');
  assertNoInjection(document.getElementById('game-player-strip'), 'zero-trigger renderPlayerStrip');

  // 3. Defeat modal: showDefeatModal's textContent sink for the loser's name.
  const defeatCtx = { state: { penaltyMode: 'none' }, openModal: () => {} };
  api.GameEngine.prototype.showDefeatModal.call(defeatCtx, hostilePlayer(3, 'c'), '00.0', 7);
  assertNoInjection(document.getElementById('modal-loser-name'), 'zero-trigger showDefeatModal');

  // Every sink above read a roster name once per player it touched: 2 in renderPlayerRoster, 1 each
  // in prepareTurn's own lock-status/active-name writes, 2 in renderPlayerStrip (one per player),
  // 1 in announceTurn, 1 in showDefeatModal -- 8 total on today's source.
  assert.equal(reads, 8, `zero-trigger read player.name ${reads} time(s) -- the sink set changed`);

  DEEP.add('zero-trigger');
});

/* ---- croc-bite ------------------------------------------------------------------------------- */

// This route reaches tier 2 as NO_HTML_SINK, and that class is exactly why it needs a tier-1 harness:
// tier 2 can only say the source performs no HTML-sink write, which is a statement about SPELLING. It
// cannot say the sinks that DO carry a name are safe, and on this route there are six of them.
//
// The route's own escaping is STRUCTURAL rather than a helper: every sink was rebuilt with
// createElement and textContent, so a name is never composed into markup at all. The engine's own
// sanitizePlayerName escapes nothing (it trims and cuts to 16 characters, and 16 characters of markup
// is still markup) — so the structure is the whole guarantee, and this is what proves it holds.
//
// The names are handed in on the PLAYER OBJECTS rather than typed through updatePlayerName, for one
// reason: the 16-character cut would truncate HOSTILE, and a truncated payload measures the cut
// instead of the escaping. An input where right and wrong agree measures nothing.
function crocBiteHarness(players) {
  const document = makeDoc();
  // FakeElement models children, text and attributes -- not classes-as-a-list, not `style` as a live
  // object, and not `append` with a mixed node/text list. All three are what these renders use.
  // Augmented here rather than in _fake-dom.mjs so nothing else that shares that fake changes shape.
  const augment = (el) => Object.assign(el, {
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    style: { setProperty() {}, width: '' },
    append(...kids) { el.children.push(...kids); },
  });
  const rawById = document.getElementById;
  document.getElementById = (id) => augment(rawById(id));
  const rawCreate = document.createElement.bind(document);
  document.createElement = (tag) => augment(rawCreate(tag));
  // The engine appends bare text nodes between the pieces of a score row; FakeElement has no
  // equivalent and needs none -- renderedText reads `textContent` off whatever is in `children`.
  // `tagName` is not decoration: the fake's selector walker reads it off every node it passes, so a
  // text node without one crashes querySelectorAll rather than being skipped.
  document.createTextNode = (text) => ({ tagName: '#text', textContent: String(text), children: [], _attrs: {} });

  const api = loadFrom('croc-bite', ['UIManager'], {
    document,
    // `const PHASES = Object.keys`-free object literal, read only by updateUI, which these sinks do
    // not reach. A key-echoing proxy is the same object for every branch.
    PHASES: new Proxy({}, { get: (_t, k) => k }),
    // No real timer is ever created: showToast schedules the toast's own withdrawal, and a test that
    // left an 800ms timer behind would outlive itself.
    setTimeout: () => 0,
    clearTimeout: () => {},
  });

  const el = (id) => document.getElementById(id);
  const ctx = {
    audio: { playHeartbeat() {} },
    state: {
      players,
      getPlayerScore: () => 0,
      getLiveBiteOdds: () => ({ fraction: '1', percent: 6.3, isCritical: false }),
      getCurrentPlayer: () => players[0],
    },
    elSetupMascots: el('setup-mascots-list'),
    elPlayerStrip: el('hud-player-strip'),
    elTurnAvatar: el('turn-avatar'),
    elTurnPlayerName: el('turn-player-name'),
    elTurnBanner: el('hud-turn-banner'),
    elTensionPill: el('hud-tension-pill'),
    elTensionFill: el('tension-fill-bar'),
    elTensionOddsText: el('tension-odds-text'),
    elHudRoundLabel: el('hud-round-label'),
    elAnnouncer: el('aria-announcer'),
    elToast: el('hud-toast'),
    elResultEmoji: el('result-emoji'),
    elResultTitle: el('result-title'),
    elResultDesc: el('result-desc'),
    elResultScoreboard: el('result-scoreboard'),
    elBtnResultNextText: el('btn-result-next-text'),
  };
  // The methods these renders call on themselves, bound so `this` inside each stays the same
  // hand-built context. UIManager is never constructed: its constructor caches three dozen elements
  // and binds every control on the page.
  for (const method of ['renderPlayerStrip', 'updateTurnDisplay', 'showToast', 'announce']) {
    ctx[method] = api.UIManager.prototype[method].bind(ctx);
  }
  return { api, ctx, document };
}

/** Some node under `root` holds the WHOLE hostile name as its own text.
 *
 *  This is the positive half of the claim, and it is what separates a raw sink from a broken
 *  instrument. On a textContent sink the payload lands intact as text and this is true. On an
 *  innerHTML sink the same write lands as parsed markup: the container's own text is empty and the
 *  name is gone from the tree as a string -- measured by planting exactly that edit, where
 *  assertNoInjection reported "the hostile name never rendered", which reads like a harness fault
 *  rather than the injection it is. */
function assertRenderedAsText(root, label) {
  // `includes`, not equality: four of these sinks compose the name into a sentence the player reads
  // ("ตาของ <name>"), so the name is a substring of the node's text and never the whole of it. What
  // still discriminates is that the WHOLE payload survives in ONE node's own text — parsed markup
  // splits it across nodes and leaves no single node holding it.
  const holds = (node) => String(node.textContent ?? '').includes(HOSTILE) || (node.children || []).some(holds);
  assert.ok(
    holds(root),
    `${label}: no node carries the player name as its own text — the name was written through a ` +
      'markup sink and parsed away, which is the injection this file exists to catch',
  );
}

test('croc-bite: setup rows, HUD strip, turn banner, toast, live region and scoreboard escape roster names', () => {
  // Bounds the sink set this test can see: `name` is a getter, not a plain field, so any sink that
  // reaches a roster name -- however aliased (`const n = p.name` defeats a source grep, never a live
  // read) -- bumps this counter. Residual ceiling: a one-for-one swap (one sink deleted, one added)
  // leaves the count unchanged; this bounds the READ COUNT of a set this test owns, not completeness
  // of the sink inventory.
  let reads = 0;
  const hostile = (id) => ({
    id,
    emoji: '*',
    sleeveColor: '#000',
    rawName: HOSTILE,
    get name() { reads += 1; return HOSTILE; },
  });
  const players = [hostile('player_0'), hostile('player_1')];
  const { api, ctx, document } = crocBiteHarness(players);

  // 1. Setup screen. The name reaches the field as a PROPERTY, never as an attribute in markup, so
  // the assertion is the whole payload surviving intact in both places a row carries it -- a value
  // composed into a tag would have been terminated at the payload's leading quote.
  api.UIManager.prototype.renderMascotInputs.call(ctx);
  const rows = document.getElementById('setup-mascots-list').children;
  assert.equal(rows.length, players.length, 'croc-bite renderMascotInputs built no rows — this check is measuring nothing');
  for (const row of rows) {
    const input = row.children.find((c) => c.className === 'mascot-name-input');
    assert.ok(input, 'croc-bite renderMascotInputs: the row no longer builds a name field');
    assert.equal(input.value, HOSTILE, 'croc-bite renderMascotInputs: the typed name was altered or terminated in the field');
    assert.equal(input.placeholder, HOSTILE, 'croc-bite renderMascotInputs: the name was altered or terminated in the placeholder');
    assert.equal(input.children.length, 0, 'croc-bite renderMascotInputs: a name introduced child nodes into a field');
  }
  assert.equal(document.getElementById('setup-mascots-list').querySelectorAll('a').length, 0,
    'croc-bite renderMascotInputs: a player name introduced an <a> element into the DOM');

  // 2. HUD: the seat strip, the turn banner, the toast and the live region -- handleTurnTransition
  // drives all four through the real methods.
  api.UIManager.prototype.handleTurnTransition.call(ctx, hostile('player_0'), null);
  assertRenderedAsText(document.getElementById('hud-player-strip'), 'croc-bite renderPlayerStrip');
  assertNoInjection(document.getElementById('hud-player-strip'), 'croc-bite renderPlayerStrip');
  assertRenderedAsText(document.getElementById('turn-player-name'), 'croc-bite updateTurnDisplay');
  assertNoInjection(document.getElementById('turn-player-name'), 'croc-bite updateTurnDisplay');
  assertRenderedAsText(document.getElementById('hud-toast'), 'croc-bite showToast');
  assertNoInjection(document.getElementById('hud-toast'), 'croc-bite showToast');
  assertRenderedAsText(document.getElementById('aria-announcer'), 'croc-bite announce');
  assertNoInjection(document.getElementById('aria-announcer'), 'croc-bite announce');

  // 3. The result card and its scoreboard, which is the reveal that lands under the finger.
  api.UIManager.prototype.handleGameResult.call(ctx, {
    loser: players[0],
    currentRound: 1,
    maxRounds: 5,
    isMatchComplete: false,
    matchWinner: null,
    scores: players.map((player) => ({ player, score: 0 })),
  });
  assertRenderedAsText(document.getElementById('result-title'), 'croc-bite handleGameResult title');
  assertNoInjection(document.getElementById('result-title'), 'croc-bite handleGameResult title');
  assertRenderedAsText(document.getElementById('result-scoreboard'), 'croc-bite handleGameResult scoreboard');
  assertNoInjection(document.getElementById('result-scoreboard'), 'croc-bite handleGameResult scoreboard');
  assertNoInjection(document.getElementById('aria-announcer'), 'croc-bite handleGameResult announce');

  // Every sink above read a roster name: 2 placeholders in renderMascotInputs, 2 in renderPlayerStrip
  // (one per seat), 1 in updateTurnDisplay, 1 in the toast, 1 in the turn announcement, 1 for the
  // loser's name in handleGameResult, and 2 more in the scoreboard rows -- 10 on today's source.
  assert.equal(reads, 10, `croc-bite read player.name ${reads} time(s) — the sink set changed`);

  DEEP.add('croc-bite');
});

/* ---- tier 2: every route the manifest ships --------------------------------------------------- */

const repoRoot = path.join(here, '..', '..');

/** Scans the template literal whose opening backtick is at `start`. Returns its end index and every
 *  `${...}` hole in it, at any nesting depth — a template nested inside a hole lands in the same
 *  markup, so its holes are sink holes too. Handles escapes, nested braces and quoted strings, so a
 *  `}` inside a string never closes a hole early. */
function scanTemplate(src, start) {
  const holes = [];
  let i = start + 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') return { end: i, holes };
    if (c === '$' && src[i + 1] === '{') {
      let depth = 1;
      let j = i + 2;
      while (j < src.length && depth > 0) {
        const d = src[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '`') { const inner = scanTemplate(src, j); holes.push(...inner.holes); j = inner.end + 1; continue; }
        if (d === '{') depth += 1;
        else if (d === '}') { depth -= 1; if (depth === 0) break; }
        else if (d === "'" || d === '"') {
          const q = d;
          j += 1;
          while (j < src.length && src[j] !== q) { if (src[j] === '\\') j += 1; j += 1; }
        }
        j += 1;
      }
      holes.push({ expr: src.slice(i + 2, j), idx: i });
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return { end: src.length, holes };
}

const SINK_WRITE = /\.(?:innerHTML|outerHTML)\s*\+?=\s*|\.insertAdjacentHTML\s*\([^,]*,\s*|document\.write\s*\(\s*/g;
const SINK_TOKEN = /innerHTML|outerHTML|insertAdjacentHTML|document\.write/;

/** Entity a working escape helper must emit for each character it has to neutralise. */
const ENTITY = {
  '&': /&amp;/,
  '<': /&lt;/,
  '>': /&gt;/,
  '"': /&quot;/,
  "'": /&#0?39;|&#x27;|&apos;/,
};

/** Every module a route contributes, not just the first one found: `main.js` is the mockup
 *  extract-mockup.mjs owns and overwrites, `main.ts` is where hand-added, repo-side code lives (see
 *  one-bomb's name-entry module). A route can ship either or both — a first-match `.find()` here
 *  silently drops a route's own hand-written module from every check below it. */
function resolveModules(id) {
  return ['main.js', 'main.ts'].map((f) => path.join(here, id, f)).filter((f) => fs.existsSync(f));
}

function auditFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(repoRoot, file);

  const templates = [];
  const holes = [];
  SINK_WRITE.lastIndex = 0;
  let m;
  while ((m = SINK_WRITE.exec(src))) {
    let k = m.index + m[0].length;
    while (k < src.length && /\s/.test(src[k])) k += 1;
    if (src[k] !== '`') continue; // a variable or a string constant, not a template this can read
    const t = scanTemplate(src, k);
    templates.push(src.slice(k, t.end + 1));
    holes.push(...t.holes);
    SINK_WRITE.lastIndex = t.end;
  }

  // Whole-line comments are dropped before the token test, and only those: dice-loser's module header
  // says "NAMES NEVER TOUCH innerHTML", and matching that sentence would demote the very route whose
  // safety it documents. Stripping only comments that START a line can never eat code — a `//` inside
  // a URL or a regex is mid-line — so this cannot hide a real sink.
  const codeOnly = src.replace(/^\s*\/\/.*$/gm, '');
  if (!holes.length && !SINK_TOKEN.test(codeOnly)) return { klass: 'NO_HTML_SINK' };
  if (!holes.length) {
    // An HTML sink exists but nothing interpolates into it — no name can reach markup through a
    // template here. Still not NO_HTML_SINK: say so rather than silently widening that class.
    return { klass: 'NO_INTERPOLATED_SINK' };
  }

  // The charset is derived from the contexts this route actually builds, not assumed: `&<>` always,
  // `"` because every route here quotes attributes with it, and `'` only once some sink template
  // opens a single-quoted attribute around a hole. A route that starts using `'` attributes reds
  // until its helper covers `'` — the requirement widens by itself.
  const singleQuoted = templates.some((t) => /=\s*'[^'\n]*\$\{/.test(t));
  const required = ['&', '<', '>', '"', ...(singleQuoted ? ["'"] : [])];

  // Callable declarations only. `const X = [...]` is deliberately excluded: sliceDecl brace-matches
  // from the first `{` AFTER the declaration, so an array constant slices forward into whatever
  // function follows it and inherits that function's entities — measured, `AVATAR_LIST` was reported
  // as an escape helper in zero-trigger. A phantom helper that a sink hole happens to call by the
  // same name would green a route that escapes nothing.
  const declared = new Set();
  for (const d of src.matchAll(/function\s+(\w+)\s*\(|(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|\w+\s*=>)/g)) declared.add(d[1] || d[2]);
  const helpers = [...declared].filter((name) => {
    const body = sliceDecl(src, name);
    return body !== null && required.every((ch) => ENTITY[ch].test(body));
  });
  if (!helpers.length) {
    return { verdict: `${rel}: builds markup by string but declares no escape helper covering ${required.join(' ')} — a roster name reaching any of its ${holes.length} sink interpolation(s) is injected raw` };
  }
  const used = helpers.filter((h) => holes.some((hole) => new RegExp(`\\b${h}\\s*\\(`).test(hole.expr)));
  if (!used.length) {
    return { verdict: `${rel}: declares escape helper(s) ${helpers.join(', ')} but never calls one inside a markup template — an unused helper escapes nothing` };
  }
  return { klass: `ESCAPED(${used.join(',')}${singleQuoted ? " incl '" : ''})` };
}

/** Caller of auditFile, iterating every module resolveModules found for the route: a route is clean
 *  only when EVERY one of its modules is, and the first module with a verdict names the route bad —
 *  a single-module route (today, every route but one-bomb) gets exactly the same result as before
 *  this function existed, because the loop below runs once. */
function auditRoute(id) {
  const files = resolveModules(id);
  if (!files.length) return { id, verdict: `no src/play/${id}/main.{js,ts} — the manifest ships a play route with no module here` };
  const perFile = files.map(auditFile);
  const bad = perFile.find((r) => r.verdict);
  if (bad) return { id, verdict: bad.verdict };
  return { id, klass: perFile.length === 1 ? perFile[0].klass : perFile.map((r) => r.klass).join(' + ') };
}

test('coverage: every play route in the manifest is either injection-tested or provably escaping', async () => {
  // Derived, not listed — the same dynamic-import idiom scripts/play-exit-guard-probe.mjs uses.
  const { games } = await import(`${pathToFileURL(path.join(repoRoot, 'src/games/manifest.ts')).href}`);
  const routes = games.filter((g) => g.playRoute).map((g) => g.id).sort();
  assert.ok(routes.length > 0,
    'no play routes derived from src/games/manifest.ts — refusing to report a vacuous pass on an empty work set');

  const results = routes.map(auditRoute);
  const bad = results.filter((r) => r.verdict);
  assert.equal(bad.length, 0, `player-name escaping is unproven on ${bad.length} route(s):\n  ${bad.map((r) => `${r.id}: ${r.verdict}`).join('\n  ')}`);

  for (const id of DEEP) {
    assert.ok(routes.includes(id), `${id} has a behavioural harness here but is no longer a play route in the manifest — this test is measuring a dead route`);
  }
  assert.ok(DEEP.size > 0, 'no route was behaviourally injection-tested — tier 1 measured nothing');
  console.log(`name-escaping: ${routes.length} play route(s) derived, ${DEEP.size} behaviourally injection-tested (${[...DEEP].sort().join(', ')}), ${results.filter((r) => r.klass === 'NO_HTML_SINK').length} with no HTML sink`);
});
