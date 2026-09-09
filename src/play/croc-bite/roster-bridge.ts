// Hands the shell's roster to the engine, so a group that already typed its names once never types
// them again. Drives the engine's OWN setup controls rather than reaching into its state —
// `docs/agents/browser-verification.md` § "Seed through the trigger, never past it" records why:
// dispatching past a control skips what the control does on the way, and the result is a state no
// player can actually produce.
//
// READS THROUGH roster.ts, never through localStorage directly. ADR-0010 makes roster.ts the sole
// writer of the roster key and scripts/roster-lock-structure-check.mjs enforces that by TEXT: spelling
// the key anywhere else reds the gate. Importing the accessor is also simply better: the key name
// stays in one place, and the try/catch every storage touch needs (issue #7) already lives in read().
import { loadGroup, loadRoster } from '../../shell/roster';
// Shared with the other play routes: the chrome's edit request, and the write-back that makes
// whatever the player finishes this setup with the group the NEXT game inherits.
import { saveOnSetupComplete, takeSetupEditRequest } from '../_setup-bridge';
// The animal cast a first-time device opens with. One definition, read by every play route.
import { applyMascotDefaults } from '../_mascots';
// The ceiling, read from the rule rather than restated. This game's range is its own (ADR-0065), so
// seeding past the top pill would silently drop names.
import { MAX_PLAYERS } from '../../games/croc-bite';

const START = '#btn-start-game';
// The class renderMascotInputs puts on every field it builds. Re-queried after every drive, because
// that function empties the list and rebuilds it.
const NAME_INPUT = '.mascot-name-input';
// This setup has a SIZE GRID, not a stepper: one pill per seat count, so the seat count is reached in
// a single press instead of walked to. There is no end to bump into and no no-progress guard to keep.
const SEAT_PILL = '.count-pill';

/** Drives one of the mockup's own controls the way a player would.
 *
 *  main.js arms the ghost-tap gate on every screen it reveals (ADR-0017/ADR-0057), which ships each
 *  button on a freshly revealed screen `disabled` for the arm window. `HTMLElement.click()` on a
 *  disabled form control returns without dispatching anything and without throwing, so seeding would
 *  stop here silently and the group would be asked to type its names again. Seeding is not a tap: it
 *  is this module replaying what the player already told the device, so it clears the flag for the one
 *  call and puts it back. The gate's own timer still owns when the HUMAN may press the button. */
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

// The chrome's edit control reloads with this flag set, and reading it is what clears it. Consumed
// at MODULE SCOPE, unconditionally: this route's seeding waits for the engine's boot, and a clear
// that waits with it is a clear that never happens on a tab where the boot never comes — the next
// party game opened in that tab would then land on a setup screen nobody asked for. Read here and
// nowhere else on this route.
const editing = takeSetupEditRequest();

function seedFromRoster(): void {
  saveOnSetupComplete(START, NAME_INPUT, MAX_PLAYERS);
  const names = playingNames();
  // Fewer than two names is not a failure — it is a first-time device, and this engine already boots
  // on its own setup screen, which is exactly the right thing to show. Nothing is navigated, so the
  // edit request is honoured by simply staying here; only the names the fields open with change,
  // from the engine's placeholders to the shared cast (issue #152, ADR-0054).
  if (names.length < 2) {
    applyMascotDefaults(NAME_INPUT);
    return;
  }

  const target = Math.min(names.length, MAX_PLAYERS);
  const pill = document.querySelector<HTMLButtonElement>(`${SEAT_PILL}[data-count="${target}"]`);
  if (pill) drive(pill);

  // Re-queried after the press, never before: renderMascotInputs empties the seat list and rebuilds
  // every row, so a field captured earlier is detached by now and writing to it updates nothing.
  const inputs = document.querySelectorAll<HTMLInputElement>(NAME_INPUT);
  if (inputs.length < 2) return;
  inputs.forEach((input, i) => {
    const name = names[i];
    if (name === undefined) return;
    // Direct .value skips the attribute's maxlength — enforce it, or a long saved name overflows.
    input.value = input.maxLength > 0 ? name.slice(0, input.maxLength) : name;
    // The event is load-bearing on this route rather than habit: the engine keeps each seat's typed
    // name in its own state and rebuilds every field from THAT on the next pill press, so a
    // value-only write is erased by the first seat change the player makes.
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Editing leaves the prefilled setup screen up; that IS the edit screen, and this route needs no
  // navigation to reach it because it boots there. The flag was already consumed above.
  if (editing) return;
  // Started on every device, including one that never got a 3D context. This used to stop on the
  // engine's no-3D notice, because a match started behind it raised a HUD naming whose turn it was
  // over a board that would never be drawn. The route no longer leaves the player there: the round
  // lifecycle is wired whether or not the 3D stack was built, and main.ts puts the DOM tooth board up
  // in place of that notice, so the match this starts is one the group can actually play (ADR-0051).
  // main.ts's mount runs after this in the same DOMContentLoaded dispatch, so the board is installed
  // from the state this press has already moved, with nothing observable in between.
  const start = document.querySelector<HTMLButtonElement>(START);
  if (start) drive(start);
}

// WINDOW's DOMContentLoaded, and never `document`'s. The engine registers its own boot on `window`
// and main.js is imported first, so its listener is ahead of this one and `__khengApp` — with every
// seat field built — exists by the time this runs. A `document` listener runs before ANY window
// listener, and so does the readyState-immediate branch the other bridges take: both would seed a
// setup screen that has not rendered a single field yet. `docs/agents/porting-a-mockup-game.md` names
// this engine for exactly that class of bug.
if ((window as unknown as { __khengApp?: unknown }).__khengApp !== undefined) {
  seedFromRoster();
} else {
  window.addEventListener('DOMContentLoaded', seedFromRoster, { once: true });
}
