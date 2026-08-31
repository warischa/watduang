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

// This game's setup is a single screen, so the completion control is unambiguous — unlike
// power-meter, where one id is reused across screens and only the action tells them apart.
const START = '[data-act="start"]';
const NAME_INPUT = '.name-input';

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
  saveOnSetupComplete(START, NAME_INPUT);
  // The chrome's edit control reloads with this flag set. Same seeding, one difference: the setup
  // screen is left ON SCREEN, prefilled, instead of being started — that IS the edit screen.
  const editing = takeSetupEditRequest();
  const names = playingNames();
  // Fewer than two names is not a failure — it is a first-time device, and the mockup's own setup
  // screen is exactly the right thing to show. Bail and leave it alone.
  if (names.length < 2) return;

  const count = document.querySelector<HTMLInputElement>('#count');
  if (!count) return;
  // The field's own bounds, read off the DOM rather than restating 2-10 a second time: main.js
  // rejects anything outside them, so a seed past the cap would silently do nothing.
  const target = Math.min(names.length, 10);
  count.value = String(target);
  // `change`, not `input`: main.js validates on input but only RESIZES the roster on change, and the
  // name fields this function is about to fill do not exist until that resize re-renders them.
  count.dispatchEvent(new Event('change', { bubbles: true }));

  // Re-queried after the dispatch, never before. main.js rebuilds the panel through innerHTML, so
  // any field captured earlier is detached by now and writing to it updates nothing on screen.
  const inputs = document.querySelectorAll<HTMLInputElement>(NAME_INPUT);
  if (inputs.length < 2) return;
  inputs.forEach((input, i) => {
    if (i >= names.length) return;
    // Direct .value skips the attribute's maxlength — enforce it, or a long saved name overflows.
    input.value = input.maxLength > 0 ? names[i]!.slice(0, input.maxLength) : names[i]!;
    // Bubbling, because main.js listens for `input` on the document, not on the field.
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  if (editing) return;
  // validateCount() owns #start.disabled on this route, and drive() hands that ownership straight
  // back: it restores whatever it found, so a start button this bridge unlocked for one call is
  // disabled again the moment the call returns.
  const start = document.querySelector<HTMLButtonElement>(START);
  if (start) drive(start);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', seedFromRoster, { once: true });
} else {
  seedFromRoster();
}
