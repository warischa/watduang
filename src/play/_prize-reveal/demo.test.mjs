// The prize-draw games' own pages (gh#305-gh#307, gh#319): the demo's fixtures are real committed outcomes,
// fixed across loads, and its controller plays them through the host and stores nothing.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { COPY, DEMO_HEADS, DEMO_MODES, DEMO_PRIZES, demoNames, demoRun, mountDemo } from './demo.ts';
import { ladderConsistent } from '../../prize-event/game-contract.ts';
import { proposeSchedule } from '../../prize-draw/schedule.ts';
import { satisfies } from '../../prize-draw/cards.ts';
import { phoneCard } from '../../prize-draw/cards.ts';
import { allArmed, mountFake } from './demo-harness.mjs';
import { makeDoc } from '../../prize-event/fake-dom.mjs';
import { settleFor } from './game-registry.ts';
import { COPY as PICK_COPY } from '../prize-draw/final-picks.ts';

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

test('the demo has no phones: every reveal it starts carries claim false', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    for (const game of Object.keys(DEMO_MODES)) {
      const s = mountFake(game);
      allArmed(s, `${game} first screen`);
      s.go().click();
      assert.equal(s.hosts.started.length, 1, `${game}: the press started no reveal`);
      assert.equal(s.hosts.started[0].options.input.claim, false, `${game}: the demo asked for the claim line`);
      s.demo.dispose();
    }
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
  // Relative, not static (gh#319): the bar keeps its place in the flow and takes a z-index over the 3D layer.
  assert.match(ruleBody(CSS, '.pr-bar'), /position:\s*relative/, 'the bar is not in the flow below the frame by default');
  assert.doesNotMatch(ruleBody(CSS, '.pr-bar'), /inset-block-end/, 'the bar still sits at the bottom of the frame');
});

