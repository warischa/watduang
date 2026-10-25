// node --test src/games/reveal-arm-budget.test.mjs — no framework, no dependency
// gh#288 Phase 3: each fortune result is revealed by CSS (.wd-reveal, defined in web.css) on a node the
// module inserts in the same task that arms the stage (ADR-0057). Two things must hold for that to be
// safe, and this file owns both:
//   1. the reveal is at rest before the arm window closes, otherwise a second contact lands on a
//      control while the result is still moving;
//   2. each module's result render actually carries a .wd-reveal node while every stage button is
//      still disabled, so the reveal and the arm window start together.
// The motion values are read from tokens.css, never restated here, so a token edit that breaks the
// budget fails this file instead of shipping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARM_DELAY_MS } from './_arm-gate.ts';
import { makeDocument } from './_fake-dom.mjs';
import siamsi, { SHAKE_TARGET, HOLD_STEP_MS } from './siamsi.ts';
import loveMatch from './love-match.ts';
import dailyFortune from './daily-fortune.ts';

const fakeDocument = makeDocument();
globalThis.document = fakeDocument;

// ---- 1. the budget ----

/** One display frame at 60Hz, rounded up. The animation can start one frame after the insert. */
const FRAME_MS = 17;
/** The first-frame latency budget: how late the browser may be in producing the frame that starts the
 *  animation (style recalc + layout + paint of a freshly swapped screen on a slow phone). Not
 *  measured here — a named allowance, so the sum below says what it assumes. */
const FIRST_FRAME_LATENCY_MS = 100;

const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
function tokenMs(name) {
  const m = new RegExp(`${name}:\\s*(\\d+)ms`).exec(tokens);
  assert.ok(m, `${name} is not declared in ms in tokens.css`);
  return Number(m[1]);
}

const fits = (revealMs) => revealMs + FRAME_MS + FIRST_FRAME_LATENCY_MS <= ARM_DELAY_MS;

const REVEAL = { full: tokenMs('--motion-reveal'), reduced: tokenMs('--motion-rm-fade') };

for (const [form, ms] of Object.entries(REVEAL)) {
  test(`the ${form} reveal (${ms}ms) plus a frame plus the latency budget settles inside ARM_DELAY_MS`, () => {
    assert.ok(
      fits(ms),
      `${ms} + ${FRAME_MS} + ${FIRST_FRAME_LATENCY_MS} = ${ms + FRAME_MS + FIRST_FRAME_LATENCY_MS}ms exceeds ARM_DELAY_MS = ${ARM_DELAY_MS}`,
    );
  });
}

test('calibration: the budget check goes red on a 400ms reveal, so it can fail', () => {
  assert.equal(fits(400), false);
  assert.equal(fits(ARM_DELAY_MS - FRAME_MS - FIRST_FRAME_LATENCY_MS), true, 'the boundary itself is inside the budget');
  assert.equal(fits(ARM_DELAY_MS - FRAME_MS - FIRST_FRAME_LATENCY_MS + 1), false, 'one ms past the boundary is outside it');
});

// ---- 2. each result render: a reveal node and an armed stage, in the same render ----

const timers = { apis: ['setTimeout', 'setInterval'] };

function makeCtx() {
  return {
    roster: { names: () => [], add() {} },
    session: { players: [], setPlayers() {}, played: [], markPlayed() {}, checkpoint: null, saveCheckpoint() {}, clear() {} },
  };
}

function collect(node, pred, out = []) {
  if (pred(node)) out.push(node);
  for (const c of node.children || []) collect(c, pred, out);
  return out;
}
const hasClass = (n, cls) => (n.className || '').split(/\s+/).includes(cls);
const byId = (node, id) => collect(node, (n) => n.id === id)[0] ?? null;
const buttons = (node) => collect(node, (n) => (n.tagName || '').toUpperCase() === 'BUTTON');

/** The result render must hand back a block-level node carrying wd-reveal and a stage whose every
 *  button is disabled — an inline box takes no transform, and an enabled button means the reveal
 *  would be running with no ghost-tap gate behind it. */
function assertRevealedAndArmed(stage, where) {
  const revealed = collect(stage, (n) => hasClass(n, 'wd-reveal'));
  assert.ok(revealed.length >= 1, `${where}: the result render carries no .wd-reveal node`);
  for (const node of revealed) {
    assert.equal((node.tagName || '').toUpperCase(), 'DIV', `${where}: .wd-reveal sits on an inline-capable <${node.tagName}>`);
  }
  const all = buttons(stage);
  assert.ok(all.length >= 1, `${where}: the result screen has no button to arm`);
  for (const b of all) assert.equal(b.disabled, true, `${where}: button ${b.id || b.className} is live while the reveal runs`);
}

const arm = (t) => t.mock.timers.tick(ARM_DELAY_MS + 1);

test('siamsi: the slip reveals in the render that arms its stage', (t) => {
  t.mock.timers.enable(timers);
  const stage = fakeDocument.createElement('div');
  siamsi.mount(stage, makeCtx());
  arm(t);
  byId(stage, 'ss-intent-done').click();
  arm(t);
  byId(stage, 'ss-hold').dispatch('pointerdown');
  t.mock.timers.tick(HOLD_STEP_MS * SHAKE_TARGET + 1);
  arm(t);
  byId(stage, 'ss-open-slip').click();
  assert.ok(collect(stage, (n) => hasClass(n, 'sm-slip')).length === 1, 'the click did not render the slip');
  assertRevealedAndArmed(stage, 'siamsi slip');
  siamsi.dispose();
});

test('love-match: both readings reveal in the render that arms their stage', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  loveMatch.mount(stage, makeCtx());
  arm(t);
  byId(stage, 'lm-me-f').click();
  byId(stage, 'lm-band-1').click();
  const draw = (value) => {
    const real = Math.random;
    Math.random = () => value;
    try { byId(stage, 'lm-go').click(); } finally { Math.random = real; }
  };

  draw(0.1); // below MEET_ODDS: the meet reading
  assert.ok(byId(stage, 'lm-again'), 'the meet draw did not render a reading');
  assert.ok(collect(stage, (n) => hasClass(n, 'lm-card')).length === 1, 'this is not the meet branch');
  assertRevealedAndArmed(stage, 'love-match meet reading');

  arm(t);
  byId(stage, 'lm-again').click();
  arm(t);
  draw(0.9); // at or above MEET_ODDS: the self reading
  assert.ok(byId(stage, 'lm-again'), 'the self draw did not render a reading');
  assert.equal(collect(stage, (n) => hasClass(n, 'lm-card')).length, 0, 'this is not the self branch');
  assertRevealedAndArmed(stage, 'love-match self reading');
  loveMatch.dispose();
});

test('daily-fortune: the verdict reveals in the render that arms its stage', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  dailyFortune.mount(stage, makeCtx());
  arm(t);
  byId(stage, 'df-go').click();
  assert.ok(byId(stage, 'df-again'), 'the press did not render a result');
  assertRevealedAndArmed(stage, 'daily-fortune result');
  assert.ok(
    collect(stage, (n) => hasClass(n, 'wd-reveal') && hasClass(n, 'df-verdict-card')).length === 1,
    'the verdict card is not the revealed node',
  );
  dailyFortune.dispose();
});
