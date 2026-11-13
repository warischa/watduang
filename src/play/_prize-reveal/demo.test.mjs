// The prize-draw games' own pages (gh#305-gh#307): the demo's fixtures are real committed outcomes, fixed
// across loads, and its controller plays them through the host and stores nothing.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { COPY, DEMO_HEADS, DEMO_MODES, demoNames, demoRun } from './demo.ts';
import { ladderConsistent } from '../../prize-event/game-contract.ts';
import { proposeSchedule } from '../../prize-draw/schedule.ts';
import { satisfies } from '../../prize-draw/cards.ts';
import { phoneCard } from '../../prize-draw/cards.ts';
import { allArmed, mountFake } from './demo-harness.mjs';

const SCHEDULE = proposeSchedule(DEMO_HEADS);

test('every game and mode yields committed outcomes of that game, from the event walk', () => {
  for (const [game, modes] of Object.entries(DEMO_MODES)) {
    for (const mode of modes) {
      const { start, steps } = demoRun(game, mode);
      assert.equal(start.setup.people.length, DEMO_HEADS, `${game} ${mode}: the room is not ${DEMO_HEADS} people`);
      assert.ok(steps.length > 0, `${game} ${mode}: no step to play`);
      for (const step of steps) assert.equal(step.outcome.game, game, `${game} ${mode}: a step of another game`);
      const last = steps.at(-1).outcome;
      if (mode === 'round') {
        assert.equal(last.kind, 'round');
        assert.equal(last.survivors.length, SCHEDULE[1], `${game}: round 1 kept a count off the schedule`);
        assert.equal(steps.at(-1).people.length, DEMO_HEADS, `${game}: round 1 is not played over the whole room`);
      } else {
        assert.equal(last.kind, 'final');
        assert.equal(steps.at(-1).people.length, 5, `${game}: the final is not five finalists`);
        assert.deepEqual([...last.order].sort(), steps.at(-1).people.map((p) => p.id).sort(), `${game}: the order is not the finalists`);
      }
    }
  }
});

test('the cards demo deals first, then draws a rule over that same deal', () => {
  const { steps } = demoRun('cards', 'round');
  assert.deepEqual(steps.map((s) => s.outcome.kind), ['deal', 'round']);
  const [deal, round] = steps.map((s) => s.outcome);
  // Owner ruling 2026-11-13 (gh#306): cards play only a round that cuts exactly in half.
  assert.equal(deal.deal.cards.length, 2 * round.survivors.length, 'the cards demo round does not cut exactly in half');
  assert.equal(round.code, deal.code, 'the rule was drawn over another deal');
  assert.deepEqual(round.deal, deal.deal);
  const passes = deal.deal.pair[round.rule];
  const kept = deal.deal.cards.filter((c) => satisfies(passes, c.card)).map((c) => c.id);
  assert.deepEqual(round.survivors, kept, 'the survivors are not the cards the drawn rule keeps');
  // Each card is the one the room's phones would derive from the committed code.
  const ev = steps[0].after;
  for (const { id, card } of deal.deal.cards.slice(0, 20)) assert.deepEqual(phoneCard(ev.eventKey, id, 1, deal.code), card);
});

test('the ladder demo commits a consistent ladder, and every prize count from 1 to 5 plays', () => {
  for (let n = 1; n <= 5; n++) {
    const final = demoRun('ladder', 'final', n).steps.at(-1).outcome;
    assert.equal(final.prizes.length, n);
    assert.ok(ladderConsistent(final), `${n} prizes: the order does not follow the committed ladder`);
  }
  assert.equal(demoRun('fireworks', 'final', 9).steps.at(-1).outcome.prizes.length, 5, 'a prize count past 5 must clamp');
});

