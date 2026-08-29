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

  // The mockup renders one count button per supported size and nothing outside that range, so read
  // the range off the buttons it actually drew instead of hardcoding 2-10 a second time.
  const countBtns = document.querySelectorAll<HTMLButtonElement>('.count-btn[data-arg]');
  if (countBtns.length === 0) return;
  const sizes = [...countBtns].map((b) => Number(b.dataset.arg));
  const target = Math.min(names.length, Math.max(...sizes));
  const countBtn = [...countBtns].find((b) => Number(b.dataset.arg) === target);
  if (!countBtn) return;

  // EVERY control is re-queried after every click. main.js re-renders #view-root by replacing its
  // innerHTML, so a node captured before a click is detached by the time the next one is due — and a
  // click on a detached node never reaches the document-level dispatcher, so it silently does nothing.
  countBtn.click();

  const next = document.getElementById('btn-primary-action');
  if (!next) return;
  next.click();

  const inputs = document.querySelectorAll<HTMLInputElement>('.name-input');
  if (inputs.length < 2) return;
  inputs.forEach((input, i) => {
    if (i >= names.length) return;
    // Direct .value skips the attribute's maxlength — enforce it, or a long saved name overflows.
    input.value = input.maxLength > 0 ? names[i].slice(0, input.maxLength) : names[i];
    // Bubbling, because main.js listens for `input` on the document, not on the field.
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const start = document.getElementById('btn-primary-action');
  start?.click();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', seedFromRoster, { once: true });
} else {
  seedFromRoster();
}