test('below the frame (the base placement, and under 640px always) the page scrolls and the bar flows after the frame; under 640px the i5-phone B layout (design/Gh314Frames.dc.html i5-phone B)', () => {
  assert.match(ruleBody(CSS, '.pr-viewport'), /overflow-y:\s*auto/, 'the below placement cannot scroll');
  // The base box keeps its 16:9 ratio (the wide result keeps the scaled frame); under 640px the field and the
  // result screens yield it to their phone layouts (gh#319 PD-317-01 a, PD-318-02 a).
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

// ---- The owner's gh#319 picks on the demo page -------------------------------------------------------------

/** The boards' sample prize names, verbatim (PRIZES in docs/verification/evidence/gh302-boards-2026-11-11/make-boards.mjs;
 *  PD-317-05 a). The fixture takes them in order, so the result never reads "รางวัลที่ 1 · รางวัลที่ 1". */
const SAMPLE_PRIZES = ['ทีวี 55 นิ้ว', 'จักรยานไฟฟ้า', 'หม้อทอดไร้น้ำมัน', 'ลำโพงไร้สาย', 'หูฟังไร้สาย'];

test('each phase-2 demo idles on its own game picture, not the shared standby (PD-315-01 a, PD-316-02 a, PD-317-04 a, PD-318-03 a)', () => {
  const frameOf = (game) => mountFake(game).root.querySelector('.pd-frame');

  const zones = frameOf('zones');
  assert.equal(zones.getAttribute('data-screen'), 'zones', 'the zones demo does not idle on the zones frame');
  assert.equal(zones.querySelectorAll('.pd-zpanel').length, 4, 'the zones idle has no four zone panels');
  assert.equal(zones.querySelectorAll('.pd-chip').length, DEMO_HEADS, 'the zones idle does not seat the whole room');
  assert.equal(zones.querySelector('.pd-field'), null, 'the shared field still shows for a zones round');

  const marbles = frameOf('marbles');
  assert.equal(marbles.getAttribute('data-screen'), 'marbles', 'the marbles demo does not idle on the marbles frame');
  assert.ok(marbles.querySelector('.pd-mfield'), 'the marbles idle has no track');
  assert.equal(marbles.querySelectorAll('.pd-mplate').length, 20, 'the marbles idle does not seat the first heat');
  assert.equal(marbles.querySelector('.pd-field'), null, 'the shared field still shows for a marbles round');

  for (const game of ['envelopes', 'flipcards']) {
    const frame = frameOf(game);
    assert.equal(frame.getAttribute('data-screen'), 'objects', `the ${game} demo does not idle on the object frame`);
    assert.equal(frame.querySelectorAll('.pd-obj').length, 5, `the ${game} idle has no five objects`);
    const plates = frame.querySelectorAll('.pd-oplate');
    assert.equal(plates.length, 5, `the ${game} idle has no five plates`);
    for (const plate of plates) assert.ok(!plate.classList.contains('empty'), `the ${game} idle leaves a pick unplaced`);
    // The hud's instruction is the frame's first .pd-lk (the fake DOM matches single compounds only).
    assert.equal(frame.querySelectorAll('.pd-lk')[0].textContent, PICK_COPY[game].instruction, `the ${game} idle has no instruction`);
    assert.ok(frame.textContent.includes(PICK_COPY[game].picked), `the ${game} idle does not say the picks are made`);
  }
  assert.equal(frameOf('envelopes').querySelectorAll('.pd-envart').length, 5, 'the envelopes idle has no envelopes');
  assert.equal(frameOf('flipcards').querySelectorAll('.pd-cardback').length, 5, 'the flipcards idle has no face-down cards');

  // Phase-1 games keep today's idle: the shared round field (fireworks, cards) and the final field (ladder).
  for (const game of ['fireworks', 'cards']) {
    const frame = frameOf(game);
    assert.equal(frame.getAttribute('data-screen'), 'round', `${game} lost its shared round idle`);
    assert.ok(frame.querySelector('.pd-field'), `${game} lost its name field`);
  }
  assert.equal(frameOf('ladder').getAttribute('data-screen'), 'final', 'the ladder lost its shared final idle');
});

test('the flipcards idle band counts the prizes the stepper selects, never the five finalists (PD-318-03 a)', () => {
  const s = mountFake('flipcards');
  const tap = (b) => {
    b.disabled = false;
    b.click();
  };
  const band = () => s.root.querySelector('.pd-olow').querySelector('.pd-flow');
  assert.equal(band().textContent, `${DEMO_PRIZES}รางวัล`, 'the idle band does not count the demo prize count');
  assert.doesNotMatch(band().textContent, /5 คน/, 'the band says 5 people while the stepper selects 3');
  tap(s.chip('5'));
  assert.equal(band().textContent, '5รางวัล', 'the band did not follow the stepper to 5');
  tap(s.chip('1'));
  assert.equal(band().textContent, '1รางวัล', 'the band did not follow the stepper to 1');
});

test('the result screen marks the viewport data-result, and the replay removes the mark (PD-317-01 a, PD-318-02 a)', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const tap = (b) => {
      b.disabled = false;
      b.click();
    };
    for (const game of ['ladder', 'envelopes', 'flipcards', 'fireworks']) {
      const mode = game === 'fireworks' ? 'final' : null;
      const s = mountFake(game);
      if (mode) tap(s.chip(COPY.mode.final));
      const viewport = s.root.querySelector('.pr-viewport');
      assert.equal(viewport.hasAttribute('data-result'), false, `${game}: the idle is marked as a result`);
      tap(s.go());
      s.hosts.started.at(-1).exit();
      assert.equal(s.root.querySelector('.pd-frame').getAttribute('data-screen'), 'result', `${game}: no result screen`);
      assert.equal(viewport.hasAttribute('data-result'), true, `${game}: the result does not take the phone result layout`);
      assert.equal(viewport.hasAttribute('data-field'), false, `${game}: the result also takes the field layout`);
      tap(s.go()); // the replay
      assert.equal(viewport.hasAttribute('data-result'), false, `${game}: the replay kept the result mark`);
    }
  } finally {
    mock.timers.reset();
  }
});

test('the fixture prizes are the boards\' sample names, so the result reads the prize, never a doubled label (PD-317-05 a)', () => {
  for (let n = 1; n <= 5; n++) {
    assert.deepEqual(demoRun('fireworks', 'final', n).steps.at(-1).outcome.prizes, SAMPLE_PRIZES.slice(0, n), `${n} prizes are not the sample names in order`);
  }
  const s = mountFake('ladder');
  const go = s.go();
  go.disabled = false;
  go.click();
  s.hosts.started[0].exit();
  const text = s.root.querySelector('.pd-frame').textContent;
  assert.ok(text.includes('รางวัลที่ 1 · ทีวี 55 นิ้ว'), 'the result does not name the first sample prize');
  assert.doesNotMatch(text, /รางวัลที่ \d · รางวัลที่ \d/, 'the result doubles the prize label');
});

