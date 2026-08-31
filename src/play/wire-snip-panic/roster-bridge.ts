// Hands the shell's roster to the mockup, so a group that already typed its names once never types
// them again. Runs AFTER main.js, because it drives that module's own setup controls rather than
// reaching into its state — `docs/agents/browser-verification.md` § "Seed through the trigger, never
// past it" records why: dispatching past a control skips what the control does on the way, and the
// result is a state no player can actually produce.
//
// READS THROUGH roster.ts, never through localStorage directly. ADR-0010 makes roster.ts the sole
// writer of the roster key and scripts/roster-lock-structure-check.mjs enforces that by TEXT: spelling
// the key anywhere else reds the gate. Importing the accessor is also simply better: the key name
// stays in one place, and the try/catch every storage touch needs (issue #7) already lives in read().
import { loadGroup, loadRoster } from '../../shell/roster';
// Shared with the other play routes: the chrome's edit request, and the write-back that makes
// whatever the player finishes this setup with the group the NEXT game inherits.
import { saveOnSetupComplete, takeSetupEditRequest } from '../_setup-bridge';
// The ceiling, read from the rule rather than restated. The mockup's own add-player handler refuses
// an eleventh seat, so seeding past this would silently drop the tail of a longer roster.
import { MAX_PLAYERS } from '../../games/wire-snip-panic';

// THIS SETUP IS AN ADD/REMOVE LIST, not the count stepper the other ports drive. Two consequences the
// selectors below encode:
//
//  1. The seat fields and the "new player" field share the class `player-input`. Only the seat fields
//     live inside #player-list-container, so every selector that means "a seat" is scoped to it.
//     Unscoped, saveOnSetupComplete would persist whatever half-typed text sits in the add field.
//  2. The setup screen is not the first screen — the mockup opens on its menu, and
//     renderSetupPlayerList() runs only from the #btn-menu-start handler. There are no seat fields to
//     seed until that control has been pressed.
const START = '#btn-start-match';
const OPEN_SETUP = '#btn-menu-start';
const NAME_INPUT = '#player-list-container .player-input';
const NEW_NAME_INPUT = '#input-new-player';
const ADD = '#btn-add-player';
const REMOVE = '#player-list-container .player-remove-btn';

/** Drives one of the mockup's own controls the way a player would.
 *
 *  main.js now arms the ghost-tap gate on every reveal path (ADR-0017), which ships the controls this
 *  module presses `disabled` for 400ms. `HTMLElement.click()` on a disabled form control returns
 *  without dispatching anything and without throwing, so seeding would silently stop and a saved
 *  group would be asked to type its names again -- no error, no exception, no failing test. Seeding
 *  is not a tap: it is this module replaying what the player already told the device, so it clears
 *  the flag for the one call and puts it back. The gate's own timer still owns when the HUMAN may
 *  press the button.
 *
 *  Non-button elements take the plain path: reading `.disabled` off an element that has no such IDL
 *  attribute yields `undefined`, which is not `=== true`, so nothing is written and nothing is
 *  restored. Every one of this file's four call sites is a real <button> in markup.html, so that leg
 *  is not exercised here -- it is kept identical to the shape cannon-flag and power-meter settled on
 *  so the three cannot drift. */
function drive(el: HTMLElement): void {
  const btn = el as HTMLButtonElement;
  const wasDisabled = btn.disabled === true;
  if (wasDisabled) btn.disabled = false;
  el.click();
  if (wasDisabled) btn.disabled = true;
}

/** The group is the subset the player last ticked; the roster is everyone this device knows. */
function playingNames(): string[] {
  const group = loadGroup();
  if (group.length >= 2) return group;
  return loadRoster().names();
}

/** How many seats the setup screen is showing RIGHT NOW, read off the DOM rather than from a counter
 *  of our own: renderSetupPlayerList() rebuilds this list through innerHTML on every add and every
 *  remove, so the field count is the one value that cannot drift from what the player would see. */
function seatCount(): number {
  return document.querySelectorAll(NAME_INPUT).length;
}

/** Direct .value skips the attribute's maxlength — enforce it, or a long saved name overflows. */
function fill(input: HTMLInputElement, name: string): void {
  input.value = input.maxLength > 0 ? name.slice(0, input.maxLength) : name;
}

