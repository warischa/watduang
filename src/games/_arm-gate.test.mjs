// gh#190 — the arm gate's own unit test. No probe covers the in-stage buttons: scripts/play-exit-probe
// walks the shell's X, and scripts/arm-gate-coverage-check is a source scan that never executes this
// module. What is pinned here is the one thing the forced-red measurement on the cursed-number play
// route exposed — the gate has to decide from the browser's INPUT clock, not from when its own
// setTimeout happened to run.
//
// The fake DOM's `dispatch(type, ...args)` hands the listener whatever the test passes, so a
// pointerdown here is a bare `{ timeStamp }`: that is the only field the gate reads, and building a
// richer fake would only add ways for the fixture to disagree with the platform.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeElement } from './_fake-dom.mjs';
import { ARM_DELAY_MS, armAllButtons } from './_arm-gate.ts';

/** A stage with one button in it, the shape every render function hands armAllButtons. */
function makeStage() {
  const stage = new FakeElement('div');
  const btn = new FakeElement('button');
  stage.appendChild(btn);
  return { stage, btn };
}

test('a contact DISPATCHED inside the window is refused even when the arm timer already ran', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { stage, btn } = makeStage();
  const cancel = armAllButtons(stage);
  assert.equal(btn.disabled, true, 'positive control: the gate disables the button up front');

  // The transition contact, on the browser's clock. The window it opens ends at 1000 + ARM_DELAY_MS.
  stage.dispatch('pointerdown', { timeStamp: 1000 });

  // The main thread frees up and the timer runs. On the real page this is the long transition task
  // ending: the timer expires and the control goes visibly live.
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(btn.disabled, false, 'positive control: the quiet window really did arm the button');

  // The ghost: the second contact of a double-tap, stamped 235.5ms after the transition tap — well
  // inside the window — but queued behind that same long task, so it is handled only now. This is
  // the exact contact the play-exit probe caught being handled with the control ENABLED.
  stage.dispatch('pointerdown', { timeStamp: 1235.5 });
  assert.equal(
    btn.disabled,
    true,
    'a contact the browser stamped inside the arm window was handled with the control live — the gate is still reading the timer, not the input clock',
  );

  cancel();
});

test('a contact dispatched AFTER the window still finds the button live — the fix is not blanket disabling', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { stage, btn } = makeStage();
  const cancel = armAllButtons(stage);
  stage.dispatch('pointerdown', { timeStamp: 1000 });
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(btn.disabled, false, 'positive control: armed before the deliberate contact');

  // A deliberate tap, one full second after the transition. Re-disabling under this finger is the
  // failure mode a stamp check bought too cheaply would ship: the button would go inert between
  // pointerdown and click and the tap would do nothing at all.
  stage.dispatch('pointerdown', { timeStamp: 2000 });
  assert.equal(btn.disabled, false, 'a deliberate contact outside the window was disabled under the finger');

  cancel();
});

test('a bare pointerdown with no event object still restarts the window', (t) => {
  // The existing route tests dispatch pointerdown with no argument at all. Nothing may read a field
  // off `undefined` there, and the timer-only behaviour those tests pin must survive.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { stage, btn } = makeStage();
  const cancel = armAllButtons(stage);
  t.mock.timers.tick(ARM_DELAY_MS - 50);
  stage.dispatch('pointerdown');
  t.mock.timers.tick(ARM_DELAY_MS - 50);
  assert.equal(btn.disabled, true, 'the contact did not push the arming out');
  t.mock.timers.tick(51);
  assert.equal(btn.disabled, false, 'the window never closed after the restart');
  cancel();
});