/**
 * A recording host that models the shared host's HOLD contract (game-host.ts): a hold game's settle keeps its
 * canvas in the container and draws the 2D frame once behind it; dispose releases the canvas and never draws
 * again. A handback game's settle releases at once. The demo reads settleFor itself, so the fake only has to
 * keep/remove the canvas the way the host does (the projector's own fake, gh319-stage.test.mjs, same contract).
 */
function heldHosts() {
  const hosts = [];
  const start = (options) => {
    const doc = options.container.ownerDocument;
    const h = {
      options,
      state: 'loading',
      disposed: 0,
      canvas: null,
      draws: 0,
      settle() {
        if (h.state === 'settled' || h.state === 'fallback' || h.state === 'disposed') return;
        h.state = 'settled';
        if (settleFor(options.game) === 'hold') {
          h.canvas = doc.createElement('canvas');
          options.container.appendChild(h.canvas);
        }
        h.draws++;
        options.render2D(options.input.outcome);
      },
      dispose() {
        h.disposed++;
        if (h.canvas) {
          h.canvas.remove();
          h.canvas = null;
          options.onRelease?.();
        }
        if (h.state !== 'settled' && h.state !== 'fallback' && h.state !== 'disposed') {
          h.state = 'disposed';
          h.draws++;
          options.render2D(options.input.outcome);
        }
      },
      /** The host's releaseHeld: the picture goes, the state stays settled, and onRelease tells the caller. */
      release() {
        if (h.canvas) {
          h.canvas.remove();
          h.canvas = null;
        }
        options.onRelease?.();
      },
      command() {},
      done: new Promise(() => {}),
    };
    hosts.push(h);
    return h;
  };
  return { hosts, start };
}

/** Mount the demo over the hold-contract fake; tap bypasses the arm window the way the stage tests do. */
function mountHeld(game) {
  const doc = makeDoc();
  const root = doc.createElement('div');
  const live = doc.createElement('p');
  doc.body.append(live, root);
  const { hosts, start } = heldHosts();
  const demo = mountDemo({ doc, root, live, game, startReveal: start });
  const bar = () => root.querySelector('.pr-bar');
  const tap = (b) => {
    assert.ok(b, 'no such control on screen');
    b.disabled = false;
    b.click();
  };
  return {
    doc, root, live, demo, hosts, tap,
    go: () => bar().querySelector('.pr-go'),
    chip: (t) => bar().querySelectorAll('.pr-chip').find((b) => b.textContent === t) ?? null,
    frame: () => root.querySelector('.pd-frame'),
    canvasUp: () => root.querySelector('.pr-3d').querySelectorAll('canvas').length > 0,
  };
}

test('a held settle keeps its picture; the replay, a prize-count change and leaving dispose it first (gh#319)', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const s = mountHeld('envelopes');
    s.tap(s.go());
    const h = s.hosts[0];
    h.settle();
    assert.equal(s.frame().getAttribute('data-screen'), 'result', 'the held settle did not draw the result behind it');
    assert.equal(h.draws, 1, 'the 2D frame is not drawn exactly once behind the held picture');
    assert.ok(s.canvasUp(), 'a hold game keeps no canvas over the 2D frame');
    assert.equal(h.disposed, 0, 'the settled picture was released at once');
    assert.equal(s.go().textContent, COPY.replay, 'the controls did not come back over the held picture');
    // The replay: the held host goes before the new run paints, and nothing draws the 2D frame a second time.
    s.tap(s.go());
    assert.equal(h.disposed, 1, 'the replay did not dispose the held host');
    assert.ok(!s.canvasUp(), 'the held canvas covers the replayed idle');
    assert.equal(s.frame().getAttribute('data-screen'), 'objects', 'the replay did not return to the idle');
    assert.equal(h.draws, 1, 'disposing the held picture drew the 2D frame again');
    // A prize-count change while a picture is held disposes it too.
    s.tap(s.go());
    const h2 = s.hosts[1];
    h2.settle();
    assert.ok(s.canvasUp(), 'the second settle keeps no picture');
    s.tap(s.chip('5'));
    assert.equal(h2.disposed, 1, 'the prize-count change did not dispose the held host');
    assert.ok(!s.canvasUp(), 'the held canvas covers the new count idle');
    assert.equal(s.root.querySelector('.pd-olow').querySelector('.pd-flow').textContent, '5รางวัล');
    // Leaving disposes the held picture.
    s.tap(s.go());
    const h3 = s.hosts[2];
    h3.settle();
    s.demo.dispose();
    assert.equal(h3.disposed, 1, 'leaving did not dispose the held host');
    assert.ok(!s.canvasUp(), 'the held canvas outlives the page');
  } finally {
    mock.timers.reset();
  }
});