/** Grows or shrinks the list to `target` seats using the mockup's own two controls.
 *
 *  Shrinking removes the LAST row, so a seat the player already sees keeps its position. Growing goes
 *  through the add field rather than appending a blank and renaming it afterwards: #btn-add-player
 *  substitutes its own numbered placeholder label for an empty field, and that placeholder would then
 *  be the value saveOnSetupComplete reads back if anything interrupted the naming pass.
 *
 *  Bounded by MAX_PLAYERS, which is the widest the list can travel (2..10 is nine steps). The bound is
 *  a guard against a control that stops moving — the mockup refuses to remove below 2 and to add above
 *  the ceiling by design — not a retry budget: without it a target neither control can reach spins
 *  forever. */
function resize(target: number, names: string[]): void {
  const add = document.querySelector<HTMLButtonElement>(ADD);
  const newName = document.querySelector<HTMLInputElement>(NEW_NAME_INPUT);
  if (!add || !newName) return;

  for (let guard = 0; guard <= MAX_PLAYERS && seatCount() !== target; guard++) {
    if (seatCount() > target) {
      // Re-queried every pass, never cached: the remove handler re-renders the whole container
      // through innerHTML, so a button captured before the click is detached by the time it returns.
      const buttons = document.querySelectorAll<HTMLButtonElement>(REMOVE);
      const last = buttons[buttons.length - 1];
      if (!last) return;
      drive(last);
    } else {
      const name = names[seatCount()];
      if (name === undefined) return;
      fill(newName, name);
      drive(add);
    }
  }
}

function seedFromRoster(): void {
  saveOnSetupComplete(START, NAME_INPUT);
  // The chrome's edit control reloads with this flag set. Same seeding, one difference: the setup
  // screen is left ON SCREEN, prefilled, instead of being started — that IS the edit screen.
  const editing = takeSetupEditRequest();
  const names = playingNames();

  // Fewer than two names is not a failure — it is a first-time device, and the mockup's own menu is
  // exactly the right thing to show. Bail and leave it alone, EXCEPT on an explicit edit request:
  // there the player pressed a control asking for the setup screen, and leaving them on the menu
  // would make that control do nothing visible.
  if (names.length < 2 && !editing) return;

  // Unlike the count-stepper ports, this one has to press a control before it has anything to seed:
  // the seat fields do not exist until #btn-menu-start renders them.
  const openSetup = document.querySelector<HTMLButtonElement>(OPEN_SETUP);
  if (openSetup) drive(openSetup);
  if (names.length < 2) return;

  resize(Math.min(names.length, MAX_PLAYERS), names);

  // Re-queried after the resize, never before — see resize()'s note on innerHTML.
  const inputs = document.querySelectorAll<HTMLInputElement>(NAME_INPUT);
  if (inputs.length < 2) return;
  inputs.forEach((input, i) => {
    const name = names[i];
    if (name === undefined) return;
    fill(input, name);
    // `change`, which is what this mockup binds on each seat field — not `input`, which no listener
    // here is watching. Without it the field shows the name while the game's own array still holds
    // the default, and the round would announce the wrong player.
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  if (editing) return;
  const start = document.querySelector<HTMLButtonElement>(START);
  if (start) drive(start);
}

// WINDOW, and DOMContentLoaded, and neither is interchangeable here. This mockup is the only one of
// the ported set that defers its own wiring: src/play/wire-snip-panic/main.js attaches every listener
// inside `window.addEventListener('DOMContentLoaded', ...)`, where the others attach at module-body
// time. Two consequences, both measured in a browser rather than reasoned about — seeding ran before
// a single control was wired, so every click below silently did nothing and the route opened on its
// menu with the group already saved:
//
//  * Not `document`. DOMContentLoaded is dispatched AT the document and bubbles to the window, so a
//    document listener runs in the target phase — ahead of every window listener, including main.js's.
//  * Not an immediate call. A bundled module is deferred: it executes while readyState is already
//    'interactive', BEFORE DOMContentLoaded fires, which is why the other bridges' straight-line call
//    works for them and cannot work here.
//
// Both listeners are on the window, and main.js is imported first in play.astro, so it registers first
// and therefore runs first. That import order was already load-bearing and is commented as such there.
// 'complete' is the one state in which DOMContentLoaded has demonstrably already fired (a bfcache
// restore, or a late injection): main.js has run, so seed straight away.
if (document.readyState === 'complete') {
  seedFromRoster();
} else {
  window.addEventListener('DOMContentLoaded', seedFromRoster, { once: true });
}