// ---- the seeded path: the window the gate anchors to a contact it never received ----------------
// Every test above dispatches the anchoring contact ON THE STAGE, which drives hold(). That is not
// how the real gate is anchored: armAllButtons runs inside a render the tap triggered, long after the
// event object is gone, so the anchor comes from the module's own document listener. Nothing in this
// repo exercised that listener — the probe leg that would is refused under the CI tag by design — so
// a regression in it (wrong phase, wrong event type, listener dropped) shipped green.
//
// A fake `document` installed before a FRESH import of the module is what reaches it: the query
// string gives each case its own module instance, so one case's stamps cannot leak into another's.
async function withFakeDocument(tag, run) {
  const listeners = [];
  const previous = globalThis.document;
  globalThis.document = {
    addEventListener(type, fn, capture) { listeners.push({ type, fn, capture }); },
  };
  try {
    const mod = await import(`./_arm-gate.ts?${tag}`);
    // Fire a real-shaped contact at whatever the module registered for it, and at nothing if it
    // registered nothing: WHICH events it listens for is the thing under test, so asserting the
    // registration here would red on the shape instead of on the behaviour it is supposed to buy.
    const contact = (type, timeStamp) => {
      for (const l of listeners) if (l.type === type) l.fn({ timeStamp, type });
    };
    assert.notEqual(listeners.length, 0, 'the module anchors nothing to the page — no listener at all');
    // The one registration property that IS load-bearing, so it is pinned even though WHICH events
    // deliberately is not. PlayerSetup's swallow calls stopPropagation from the capture phase, so a
    // bubble-phase seed would never be told about any contact inside that gate's own window — the
    // anchor would go stale exactly where it matters most and every green here would still hold.
    assert.ok(
      listeners.every((l) => l.capture === true),
      'the seed listens in the bubble phase, so a capture-phase stopPropagation upstream hides contacts from it',
    );
    await run(mod, contact);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

test('the gate anchors its first window to the tap that rendered it, not to the moment it was built', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withFakeDocument('seed-anchor', async ({ armAllButtons, ARM_DELAY_MS: delay }, contact) => {
    // Only the pointerdown fires here, deliberately. The press-duration case below feeds both, so a
    // seed that listened for pointerup ALONE would still pass it; this case is the half that reds on
    // one. Between them every event the seed must observe is covered by a case that fails without it.
    contact('pointerdown', 1000);
    // The render the tap triggered. No event in scope here — that is the whole point.
    const { stage, btn } = makeStage();
    const cancel = armAllButtons(stage);
    t.mock.timers.tick(delay + 1);
    assert.equal(btn.disabled, false, 'positive control: the quiet window armed the button');

    // The ghost, stamped inside the window and delivered after the stall. Nothing ever touched the
    // stage before it, so refusing it is possible only through the document-seeded anchor.
    stage.dispatch('pointerdown', { timeStamp: 1235.5 });
    assert.equal(btn.disabled, true, 'the first window is not anchored to the page contact that preceded the render');
    cancel();
  });
});

test('the anchor covers the whole press — a held transition tap leaves no gap for a ghost', async (t) => {
  // The press has a DURATION, and the render fires on the release: down at 1000, up at 1120. A window
  // anchored to the down alone ends at 1000 + delay while the timer it shadows starts at the release,
  // so a contact stamped in between reads as outside the window and inside the timer at once — and
  // the timer arms first under a stall. 120ms of press is an ordinary tap, not a long hold.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withFakeDocument('seed-press-duration', async ({ armAllButtons, ARM_DELAY_MS: delay }, contact) => {
    contact('pointerdown', 1000);
    contact('pointerup', 1120);
    const { stage, btn } = makeStage();
    const cancel = armAllButtons(stage);
    t.mock.timers.tick(delay + 1);
    assert.equal(btn.disabled, false, 'positive control: the quiet window armed the button');

    // 330ms after the finger left the glass — deep inside ADR-0016's hazard class, and 50ms past the
    // end of a window anchored to the pointerdown.
    stage.dispatch('pointerdown', { timeStamp: 1450 });
    assert.equal(btn.disabled, true, 'a ghost landing between the down-anchored window and the timer was let through');
    cancel();
  });
});