test('a handback game retains no handle: its settle keeps no canvas, and the replay disposes nothing', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const s = mountHeld('fireworks');
    s.tap(s.chip(COPY.mode.final));
    s.tap(s.go());
    const h = s.hosts[0];
    h.settle();
    assert.equal(s.frame().getAttribute('data-screen'), 'result');
    assert.ok(!s.canvasUp(), 'a handback game kept its canvas');
    s.tap(s.go()); // the replay
    assert.equal(h.disposed, 0, 'the replay disposed a handle that was never retained');
  } finally {
    mock.timers.reset();
  }
});

test('a prize beat writes exactly one live line through the name sink; a stale reveal writes none (PD-317-10 a, PD-318-10 a)', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const s = mountHeld('envelopes');
    s.tap(s.go());
    const h = s.hosts[0];
    const { outcome, people } = h.options.input;
    const nameAt = (rank) => people.find((p) => p.id === outcome.order[rank]).name;
    const runs = () => s.live.all().filter((el) => el.getAttribute('dir') === 'auto');
    h.options.onEvent({ type: 'beat', beat: 'prize', index: 0 });
    assert.deepEqual(runs().map((r) => r.textContent), [nameAt(0)], 'the beat line does not carry the finalist as one isolated run');
    assert.equal(s.live.textContent, `รางวัลที่ 1 · ${outcome.prizes[0]} · ${nameAt(0)}`, 'the beat line is not the prize-line words plus the name');
    // One line, replaced -- never appended.
    h.options.onEvent({ type: 'beat', beat: 'prize', index: 1 });
    assert.deepEqual(runs().map((r) => r.textContent), [nameAt(1)], 'the second beat appended instead of replacing');
    assert.equal(s.live.textContent, `รางวัลที่ 2 · ${outcome.prizes[1]} · ${nameAt(1)}`);
    // A beat that is not a prize writes nothing.
    const before = s.live.textContent;
    h.options.onEvent({ type: 'beat', beat: 'cut', index: 0 });
    assert.equal(s.live.textContent, before, 'a non-prize beat wrote a live line');
    // After the replay the old reveal is stale: its beats write nothing over the idle announcement.
    h.settle();
    s.tap(s.go());
    const idleLine = s.live.textContent;
    h.options.onEvent({ type: 'beat', beat: 'prize', index: 0 });
    assert.equal(s.live.textContent, idleLine, 'a stale reveal wrote over the new screen');
  } finally {
    mock.timers.reset();
  }
});

// ---- The held composite on the demo page: the frame must not paint through the held canvas (gh#319) ----

const REVEAL_CSS = fs.readFileSync(path.join(import.meta.dirname, 'reveal.css'), 'utf8');

test('a held demo marks its viewport data-held; the replay, a prize-count change and leaving clear it', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const s = mountHeld('envelopes');
    const vp = () => s.root.querySelector('.pr-viewport');
    const over = () => s.root.querySelector('.pd-over');
    assert.ok(over(), 'the demo page has no held-picture overlay');
    assert.equal(over().parentNode.className, 'pr-stagebox', 'the overlay is not in the frame box');
    assert.ok(!vp().hasAttribute('data-held'), 'the idle is marked as held');
    s.tap(s.go());
    s.hosts[0].settle();
    assert.ok(s.canvasUp(), 'precondition: the picture is held');
    assert.ok(vp().hasAttribute('data-held'), 'the held demo does not mark its viewport');
    assert.match(
      REVEAL_CSS,
      /:is\(\.pd-viewport, \.pr-viewport\)\[data-held\] \.pd-scaled\s*\{[^}]*opacity:\s*0/,
      'reveal.css carries no shared data-held rule hiding the frame from sight',
    );
    assert.doesNotMatch(
      REVEAL_CSS,
      /:is\(\.pd-viewport, \.pr-viewport\)\[data-held\] \.pd-scaled\s*\{[^}]*visibility:\s*hidden/,
      'visibility:hidden drops the held result from the accessibility tree (gh#319)',
    );
    // The demo event is not QR mode: no code card or claim to lift, but the frame paint is off all the same.
    assert.equal(over().children.length, 0);
    assert.ok(s.frame().getAttribute('data-screen') === 'result', 'the frame DOM went with the paint');
    s.tap(s.go()); // the replay
    assert.ok(!vp().hasAttribute('data-held'), 'the replay left the frame hidden');
    s.tap(s.go());
    s.hosts[1].settle();
    assert.ok(vp().hasAttribute('data-held'));
    s.tap(s.chip('5'));
    assert.ok(!vp().hasAttribute('data-held'), 'the prize-count change left the frame hidden');
    s.tap(s.go());
    s.hosts[2].settle();
    s.demo.dispose();
    assert.ok(!s.canvasUp());
    assert.ok(!vp().hasAttribute('data-held'), 'leaving left the frame hidden');
  } finally {
    mock.timers.reset();
  }
});

