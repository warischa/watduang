// ADR-0024's second property on BOTH shared-screen dialogs (gh#279): when showModal is missing, the
// action a dialog guards never runs without the player being asked. Driven over the real screen in
// the DOM harness with showModal removed from the dialog element, exactly as a browser without the
// method would present it.
//
//   reset dialog -> a reset tap leaves every typed name and every storage write untouched
//   edit dialog  -> a mid-round edit tap leaves the round running (abortRound is never called)
//
// What is graded is the outcome, not how the screen gets there: it may throw (it does today) or it
// may bail out early, and both pass. The first property, that both are real <dialog> elements, is
// pinned statically by scripts/player-screen-dialog-check.mjs.
//
// Every case has a control on the SAME page shape with showModal present. The control proves the tap
// is past the arm window and reaches the handler, and that the instrument can see the destructive
// outcome (confirm changes the names, confirm aborts the round) -- without it a green here could be
// a gated tap that never reached anything.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountOnPage, settle } from './screen-harness.mjs';

const ROUTE = '<div id="ps-root" hidden></div>';
const QUIET = 400;
const expire = (t) => t.mock.timers.tick(QUIET + 1);

/** Storage writes made after mount: the harness's storage is closed over, so wrap its mutators. */
function recordWrites() {
  const writes = [];
  for (const fn of ['setItem', 'removeItem']) {
    const real = globalThis.localStorage[fn];
    globalThis.localStorage[fn] = (...args) => {
      writes.push([fn, ...args]);
      return real(...args);
    };
  }
  return writes;
}

const nameFields = (page) => page.root.querySelectorAll('.ps-n');
const typedNames = (page) => nameFields(page).map((f) => f.value);
const typeInto = (field, value) => {
  field.value = value;
  field.dispatchEvent({ type: 'input' });
};

/** The tap a player makes. A browser reports a throwing handler and carries on; the harness lets it
 *  propagate, so it is swallowed here -- the property is about what did NOT happen afterwards. */
function tap(el) {
  try {
    return el.click();
  } catch {
    return true;
  }
}

async function openFirstVisit(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const page = await mountOnPage({ routeMarkup: ROUTE, rootId: 'ps-root' });
  page.screen.open();
  await settle();
  nameFields(page).forEach((f, i) => typeInto(f, `typed${i}`));
  expire(t);
  return page;
}

test('control: with showModal present a reset tap asks first, and the confirm is what wipes the names', async (t) => {
  const page = await openFirstVisit(t);
  const dialog = page.byId('ps-reset-dialog');
  assert.ok(typedNames(page).every((n) => n.startsWith('typed')), 'the fields start off-cast');
  assert.equal(page.part('reset').click(), true, 'the tap is live');
  assert.equal(dialog.open, true, 'the reset tap asks');
  assert.ok(typedNames(page).every((n) => n.startsWith('typed')), 'asking wipes nothing');
  expire(t);
  page.byId('ps-reset-confirm').click();
  assert.ok(typedNames(page).every((n) => !n.startsWith('typed')), 'the confirm is what wipes -- the instrument can see it');
});

test('ADR-0024 property 2, reset dialog: with no showModal a reset tap leaves every name and all storage untouched', async (t) => {
  const page = await openFirstVisit(t);
  const writes = recordWrites();
  const before = typedNames(page);
  page.byId('ps-reset-dialog').showModal = undefined;
  assert.equal(tap(page.part('reset')), true, 'the tap reached the handler -- it was past the arm window');
  assert.deepEqual(typedNames(page), before, 'a reset ran without the player being asked');
  assert.deepEqual(writes, [], 'storage was written without the player being asked');
  assert.equal(page.byId('ps-reset-dialog').open, false);
});

test('control: with showModal present a mid-round edit tap asks first, and the confirm is what ends the round', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const page = await mountOnPage({ routeMarkup: ROUTE, rootId: 'ps-root', roster: ['ต้น', 'มายด์'], round: true });
  page.doc.dispatchEvent({ type: page.ps.EDIT_EVENT });
  assert.equal(page.byId('ps-edit-dialog').open, true, 'the edit tap asks');
  assert.equal(page.calls.aborted, 0, 'asking ends nothing');
  expire(t);
  page.byId('ps-edit-confirm').click();
  await settle();
  assert.equal(page.calls.aborted, 1, 'the confirm is what ends the round -- the instrument can see it');
});

test('ADR-0024 property 2, edit dialog: with no showModal a mid-round edit tap leaves the round active', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const page = await mountOnPage({ routeMarkup: ROUTE, rootId: 'ps-root', roster: ['ต้น', 'มายด์'], round: true });
  const writes = recordWrites();
  page.byId('ps-edit-dialog').showModal = undefined;
  try {
    page.doc.dispatchEvent({ type: page.ps.EDIT_EVENT });
  } catch {
    // The browser reports a throwing listener and carries on; the harness propagates it.
  }
  await settle();
  assert.equal(page.calls.aborted, 0, 'the round was aborted without the player being asked');
  assert.equal(page.live.round, true, 'the round is no longer active');
  assert.equal(page.calls.opened, 0, 'the screen was opened over a live round without asking');
  assert.equal(page.root.hidden, true, 'the player screen came up over a live round');
  assert.deepEqual(writes, [], 'storage was written without the player being asked');
});