// ---- gh#297: two gates over one control, and a late re-hold ---------------------------------------
// Every close path re-arms its region (ADR-0057), so a modal closed inside a screen gate's renewed
// window builds a SECOND gate over controls the first still holds. The first gate's timer then arms
// and enables them inside the second gate's window. What must hold is the ghost-tap invariant: the
// ghost's own pointerdown re-holds the set before its click is dispatched.
//
// Deliberately NOT asserted: that the control stays disabled between the older arm and the ghost.
// The gate does not promise that (stated ceiling on armAfterQuiet), and pinning today's value here
// would red a later fix that does.

test('gh#297: an older gate arming inside a newer gate window cannot hand the ghost a live control', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withFakeDocument('overlap', async ({ armAllButtons, ARM_DELAY_MS: delay }, contact) => {
    let fired = 0;
    const { stage, btn } = makeStage();
    btn.addEventListener('click', () => { fired += 1; });

    contact('pointerdown', 0);
    contact('pointerup', 0);
    const cancelOlder = armAllButtons(stage); // window ends at 400
    t.mock.timers.tick(delay + 50); // t=450, armed at 400
    assert.equal(btn.disabled, false, 'positive control: the older gate armed on a quiet window');

    // A late contact stamped inside the older window: it re-holds and renews that window to 700. Its
    // timer is rescheduled to t=850 because the handler ran at t=450.
    stage.dispatch('pointerdown', { timeStamp: 300 });
    assert.equal(btn.disabled, true, 'positive control: the late contact re-held the older gate');

    // The modal close: a deliberate contact at 520..600 and a second gate over the same stage, whose
    // window runs to 1000.
    t.mock.timers.tick(150); // t=600
    contact('pointerdown', 520);
    contact('pointerup', 600);
    const cancelNewer = armAllButtons(stage);

    t.mock.timers.tick(251); // t=851: the older gate's timer arms
    // The ghost, stamped at 900, inside the newer window only.
    stage.dispatch('pointerdown', { timeStamp: 900 });
    btn.click();
    assert.equal(fired, 0, 'the ghost activated a control the newer gate still held');
    assert.equal(btn.disabled, true, 'the ghost met a live control inside the newer window');

    t.mock.timers.tick(delay + 1);
    assert.equal(btn.disabled, false, 'the newer gate never handed the control back after its window');
    cancelOlder();
    cancelNewer();
  });
});

test('gh#297: a control the caller enabled after construction is handed back after a late re-hold', (t) => {
  // The dead-control class: the gate read the control as the caller's own disable at construction,
  // the caller then enabled it, and a late re-hold disabled it again. That disable is the gate's, so
  // the gate must hand it back.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { stage, btn } = makeStage();
  btn.disabled = true;
  const cancel = armAllButtons(stage);
  stage.dispatch('pointerdown', { timeStamp: 0 });
  t.mock.timers.tick(ARM_DELAY_MS + 50);
  assert.equal(btn.disabled, true, 'positive control: the caller-disabled control was not handed back');

  btn.disabled = false; // the caller's own enable, e.g. the next turn readying it
  stage.dispatch('pointerdown', { timeStamp: 300 });
  assert.equal(btn.disabled, true, 'positive control: the late contact re-held the enabled control');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(btn.disabled, false, 'the late re-hold left a dead control');
  cancel();
});

test('gh#297: a control the caller disabled stays disabled through a late re-hold', (t) => {
  // The other half of the same set: the gate must never take over a disable it did not write. A gate
  // that drops its whole skip-set on a re-hold passes the case above and reds here.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = new FakeElement('div');
  const live = new FakeElement('button');
  const capped = new FakeElement('button');
  stage.appendChild(live);
  stage.appendChild(capped);
  capped.disabled = true; // a count pill at its cap
  const cancel = armAllButtons(stage);
  stage.dispatch('pointerdown', { timeStamp: 0 });
  t.mock.timers.tick(ARM_DELAY_MS + 50);
  assert.equal(live.disabled, false, 'positive control: the window armed the live control');

  stage.dispatch('pointerdown', { timeStamp: 300 });
  assert.equal(live.disabled, true, 'positive control: the late contact re-held');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(live.disabled, false, 'positive control: the re-held control came back');
  assert.equal(capped.disabled, true, 'the re-hold handed back a control the caller had disabled');
  cancel();
});
