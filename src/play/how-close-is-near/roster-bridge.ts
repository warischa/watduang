// Hands the shell's roster to the mockup, so a group that already typed its names once never types
// them again. Runs AFTER main.js, because it drives that module's own setup controls rather than
// reaching into its state — `docs/agents/browser-verification.md` § "Seed through the trigger, never
// past it" records why: dispatching past a control skips what the control does on the way, and the
// result is a state no player can actually produce.
//
// READS THROUGH roster.ts, never through localStorage directly. ADR-0010 makes roster.ts the sole
// writer of the roster key and scripts/roster-lock-structure-check.mjs enforces that by TEXT.
import { loadGroup, loadRoster } from '../../shell/roster';
import { saveOnSetupComplete, takeSetupEditRequest } from '../_setup-bridge';

// WHERE THE SEEDING STOPS, and why it is not the same control as the other play routes'. This
// mockup's setup is three screens: count -> names -> lose condition. The lose condition is a
// decision the table makes out loud (nearest-loses or farthest-loses this round?) and there is no
// right default to pick on their behalf, so the bridge fills the two screens it has answers for and
// leaves the third on screen. It never auto-starts the match.
const NAME_INPUT = '.player-text-input';
// The control that COMPLETES the names screen, and therefore the last moment the typed names are
// still in the DOM for saveOnSetupComplete to read. A later control would read zero inputs.
const NAMES_DONE = '#btnNextNames';

/** Drives one of the mockup's own controls the way a player would.
 *
 *  main.js now arms the ghost-tap gate on the panels it reveals (ADR-0017), which ships every button
 *  on a freshly revealed panel `disabled` for 400ms. `HTMLElement.click()` on a disabled form control
 *  returns without dispatching anything and without throwing, so seeding would stop here silently and
 *  the group would be asked to type its names again. Seeding is not a tap: it is this module replaying
 *  what the player already told the device, so it clears the flag for the one call and puts it back.
 *  The gate's own timer still owns when the HUMAN may press the button. Safe on a non-button element:
 *  reading `.disabled` off one yields undefined, which is not `=== true`, so the plain-click path runs
 *  and nothing is written back. */
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

function seedFromRoster(): void {
  saveOnSetupComplete(NAMES_DONE, NAME_INPUT);
  // The chrome's edit control reloads with this flag set. Same seeding, one difference: the names
  // screen is left ON SCREEN, prefilled, instead of being advanced past — that IS the edit screen.
  const editing = takeSetupEditRequest();
  const names = playingNames();
  // Fewer than two names is not a failure — it is a first-time device, and the mockup's own setup
  // screen is exactly the right thing to show. Bail and leave it alone.
  if (names.length < 2) return;

  // The mockup renders one chip per supported size and nothing outside that range, so read the range
  // off the chips it actually drew instead of hardcoding 2-10 a second time. They carry no data
  // attribute, so position is the key: the grid is built by a `for (i = 2; i <= 10)` loop, in order.
  const chips = [...document.querySelectorAll<HTMLButtonElement>('#countGrid .count-chip')];
  if (chips.length === 0) return;
  const smallest = 2;
  const target = Math.min(names.length, smallest + chips.length - 1);
  const chip = chips[target - smallest];
  if (!chip) return;

  // EVERY control is re-queried after every click. main.js re-renders the screen container by
  // replacing its children, so a node captured before a click is detached by the time the next one is
  // due, and this mockup binds its handlers per node — a click on a detached node reaches nothing.
  drive(chip);

  const toNames = document.getElementById('btnNextCount');
  if (!toNames) return;
  drive(toNames);

  const inputs = document.querySelectorAll<HTMLInputElement>(NAME_INPUT);
  if (inputs.length < 2) return;
  inputs.forEach((input, i) => {
    if (i >= names.length) return;
    // Direct .value skips the attribute's maxlength — enforce it, or a long saved name overflows.
    input.value = input.maxLength > 0 ? names[i].slice(0, input.maxLength) : names[i];
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  if (editing) return;
  // Advance to the lose-condition screen and stop there: see the note at the top of this file.
  const nextNames = document.getElementById('btnNextNames');
  if (nextNames) drive(nextNames);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', seedFromRoster, { once: true });
} else {
  seedFromRoster();
}
