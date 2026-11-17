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

test('a game with no demo mode refuses both modes, so no demo page can mount a game that is not integrated (none today)', () => {
  for (const game of []) {
    assert.deepEqual(DEMO_MODES[game], [], game);
    for (const mode of ['round', 'final']) assert.throws(() => demoRun(game, mode), /no (round|final) demo/, `${game} ${mode}`);
  }
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

// ---- The demo page's layout (gh#305 PD-305-02, PD-305-03) -------------------------------------------------

const CSS = fs.readFileSync(path.join(import.meta.dirname, 'demo.css'), 'utf8');

/** The body of the `@media <query> { ... }` block, by brace matching, or '' when there is none. */
function mediaBlock(css, query) {
  const at = css.indexOf(`@media ${query} {`);
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  return '';
}
/** The phone rule's query: the exact complement of the wide one (the reveal host's own 2D switch uses it). */
const PHONE_QUERY = 'not all and (min-width: 640px)';

/** The declarations of the first rule whose selector is exactly `selector` in `css`, or ''. */
function ruleBody(css, selector) {
  const esc = selector.replace(/[.[\]()*+?^$|\\]/g, '\\$&');
  return new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
}

test('the bar takes the play band at its right end only when it fits, and the band rule is one more override under min-width 640 (design/Gh314Frames.dc.html 1a B)', () => {
  const wide = mediaBlock(CSS, '(min-width: 640px)');
  assert.ok(wide, 'no min-width: 640px block: the band placement has no breakpoint');
  const bar = ruleBody(wide, ".pr-viewport[data-bar='band'] .pr-bar");
  assert.match(bar, /position:\s*fixed/, 'the bar is not fixed to the screen');
  assert.match(bar, /inset-block-start:\s*2px/, 'the bar is not at the band top the board draws (top 2px)');
  assert.match(bar, /inset-inline-end:\s*24px/, 'the bar is not 24px in from the right end');
  assert.match(bar, /flex-wrap:\s*nowrap/, 'the bar wraps to a second row below the band');
  assert.match(bar, /white-space:\s*nowrap/, 'a label can wrap, so the one-row width is not the measured one');
  // The frame goes back to the full viewport and the viewport stops scrolling, as the band placement needs.
  assert.match(ruleBody(wide, ".pr-viewport[data-bar='band'] .pr-stagebox"), /position:\s*absolute/);
  assert.match(ruleBody(wide, ".pr-viewport[data-bar='band']"), /overflow:\s*hidden/);
  // The band paints at 299 (PlayExit.astro); the bar is inside this box, so the box must clear it.
  assert.match(ruleBody(CSS, '.pr-viewport'), /z-index:\s*300/, 'the viewport is under the play band, so the bar in the band is hidden');
  // The base placement is the below-frame one, so a bar that does not fit (or has no decision yet) covers nothing.
  assert.match(ruleBody(CSS, '.pr-bar'), /position:\s*static/, 'the bar is not below the frame by default');
  assert.doesNotMatch(ruleBody(CSS, '.pr-bar'), /inset-block-end/, 'the bar still sits at the bottom of the frame');
});

test('below the frame (the base placement, and under 640px always) the page scrolls and the bar flows after the frame; under 640px the i5-phone B layout (design/Gh314Frames.dc.html i5-phone B)', () => {
  assert.match(ruleBody(CSS, '.pr-viewport'), /overflow-y:\s*auto/, 'the below placement cannot scroll');
  // A screen with no name field (the result) keeps the scaled frame, at exactly its width, so the bar can follow it.
  assert.match(ruleBody(CSS, '.pr-stagebox'), /aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(ruleBody(CSS, '.pr-stagebox'), /position:\s*relative/);
  assert.match(ruleBody(CSS, '.pr-badge'), /flex-basis:\s*100%/);
  const phone = mediaBlock(CSS, PHONE_QUERY);
  assert.ok(phone, 'no phone block: the phone layout has no breakpoint');
  assert.match(ruleBody(phone, '.pr-viewport[data-field] .pd-scaled'), /transform:\s*none/, 'the frame is still scaled whole');
  const field = ruleBody(phone, '.pr-viewport[data-field] .pd-field');
  assert.match(field, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, 'the names are not in two columns');
  assert.match(field, /gap:\s*4px 10px/);
  assert.match(ruleBody(phone, '.pr-viewport[data-field] .pd-chip'), /--fit-size:\s*16/, 'names are not at the 16px phone size');
  assert.match(ruleBody(phone, '.pr-viewport[data-field] .pd-ev'), /font-size:\s*22px/);
  assert.match(ruleBody(phone, '.pr-viewport[data-field] .pd-flow'), /font-size:\s*50px/);
  assert.match(ruleBody(phone, '.pr-viewport[data-field] .pd-gname'), /font-size:\s*22px/);
  assert.match(ruleBody(phone, '.pr-viewport[data-field] .pr-stagebox'), /aspect-ratio:\s*auto/);
});

test('the frame and the bar are one column in the viewport: the bar follows the frame, and the field screens are marked', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const s = mountFake('ladder');
    const viewport = s.root.querySelector('.pr-viewport');
    const kids = viewport.children.map((c) => c.className);
    assert.deepEqual(kids, ['pr-stagebox', 'pr-3d', 'pr-bar'], 'the bar must come after the frame in the page order');
    assert.equal(viewport.children[0].querySelector('.pd-scaled')?.querySelector('.pd-frame') != null, true, 'the frame is not inside the stage box');
    assert.equal(viewport.hasAttribute('data-field'), true, 'the final screen has a name field, so it takes the phone field layout');
    mock.timers.tick(1000);
    s.go().click();
    s.hosts.started[0].exit();
    assert.equal(s.root.querySelector('.pd-frame').getAttribute('data-screen'), 'result');
    assert.equal(viewport.hasAttribute('data-field'), false, 'the result has no name field, so it must not take the field layout');
    mock.timers.tick(1000);
    s.go().click();
    assert.equal(viewport.hasAttribute('data-field'), true, 'the replay did not mark the final screen again');
  } finally {
    mock.timers.reset();
  }
});

test('the wide and phone rules are complements: every width, a fractional one included, matches exactly one', () => {
  const queries = [...CSS.matchAll(/@media\s+([^{]+?)\s*\{/g)].map((m) => m[1]);
  assert.deepEqual([...queries].sort(), ['(min-width: 640px)', PHONE_QUERY].sort(), 'the stylesheet holds a media query this test does not evaluate');
  /** Evaluates the two query shapes used here: `(min-width: Npx)` and `not all and (min-width: Npx)`. */
  const matches = (q, w) => {
    const m = /^(not all and )?\(min-width:\s*(\d+)px\)$/.exec(q);
    assert.ok(m, `unsupported query ${q}`);
    return Boolean(m[1]) !== w >= Number(m[2]);
  };
  for (const w of [320, 639, 639.5, 639.99, 640, 641, 1920]) {
    assert.equal(queries.filter((q) => matches(q, w)).length, 1, `${w}px matches ${queries.filter((q) => matches(q, w)).length} of the layout rules`);
  }
  assert.equal(matches(PHONE_QUERY, 639.5), true);
  assert.equal(matches('(min-width: 640px)', 640), true);
});

// ---- Where the bar stands is measured, never a pixel breakpoint (gh#305 PD-305-02) ------------------------

const WIDE = { width: 1920, exitRight: 50, band: 56, barBottom: 54, badge: 200, button: 150 };

test('the bar stands in the band when it fits: one row, right of the exit control, inside the band', () => {
  const s = mountFake('fireworks', { ...WIDE });
  assert.equal(s.root.querySelector('.pr-viewport').getAttribute('data-bar'), 'band');
});

test('the bar goes below the frame when it would cover the exit control, or does not stay inside the band', () => {
  // 3 buttons + badge = 650px, right edge 676: its left edge is 26, under the exit control's right edge 50.
  const narrow = mountFake('fireworks', { ...WIDE, width: 700 });
  assert.equal(narrow.root.querySelector('.pr-viewport').getAttribute('data-bar'), 'below', 'the bar covers the exit control');
  // Fits across, but a row taller than the band (a wrapped label) reaches under the band.
  const tall = mountFake('fireworks', { ...WIDE, barBottom: 112 });
  assert.equal(tall.root.querySelector('.pr-viewport').getAttribute('data-bar'), 'below', 'the bar leaves the band');
  // Exactly touching the exit control's edge is not covering it.
  const edge = mountFake('fireworks', { ...WIDE, width: 650 + 24 + 50 });
  assert.equal(edge.root.querySelector('.pr-viewport').getAttribute('data-bar'), 'band');
});

test('the placement is decided again after a resize and after the bar grows or shrinks', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const layout = { ...WIDE, width: 1000 };
    const s = mountFake('fireworks', layout);
    const viewport = s.root.querySelector('.pr-viewport');
    assert.equal(viewport.getAttribute('data-bar'), 'band', '3 controls fit at 1000');
    // The final mode adds five prize-count chips: 9 buttons + badge = 1550px, which no longer fits.
    mock.timers.tick(1000);
    s.chip(COPY.mode.final).click();
    assert.equal(s.chips().length, 7);
    assert.equal(viewport.getAttribute('data-bar'), 'below', 'the bar grew past its room and kept the band');
    // Back to the round mode: 3 buttons again, so the band again.
    mock.timers.tick(1000);
    s.chip(COPY.mode.round).click();
    assert.equal(viewport.getAttribute('data-bar'), 'band', 'the bar shrank and stayed below');
    // A resize: a narrower screen puts the bar over the exit control; a wider one gives the band back.
    layout.width = 700;
    s.demo.refit();
    assert.equal(viewport.getAttribute('data-bar'), 'below', 'a resize to 700 kept the band');
    layout.width = 1920;
    s.demo.refit();
    assert.equal(viewport.getAttribute('data-bar'), 'band', 'a resize back to 1920 stayed below');
  } finally {
    mock.timers.reset();
  }
});
