// node --test src/games/cursed-number.test.mjs — no framework, no dependency.
// Pins the losing rule the whole game turns on. Every assertion here is DOM-free: the rule is pure
// and the play route (src/play/cursed-number/main.js) imports this same class, so there is exactly
// one implementation of "who loses" on the site.
//
// These cases descend from the mockup's own in-page runDeterministicTestSuite(), which was deleted
// rather than shipped to players — see the note at its old site in main.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import game, {
  CursedNumberGameModel,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MIN_RANGE,
  MAX_RANGE,
  seatColorVar,
} from './cursed-number.ts';

// A stand-in cast, declared HERE on purpose. gh#140 keeps the shared animal list out of every file
// under src/games, this one included, and the engine is supposed to work with whatever labels its
// caller hands it — so a fixture of three is a better test of that contract than the real twenty
// would be. Which list the site actually injects is the play side's business.
const SEATS = [
  { emoji: '\u{1F996}', name: 'ก' },
  { emoji: '\u{1F419}', name: 'ข' },
  { emoji: '\u{1F988}', name: 'ค' },
];

/** A model whose cursed number is fixed, so every case below is deterministic.
 *  A SEQUENCE, not a predicate on the arguments: startNewGame() draws twice — the cursed number from
 *  [0, 100] and then the starting seat from [0, n-1] — and both calls arrive with a min of 0, so any
 *  rule keyed on the arguments would answer the same value to both. */
function fixed(cursed, players = 4) {
  const m = new CursedNumberGameModel(SEATS);
  m.setPlayerCount(players);
  let draw = 0;
  m.setCustomRandom(() => (draw++ === 0 ? cursed : 0));
  m.startNewGame();
  assert.equal(m.cursedNumber, cursed, 'the injected source must decide the cursed number');
  assert.equal(m.startingPlayerIndex, 0, 'the second draw picks the starting seat; pinned to 0 here');
  return m;
}

test('a guess equal to the cursed number loses on the spot', () => {
  const m = fixed(63);
  const who = m.getActivePlayer();
  const out = m.resolveGuess(63);
  assert.equal(out.valid, true);
  assert.equal(out.result, 'LOSE');
  assert.equal(out.loser.id, who.id);
  assert.equal(m.loserPlayer.id, who.id);
});

test('a safe guess narrows the range and reports which side the cursed number is on', () => {
  const m = fixed(63);
  const high = m.resolveGuess(80);
  assert.equal(high.result, 'SAFE');
  assert.equal(high.direction, 'LOWER');
  assert.deepEqual([m.min, m.max], [0, 79]);

  m.advanceTurn();
  const low = m.resolveGuess(30);
  assert.equal(low.result, 'SAFE');
  assert.equal(low.direction, 'HIGHER');
  assert.deepEqual([m.min, m.max], [31, 79]);
});

// THE DIVERGENT INPUT, named: a safe guess exactly ONE away from the cursed number, taken at a range
// that is two numbers wide — run from BOTH sides, because each side is a separate line of the rule.
// It is the input that separates the shipped rule from the plausible wrong one. The rule moves the
// surviving bound PAST the guess (`min = guess + 1` above, `max = guess - 1` below); an off-by-one
// that moved a bound TO the guess leaves the range still two wide, reports isCollapsedToOne false,
// and the next player is handed a choice instead of the forced loss. A guess further away agrees
// under both versions and would measure nothing — and one side alone measures only one of the two
// lines: mutating `min = guess + 1` leaves the guess-from-above case green, which is how the first
// draft of this test passed a mutant it was written to kill.
for (const leg of [
  { name: 'from above', min: 63, max: 64, guess: 64, direction: 'LOWER' },
  { name: 'from below', min: 62, max: 63, guess: 62, direction: 'HIGHER' },
]) {
  test(`one away ${leg.name} collapses to a single number and the NEXT player loses`, () => {
    const m = fixed(63);
    m.min = leg.min;
    m.max = leg.max;

    const out = m.resolveGuess(leg.guess);
    assert.equal(out.result, 'SAFE');
    assert.equal(out.direction, leg.direction);
    assert.equal(out.isCollapsedToOne, true, 'the bound moves PAST the guess, not to it');
    assert.deepEqual([m.min, m.max], [63, 63]);

    const survivor = m.getActivePlayer();
    const next = m.advanceTurn();
    assert.notEqual(next.id, survivor.id, 'the phone moves on before the forced reveal');

    const forced = m.resolveForcedReveal();
    assert.equal(forced.result, 'LOSE');
    assert.equal(forced.loser.id, next.id, 'the player who inherits the single number is the loser');
    assert.equal(forced.guess, 63);
    assert.equal(m.history.at(-1).direction, 'FORCED_LOSE');
  });
}

