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
// Shared with the other play routes: the chrome's edit request, and the write-back that makes whatever
// the player finishes this setup with the group the NEXT game inherits.
import { saveOnSetupComplete, takeSetupEditRequest } from '../_setup-bridge';

const START = '#btn-begin-game';
const NAME_INPUT = '.player-input';
// This mockup opens on a marketing hero, not on its setup screen — unlike the other three. Its setup
// view only exists after this control renders it, so every path below goes through here first.
const OPEN_SETUP = '#btn-start-setup';
const ADD_PLAYER = '#btn-add-player';
const REMOVE_PLAYER = '.remove-p-btn';
// The mockup's own ceiling (loadDraft slices to 10, btn-add-player stops at 10) and the manifest's
// `players: [2, 10]` agree, so seeding never asks for a seat the setup would refuse.
const MAX_PLAYERS = 10;

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
  // Fewer than two names is not a failure — it is a first-time device, and the mockup's own hero and
  // setup screen are exactly the right thing to show. Bail and leave it alone.
  if (names.length < 2) return;

  const openSetup = document.querySelector<HTMLElement>(OPEN_SETUP);
  if (!openSetup) return;
  openSetup.click();

  const target = Math.min(names.length, MAX_PLAYERS);

  // renderSetup() rebuilds #player-inputs-container wholesale on every add and every remove, so each
  // iteration re-queries the live nodes instead of clicking a detached reference. Capped at 40 presses
  // so a control that stops responding ends the loop instead of spinning forever — a hang here would
  // look like a broken game. Removal takes the LAST row, so the seats that survive keep their order.
  for (let i = 0; i < 40; i += 1) {
    const rows = document.querySelectorAll<HTMLInputElement>(NAME_INPUT);
    if (rows.length === target) break;
    if (rows.length < target) {
      const add = document.querySelector<HTMLButtonElement>(ADD_PLAYER);
      if (!add || add.disabled) break;
      add.click();
    } else {
      const removes = document.querySelectorAll<HTMLButtonElement>(REMOVE_PLAYER);
      const last = removes[removes.length - 1];
      // Disabled at two seats by the mockup; target is never below two, so this is a stuck control.
      if (!last || last.disabled) break;
      last.click();
    }
  }

  // The final render owns however many rows it actually drew; fill only those.
  const inputs = document.querySelectorAll<HTMLInputElement>(NAME_INPUT);
  inputs.forEach((input, i) => {
    if (i >= names.length) return;
    // Direct .value skips the attribute's maxlength — enforce it, or a long saved name overflows.
    input.value = input.maxLength > 0 ? names[i].slice(0, input.maxLength) : names[i];
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const start = document.querySelector<HTMLElement>(START);
  if (!editing && inputs.length >= 2) start?.click();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', seedFromRoster, { once: true });
} else {
  seedFromRoster();
}
