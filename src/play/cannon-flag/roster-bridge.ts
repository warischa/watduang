// Hands the shell's roster to the mockup, so a group that already typed its names once never types
// them again. Runs AFTER main.js, because it drives that module's own setup controls rather than
// reaching into its state — `docs/agents/browser-verification.md` § "Seed through the trigger, never
// past it" records why: dispatching past a control skips what the control does on the way, and the
// result is a state no player can actually produce.
//
// READS THROUGH roster.ts, never through localStorage directly. ADR-0010 makes roster.ts the sole
// writer of the roster key and scripts/roster-lock-structure-check.mjs enforces that by TEXT: spelling
// the key anywhere else reds the gate. It red twice on this file — first when the key was hardcoded
// here, then again when this very comment quoted it, because a text checker cannot tell a use from a
// mention. Both were the gate working. Importing the accessor is also simply better: the key name
// stays in one place, and the try/catch every storage touch needs (issue #7) already lives in read().
import { loadGroup, loadRoster } from '../../shell/roster';

/** The group is the subset the player last ticked; the roster is everyone this device knows. */
function playingNames(): string[] {
  const group = loadGroup();
  if (group.length >= 2) return group;
  return loadRoster().names();
}

function seedFromRoster(): void {
  const names = playingNames();
  // Fewer than two names is not a failure — it is a first-time device, and the mockup's own setup
  // screen is exactly the right thing to show. Bail and leave it alone.
  if (names.length < 2) return;

  const display = document.getElementById('display-player-count');
  const inc = document.getElementById('btn-inc-players');
  const dec = document.getElementById('btn-dec-players');
  const container = document.getElementById('player-names-container');
  const start = document.getElementById('btn-start-match');
  if (!display || !inc || !dec || !container || !start) return;

  // Walk the counter with its own buttons. Capped at 40 presses so a control that stops responding
  // ends the loop instead of spinning forever — a hang here would look like a broken game.
  const target = names.length;
  for (let i = 0; i < 40; i += 1) {
    const current = Number.parseInt(display.textContent ?? '', 10);
    if (!Number.isFinite(current) || current === target) break;
    (current < target ? inc : dec).click();
  }

  // The mockup owns its own min/max. If it clamped the count somewhere else, fill only the rows it
  // actually rendered rather than forcing a number it refused.
  const inputs = container.querySelectorAll<HTMLInputElement>('.player-name-input');
  inputs.forEach((input, i) => {
    if (i >= names.length) return;
    input.value = names[i];
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  if (inputs.length >= 2) start.click();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', seedFromRoster, { once: true });
} else {
  seedFromRoster();
}