test('both ends of the range are reachable and collapse the same way', () => {
  const low = fixed(MIN_RANGE);
  const atLow = low.resolveGuess(1);
  assert.equal(atLow.direction, 'LOWER');
  assert.deepEqual([low.min, low.max], [MIN_RANGE, MIN_RANGE]);

  const high = fixed(MAX_RANGE);
  const atHigh = high.resolveGuess(MAX_RANGE - 1);
  assert.equal(atHigh.direction, 'HIGHER');
  assert.deepEqual([high.min, high.max], [MAX_RANGE, MAX_RANGE]);
});

test('a guess outside the surviving range, a non-integer, and a second submit all change nothing', () => {
  const m = fixed(50);
  m.min = 20;
  m.max = 80;
  for (const bad of [19, 81, 4.5, Number.NaN]) {
    const out = m.resolveGuess(bad);
    assert.equal(out.valid, false, `rejected: ${String(bad)}`);
    assert.deepEqual([m.min, m.max], [20, 80]);
    assert.equal(m.history.length, 0);
  }
  assert.equal(m.resolveGuess(30).result, 'SAFE');
  // The double-tap guard: a second submit before advanceTurn is BUSY, not a second turn.
  assert.deepEqual(m.resolveGuess(40), { valid: false, error: 'BUSY' });
  assert.equal(m.history.length, 1);
});

test('the turn cursor wraps and re-centres the selection on the surviving range', () => {
  const m = fixed(63, 3);
  m.resolveGuess(80);
  m.advanceTurn();
  assert.equal(m.selectedNumber, 39, 'midpoint of [0, 79]');
  m.resolveGuess(30);
  m.advanceTurn();
  assert.equal(m.selectedNumber, 55, 'midpoint of [31, 79]');
  assert.equal(m.activePlayerIndex, 2);
  m.resolveGuess(40);
  m.advanceTurn();
  assert.equal(m.activePlayerIndex, 0, 'three seats, so the fourth turn is the first player again');
});

// The reconciliation gh#161 asks for, from this side of the boundary: the engine holds NO list of
// its own and seats whatever it was handed, in the order it was handed. A game that shipped a cast
// of its own would pass every other test in this file.
test('the seats are the supplied list, in the supplied order, wrapping past its end', () => {
  const m = new CursedNumberGameModel(SEATS);
  m.setPlayerCount(5);
  assert.deepEqual(
    m.players.map((p) => [p.avatar, p.defaultName]),
    [...SEATS, SEATS[0], SEATS[1]].map((seat) => [seat.emoji, seat.name]),
  );
});

// The no-caller case: numbered labels, no icons. Not a second cast — that is the whole point.
test('with no list supplied the seats are numbered and carry no character', () => {
  const m = new CursedNumberGameModel();
  m.setPlayerCount(3);
  assert.deepEqual(
    m.players.map((p) => p.defaultName),
    ['ผู้เล่น 1', 'ผู้เล่น 2', 'ผู้เล่น 3'],
  );
  assert.deepEqual(new Set(m.players.map((p) => p.avatar)), new Set(['']));
});

test('the count clamps to this game s own range', () => {
  const m = new CursedNumberGameModel(SEATS);
  m.setPlayerCount(999);
  assert.equal(m.players.length, MAX_PLAYERS, 'a longer roster seats only the ceiling');
  m.setPlayerCount(0);
  assert.equal(m.players.length, MIN_PLAYERS);
});

test('a typed name survives a resize, and clearing it restores the seat default', () => {
  const m = new CursedNumberGameModel(SEATS);
  m.setPlayerCount(6);
  m.updatePlayerName(0, '  ก้อง  ');
  assert.equal(m.players[0].name, 'ก้อง');
  m.setPlayerCount(3);
  assert.equal(m.players[0].name, 'ก้อง', 'shrinking the table keeps what seat 1 typed');
  m.updatePlayerName(0, '   ');
  assert.equal(m.players[0].name, SEATS[0].name, 'a blank field falls back to the supplied seat');
});

// ADR-0048/ADR-0054: colour enters a stylesheet by name. What this pins is that the rule emits a
// REFERENCE and never a value — a hex literal here is the exact drift the rule exists to stop.
test('seat colour is a token reference, never a literal', () => {
  const m = new CursedNumberGameModel(SEATS);
  m.setPlayerCount(MAX_PLAYERS);
  for (const [i, p] of m.players.entries()) {
    assert.equal(p.color, `var(--mascot-${i + 1})`);
    assert.doesNotMatch(p.color, /#[0-9a-fA-F]{3,8}/);
  }
  // Colour is keyed to the SEAT, not to the supplied list: three seats of names still paint twenty
  // distinct rows, because overrides.css declares MAX_PLAYERS tokens.
  assert.equal(seatColorVar(MAX_PLAYERS), 'var(--mascot-1)', 'the reference wraps at the ceiling');
});

test('the manifest entry points at the play route and declares this game s own count', () => {
  assert.equal(game.id, 'cursed-number');
  assert.equal(game.category, 'party');
  assert.equal(game.playRoute, '/game/cursed-number/play/');
  assert.deepEqual(game.players, [MIN_PLAYERS, MAX_PLAYERS]);
});