test('a held demo released by reduced motion or narrowing draws its frame back via onRelease', () => {
  for (const label of ['reduced motion', 'narrowing']) {
    const doc = makeDoc();
    const root = doc.createElement('div');
    const live = doc.createElement('p');
    doc.body.append(live, root);
    const { hosts, start } = heldHosts();
    const demo = mountDemo({ doc, root, live, game: 'zones', startReveal: start });
    const vp = root.querySelector('.pr-viewport');
    const go = root.querySelector('.pr-go');
    go.disabled = false;
    go.click();
    hosts[0].settle();
    assert.ok(vp.hasAttribute('data-held'), `${label}: precondition`);
    // The host releases on this trigger and calls onRelease; the demo draws its frame back in one pass.
    hosts[0].release();
    assert.equal(root.querySelector('.pr-3d').children.length, 0, `${label}: the fake did not release`);
    assert.ok(!vp.hasAttribute('data-held'), `${label} left the demo frame hidden after the release`);
    assert.equal(root.querySelector('.pd-over').children.length, 0);
    demo.dispose();
  }
});

test('navigation: pagehide disposes the held demo host; a persisted pageshow restarts the demo from its idle screen (gh#319)', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const doc = makeDoc();
    const listeners = new Map();
    doc.defaultView = {
      innerWidth: 1440,
      addEventListener(t, fn) {
        if (!listeners.has(t)) listeners.set(t, []);
        listeners.get(t).push(fn);
      },
      removeEventListener() {},
    };
    const dispatch = (t, ev = {}) => {
      for (const fn of [...(listeners.get(t) ?? [])]) fn({ type: t, ...ev });
    };
    const root = doc.createElement('div');
    const live = doc.createElement('p');
    doc.body.append(live, root);
    const { hosts, start } = heldHosts();
    const demo = mountDemo({ doc, root, live, game: 'envelopes', startReveal: start });
    const go = root.querySelector('.pr-go');
    go.disabled = false;
    go.click();
    hosts[0].settle();
    const vp = root.querySelector('.pr-viewport');
    assert.ok(vp.hasAttribute('data-held'), 'precondition: the picture is held');
    dispatch('pagehide', { persisted: true });
    assert.equal(hosts[0].disposed, 1, 'pagehide did not dispose the held demo host');
    assert.ok(!vp.hasAttribute('data-held'), 'pagehide left the demo frame hidden');
    assert.equal(root.querySelector('.pr-3d').children.length, 0, 'the held canvas survived navigation');
    dispatch('pageshow', { persisted: true });
    // Old: the restore repainted the settled result. New: it restarts cleanly from the idle screen with the
    // bar and its controls, the state a fresh load gives, whatever phase the page was hidden in (gh#319).
    assert.equal(root.querySelector('.pd-frame').getAttribute('data-screen'), 'objects', 'a persisted restore did not return to the idle screen');
    assert.ok(root.querySelector('.pr-bar').querySelector('.pr-go'), 'a persisted restore left the demo bar with no control');
    assert.equal(root.querySelector('.pr-3d').children.length, 0, 'a restored demo held a picture again');
    demo.dispose();
  } finally {
    mock.timers.reset();
  }
});

