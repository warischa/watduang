// Player names are typed by players, persisted, and re-read — they are untrusted text on every play
// route. This file pins ONE invariant across the three routes that build markup by string:
//
//   a roster name can never introduce an element, and can never terminate the attribute it sits in.
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
import { fileURLToPath } from 'node:url';
import { FakeElement, makeDocument } from '../games/_fake-dom.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

// Thai, because a real roster name is Thai — a pure-ASCII payload would not prove the escape
// survives the characters this product actually carries. `boom` is the marker the assertions look
// for: escaped it survives as text inside the attribute, unescaped it lands outside it.
const HOSTILE = 'นัท"><a href="/x">boom</a>';

/** Slices a top-level `function name(...)` or `const name = ...` out of main.js by matching braces
 *  from the first `{` of its body. Returns null when the declaration is absent. */
function sliceDecl(source, name) {
  for (const decl of [`function ${name}(`, `const ${name} = `, `let ${name} = `]) {
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
    sounds: noopProxy(),
    saveDraft: () => {},
    handleDrawStick: () => {},
    lockFairCounts: () => {},
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
});
