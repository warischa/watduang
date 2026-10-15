// gh#196, the invariant this route lost once: a name a player typed survives every way back onto the
// screen that holds it, and reaches the round it was typed for.
//
// The bug it pinned. The route's own names screen built each field with a placeholder and no value,
// and nothing outside the live DOM held the typed text, so both ways back onto it -- back to the
// count screen and forward, and back from the losing-rule screen -- wiped every name.
//
// Since gh#264 (ADR-0071) that screen, its count screen and the route's per-seat store are gone. The
// names live in the shared player screen, mounted into #hcPlayers, and once started in the shared
// roster. So the same invariant is driven here through THAT screen over THIS route's markup.html:
//   1. a count change on the first visit keeps every name still on screen;
//   2. the way back from the losing-rule screen is the shared screen opened again (arm-reveal-paths
//      pins that #btnBackToNames calls it), and it opens pre-filled with the names just played;
//   3. a hostile name round-trips as text, never as markup (ADR-0026);
//   4. the handoff the screen starts seats exactly the names it hands over, in order -- the route's
//      real startWithPlayers run against the route's real GameModel, both sliced out of main.js
//      (a lifted file with no exports).
//
// What gh#196 decided and the shared screen does NOT keep: a seat hidden by lowering the count used
// to lose its name for good. The shared screen keeps the hidden seat's name for when the count comes
// back up -- core behaviour, owned and tested in src/play/_player-screen/, not re-pinned here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mountOnPage, settle } from '../_player-screen/screen-harness.mjs';
import { NAME_MAX } from '../_player-screen/player-screen.ts';
import { MASCOTS, mascotNames } from '../_mascots.ts';
import { sliceBlock } from '../_dom-stub.mjs';
import game, * as rules from '../../games/how-close-is-near.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const MAIN = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

const names = (page) => page.root.querySelectorAll('.ps-n').map((f) => f.value);
const typeInto = (field, value) => {
  field.value = value;
  field.dispatchEvent({ type: 'input' });
};
// Past the arm window, so a click is the player's and not a ghost the gate swallows.
const quiet = () => new Promise((resolve) => setTimeout(resolve, 450));

async function firstVisit() {
  const page = await mountOnPage({ routeMarkup: MARKUP, rootId: 'hcPlayers', range: game.players });
  page.screen.open();
  await settle();
  return page;
}

test('a count change keeps every name still on screen', async () => {
  const page = await firstVisit();
  const typed = ['พี่โต้ง', 'ชิบะ', 'น้องหมวย', 'Bank'];
  page.root.querySelectorAll('.ps-n').forEach((f, i) => typeInto(f, typed[i]));
  page.part('inc').click();
  assert.deepEqual(names(page).slice(0, 4), typed, 'raising the count wiped a name -- gh#196');
  page.part('dec').click();
  page.part('dec').click();
  assert.deepEqual(names(page), typed.slice(0, 3), 'lowering the count wiped a remaining name -- gh#196');
});

test('the way back from the losing-rule screen opens on the names just played', async () => {
  const page = await firstVisit();
  const fields = page.root.querySelectorAll('.ps-n');
  typeInto(fields[0], 'ก');
  typeInto(fields[2], 'ค');
  await quiet();
  page.part('start').click();
  await settle();
  // A seat left untyped plays as its animal, in its own place -- not as a gap the next seat fills.
  const played = ['ก', MASCOTS[1].name, 'ค', MASCOTS[3].name];
  assert.deepEqual(page.calls.started[0].map((p) => p.name), played, 'start stopped handing the typed names on');
  assert.equal(page.root.hidden, true);

  page.screen.open();
  await settle();
  assert.equal(page.root.hidden, false);
  assert.deepEqual(names(page), played, 'the second visit lost the names the round was played with');
  assert.equal(page.root.querySelectorAll('.ps-tick').filter((t) => t.getAttribute('aria-pressed') === 'true').length, 4,
    'every player who just played starts ticked');
});