test('the demo is fixed: a refresh replays the same outcome, and a mode a game cannot play is refused', () => {
  for (const [game, modes] of Object.entries(DEMO_MODES)) {
    for (const mode of modes) assert.deepEqual(demoRun(game, mode).steps.map((s) => [s.key, s.outcome]), demoRun(game, mode).steps.map((s) => [s.key, s.outcome]));
  }
  assert.throws(() => demoRun('cards', 'final'), /no final demo/);
  assert.throws(() => demoRun('ladder', 'round'), /no round demo/);
  assert.equal(new Set(demoNames()).size, DEMO_HEADS, 'the synthetic names repeat');
});

test('the controller plays each step through the host, labelled, and comes back armed on its exit', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const s = mountFake('cards');
    assert.ok(s.bar.textContent.includes(COPY.badge), 'the demo label is missing');
    assert.equal(s.go().textContent, COPY.deal);
    allArmed(s, 'first screen');
    s.go().click();
    assert.equal(s.hosts.started.length, 1, 'the deal did not start a reveal');
    const deal = s.hosts.started[0].options;
    assert.equal(deal.game, 'cards');
    assert.equal(deal.input.outcome.kind, 'deal');
    assert.equal(deal.input.people.length, DEMO_HEADS);
    assert.equal(s.go(), null, 'a control stayed on screen while the reveal plays');
    assert.ok(s.bar.textContent.includes(COPY.badge), 'the label left the screen while the reveal plays');
    s.hosts.started[0].exit();
    assert.equal(s.go().textContent, COPY.reveal);
    allArmed(s, 'after the deal');
    s.go().click();
    assert.equal(s.hosts.started[1].options.input.outcome.kind, 'round');
    s.hosts.started[1].exit();
    assert.equal(s.go().textContent, COPY.replay);
    allArmed(s, 'after the round');
    s.go().click();
    assert.equal(s.go().textContent, COPY.deal, 'the replay did not go back to the start');
    assert.equal(s.hosts.started.length, 2, 'the replay played a step by itself');
  } finally {
    mock.timers.reset();
  }
});

test('fireworks offers both modes; switching mid-reveal disposes it, and its late exit draws nothing', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const s = mountFake('fireworks');
    assert.deepEqual(s.chips().map((b) => b.textContent), [COPY.mode.round, COPY.mode.final]);
    mock.timers.tick(1000);
    s.go().click();
    const first = s.hosts.started[0];
    assert.equal(first.options.input.outcome.kind, 'round');
    // Nothing but the label is on screen while it plays, so a restart can only come after its exit.
    first.exit();
    mock.timers.tick(1000);
    s.chip(COPY.mode.final).click();
    allArmed(s, 'mode switched to the final');
    assert.deepEqual(s.chips().map((b) => b.textContent), [COPY.mode.round, COPY.mode.final, '1', '2', '3', '4', '5']);
    s.chip('5').click();
    mock.timers.tick(1000);
    s.go().click();
    const fin = s.hosts.started[1];
    assert.equal(fin.options.input.outcome.kind, 'final');
    assert.equal(fin.options.input.outcome.prizes.length, 5);
    s.demo.dispose();
    assert.equal(fin.disposed, true, 'dispose left the reveal running');
    assert.equal(s.go(), null, 'a disposed reveal drew its 2D view and controls after the page let it go');
  } finally {
    mock.timers.reset();
  }
});

test('show() is the only un-hide, and every control rebuild goes through it', () => {
  const src = fs
    .readFileSync(path.join(import.meta.dirname, 'demo.ts'), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
  assert.deepEqual([...src.matchAll(/(\w+)\.hidden\s*=\s*false/g)].map((m) => m[1]), ['region']);
  assert.match(src, /const show = \(region: HTMLElement\): void => \{\s*region\.hidden = false;\s*armAllButtons\(region\);\s*\};/);
  // The bar is rebuilt in two places: with the controls (then shown) and with the label alone (no control).
  const rebuilds = [...src.matchAll(/bar\.replaceChildren\(([^)]*\))/g)].map((m) => m[1]);
  assert.deepEqual(rebuilds, ['...parts)', 'badge()']);
  assert.match(src, /bar\.replaceChildren\(\.\.\.parts\);\s*show\(bar\);/);
});
