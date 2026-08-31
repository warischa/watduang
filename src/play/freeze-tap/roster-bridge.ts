// Hands the shell's roster to the mockup, so a group that already typed its names once never types
// them again. Runs AFTER main.js, because it drives that module's own setup controls rather than
// reaching into its state — `docs/agents/browser-verification.md` § "Seed through the trigger, never
// past it" records why: dispatching past a control skips what the control does on the way, and the
// result is a state no player can actually produce.
//
// READS THROUGH roster.ts, never through localStorage directly. ADR-0010 makes roster.ts the sole
// writer of the roster key and scripts/roster-lock-structure-check.mjs enforces that by TEXT: spelling
// the key anywhere else reds the gate. Importing the accessor keeps the key name in one place, and the
// try/catch every storage touch needs (issue #7) already lives in read().
import { loadGroup, loadRoster } from '../../shell/roster';
// Shared with the other two play routes: the chrome's edit request, and the write-back that makes
// whatever the player finishes this setup with the group the NEXT game inherits.
import { saveOnSetupComplete, takeSetupEditRequest } from '../_setup-bridge';

const START = '#startGameBtn';
const NAME_INPUT = '.roster-input';

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
  // The chrome's edit control reloads with this flag set. Same seeding, one difference: the setup is
  // left ON SCREEN, prefilled, instead of being started — that IS the edit screen.
  const editing = takeSetupEditRequest();
  const names = playingNames();
  // Fewer than two names is not a failure — it is a first-time device, and the mockup's own setup
  // screen is exactly the right thing to show. Bail and leave it alone.
  if (names.length < 2) return;

  // The mockup clamps player count to 2-20 (FreezeTapEngine.setPlayerCount); target inside that range
  // rather than forcing a number it refused.
  const target = Math.min(names.length, 20);

  // decPlayerBtn/incPlayerBtn and .count-display are torn down and rebuilt on every count change
  // (renderSetupScreen() replaces mainContent.innerHTML wholesale), so each iteration re-queries the
  // live nodes instead of clicking a detached reference. Capped at 40 presses so a control that stops
  // responding ends the loop instead of spinning forever — a hang here would look like a broken game.
  for (let i = 0; i < 40; i += 1) {
    const display = document.querySelector('.count-display');
    const inc = document.getElementById('incPlayerBtn');
    const dec = document.getElementById('decPlayerBtn');
    if (!display || !inc || !dec) return;
    const current = Number.parseInt(display.textContent ?? '', 10);
    if (!Number.isFinite(current) || current === target) break;
    drive(current < target ? inc : dec);
  }

  // The final render owns however many .roster-input rows it actually drew; fill only those.
  const inputs = document.querySelectorAll<HTMLInputElement>(NAME_INPUT);
  inputs.forEach((input, i) => {
    if (i >= names.length) return;
    // Direct .value skips the attribute's maxlength — enforce it, or a long saved name overflows.
    input.value = input.maxLength > 0 ? names[i].slice(0, input.maxLength) : names[i];
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const start = document.querySelector<HTMLElement>(START);
  if (!editing && inputs.length >= 2 && start) drive(start);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', seedFromRoster, { once: true });
} else {
  seedFromRoster();
}