test('a hostile name round-trips as text and writes no value attribute', async () => {
  // The anatomy of name-escaping.test.mjs's payload: the leading `">` closes any attribute the name
  // lands in, and the anchor is an element in body context. Its anchor text is shortened to one
  // letter so the whole payload fits the roster's name cap (NAME_MAX): a clipped payload would test
  // the cap, not the sink.
  const HOSTILE = 'นัท"><a href="/x">b</a>';
  assert.ok(HOSTILE.length <= NAME_MAX, 'the payload no longer fits the name cap');
  const page = await firstVisit();
  typeInto(page.root.querySelector('.ps-n'), HOSTILE);
  await quiet();
  page.part('start').click();
  await settle();
  page.screen.open();
  await settle();
  const field = page.root.querySelector('.ps-n');
  assert.equal(field.value, HOSTILE, 'the name did not survive as text');
  assert.equal(field.getAttribute('value'), null, 'the name was written into a value= attribute -- a new HTML sink');
  assert.equal(page.root.querySelectorAll('a').length, 0, 'the name introduced an element -- ADR-0026');
});

// --- 4. The handoff, run on the route's own bytes ------------------------------------------------
/** A `const X = Object.freeze({...});` declaration, taken to the end of its own statement: the brace
 *  walk would stop one character before the closing paren. */
function freezeDecl(name) {
  const at = MAIN.indexOf(`const ${name} = Object.freeze(`);
  assert.notEqual(at, -1, `main.js no longer declares ${name} -- this test is measuring nothing`);
  return MAIN.slice(at, MAIN.indexOf('});', at) + 3);
}
const defaultNameAt = MAIN.indexOf('const defaultName = ');
assert.notEqual(defaultNameAt, -1, 'main.js no longer declares defaultName');
const defaultNameDecl = MAIN.slice(defaultNameAt, MAIN.indexOf(';', defaultNameAt) + 1);
const modelDecl = sliceBlock(MAIN, 'class GameModel');
assert.ok(modelDecl, 'main.js no longer declares class GameModel -- this test is measuring nothing');
const handoffDecl = sliceBlock(MAIN, 'function startWithPlayers(players)');
assert.ok(handoffDecl, 'main.js no longer declares the startWithPlayers handoff -- this test is measuring nothing');

/** Runs the real handoff against a fresh real GameModel and returns what it seated. */
function seat(players) {
  const deps = { ...rules, mascotNames };
  const keys = Object.keys(deps).filter((k) => k !== 'default');
  let renders = 0;
  const run = new Function(
    ...keys, 'render',
    `${freezeDecl('GameState')}\n${freezeDecl('LoseCondition')}\n${defaultNameDecl}\n${modelDecl}\n` +
      `const game = new GameModel();\n${handoffDecl}\nreturn (players) => { startWithPlayers(players); return { game, GameState }; };`,
  )(...keys.map((k) => deps[k]), () => { renders += 1; });
  return { ...run(players), renders: () => renders };
}

test('the handoff seats exactly the players it is handed, in order, then shows the losing rule', () => {
  // Mascots 0, 2 and 5: the second and fourth to fifth roster seats sat out, so a seat's index and
  // its mascot differ -- a positional default would put the wrong animal name on seat 1.
  const players = [0, 2, 5].map((m) => ({ name: MASCOTS[m].name, emoji: MASCOTS[m].emoji, mascot: m }));
  players[0].name = 'พี่โต้ง';
  const { game: model, GameState, renders } = seat(players);
  assert.deepEqual(model.players.map((p) => p.name), ['พี่โต้ง', MASCOTS[2].name, MASCOTS[5].name]);
  assert.deepEqual(model.players.map((p) => p.originalOrder), [0, 1, 2]);
  assert.equal(new Set(model.players.map((p) => p.id)).size, 3, 'two seats share an id -- picks would collide');
  assert.equal(model.playerCount, 3);
  assert.equal(model.state, GameState.LOSE_CONDITION, 'the game\'s own option comes next (ADR-0071 ruling 1)');
  assert.equal(renders(), 1);
});

test('the handoff seats every count the manifest admits', () => {
  for (let n = game.players[0]; n <= game.players[1]; n += 1) {
    const players = Array.from({ length: n }, (_, i) => ({ name: `p${i}`, emoji: MASCOTS[i].emoji, mascot: i }));
    assert.deepEqual(seat(players).game.players.map((p) => p.name), players.map((p) => p.name), `${n} players`);
  }
});