test('navigation: a loading-phase pagehide then a persisted pageshow restarts the demo usable (bar + controls)', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const doc = makeDoc();
    const listeners = new Map();
    doc.defaultView = {
      innerWidth: 1440,
      addEventListener(t, fn) {
        if (!listeners.has(t)) listeners.set(t, []);
        listeners.get(t).push(fn);
      },
      removeEventListener() {},
    };
    const dispatch = (t, ev = {}) => {
      for (const fn of [...(listeners.get(t) ?? [])]) fn({ type: t, ...ev });
    };
    const root = doc.createElement('div');
    const live = doc.createElement('p');
    doc.body.append(live, root);
    const { hosts, start } = heldHosts();
    const demo = mountDemo({ doc, root, live, game: 'envelopes', startReveal: start });
    const go = root.querySelector('.pr-go');
    go.disabled = false;
    go.click(); // present; the host is still LOADING, the bar holds only the label
    assert.equal(hosts[0].state, 'loading', 'precondition: the reveal was still loading');
    assert.equal(root.querySelector('.pr-bar').querySelector('.pr-go'), null, 'precondition: the bar holds no control while it presents');
    dispatch('pagehide', { persisted: true });
    dispatch('pageshow', { persisted: true });
    assert.ok(root.querySelector('.pr-bar').querySelector('.pr-go'), 'a persisted restore left the demo bar with no control');
    assert.equal(root.querySelector('.pd-frame').getAttribute('data-screen'), 'objects', 'the restore did not return to the idle screen');
    demo.dispose();
  } finally {
    mock.timers.reset();
  }
});

test('a held demo picture\'s release repaints without re-announcing the settled result (gh#319)', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const s = mountHeld('envelopes');
    s.tap(s.go());
    s.hosts[0].settle();
    const line = s.live.textContent;
    assert.ok(line.includes('ผู้ได้รับรางวัล'), 'precondition: the result was announced at settle');
    let writes = 0;
    const real = s.live.replaceChildren.bind(s.live);
    s.live.replaceChildren = (...args) => {
      writes++;
      return real(...args);
    };
    s.hosts[0].release();
    assert.equal(writes, 0, 'the release repaint re-announced the settled result');
    assert.equal(s.live.textContent, line, 'the release repaint changed the live line');
    assert.ok(!s.root.querySelector('.pr-viewport').hasAttribute('data-held'), 'the release did not draw the frame back');
  } finally {
    mock.timers.reset();
  }
});

test('the plate base moved to the shared sheet: demo.css carries no copy of it (gh#319 cleanup)', () => {
  assert.doesNotMatch(CSS, /^\.pd-plate\s*\{/m, 'demo.css still copies the lane plate base');
  assert.doesNotMatch(CSS, /^\.pd-plate-name\s*\{/m, 'demo.css still copies the plate name base');
  assert.match(REVEAL_CSS, /^\.pd-plate\s*\{/m, 'the plate base is not in the shared sheet');
  assert.match(REVEAL_CSS, /^\.pd-plate-name\s*\{/m, 'the plate name base is not in the shared sheet');
});

test('the bar paints over a held picture: the 3D layer takes z-index 1, the bar z-index 2, still in the flow (gh#319)', () => {
  const z = (sel) => {
    const m = /z-index:\s*(-?\d+)/.exec(ruleBody(CSS, sel));
    assert.ok(m, `${sel} has no z-index`);
    return Number(m[1]);
  };
  assert.ok(z('.pr-bar') > z('.pr-3d'), 'the bar paints under the held 3D layer');
  // The bar is outside the scaled frame, so its own z-index reaches the layer (no transform context between).
  assert.match(ruleBody(CSS, '.pr-bar'), /position:\s*relative/, 'a static bar cannot take a z-index');
});

test('the phone result yields the 16:9 box, and the zones idle stacks its panels (env-phone / card-phone frames; the zones phone field)', () => {
  const phone = mediaBlock(CSS, PHONE_QUERY);
  assert.match(ruleBody(phone, '.pr-viewport[data-result] .pr-stagebox'), /aspect-ratio:\s*auto/, 'the result keeps the 16:9 box on a phone');
  const zfield = ruleBody(phone, '.pr-viewport[data-field] .pd-zfield');
  assert.match(zfield, /position:\s*static/, 'the zones idle field stays absolute on a phone');
  assert.match(zfield, /grid-template-columns:\s*minmax\(0,\s*1fr\)/, 'the zone panels do not stack one per row');
  assert.match(ruleBody(phone, '.pr-viewport[data-field] .pd-zgrid'), /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, 'the zone names are not in two columns');
});
