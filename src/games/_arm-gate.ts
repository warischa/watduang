// Ghost-tap gate — the second contact of a double-tap aimed at the screen that just went away must
// never activate the control that replaced it. Shared by short-stick and timebomb so the two cannot
// drift apart; the underscore keeps it out of the game page's lazy-loader glob (`!../../games/_*.ts`),
// the same way _template.ts stays out of it.
//
// ADR-0014 rejected both geometric guards for this class: a layout guard's y-bound swings 323→683px
// across rosters 2..8 and never converges, and a spatial guard has to tell a stale tap from a
// deliberate one using browser-owned signals. This gate classifies nothing — it disables everything
// for a fixed window we own, which is why it converges where those two could not.

/** ponytail: one constant, no per-game tuning, no options bag. 400ms rests on two assumptions —
 *  (1) a human double-tap's second contact lands under ~500ms, and (2) the gated control has no
 *  legitimate sub-500ms follow-up tap, because on the paths gated here the phone is in transit
 *  between two people. Assumption (2) holds PER CONTROL, not per game — a control one player taps
 *  twice in a row (rapid-fire rounds, a hold-and-repeat) needs its real inter-tap gap measured
 *  before it is gated, not this number copied. Two such controls are already known and deliberately
 *  left ungated: daily-fortune's roster chips and pick-loser's #pl-pick. Read
 *  `docs/adr/0016-a-gate-that-classifies-nothing-converges.md` § "Known premise exceptions"
 *  before gating anything new.
 *
 *  Second accepted ceiling: deferral is uncapped. Every pointerdown adds another 400ms, so a finger
 *  resting or fidgeting inside the stage keeps the controls disabled for as long as it stays down.
 *  Left uncapped on purpose — it fails closed and it is visible (the controls look disabled), and a
 *  player who cannot tap simply lifts their finger. Cap the total deferral only if a real player is
 *  ever observed stuck behind it; a cap is the thing that would let a ghost through. */
export const ARM_DELAY_MS = 400;

/** Renders `controls` inert — natively `disabled`, so they look inert as well as behave inert —
 *  until `stage` has been quiet for ARM_DELAY_MS. Any pointerdown inside the stage restarts the
 *  window, so the gate fails closed: a ghost tap costs one deliberate re-tap, never a stolen action.
 *  Returns a canceller the caller pushes onto its own teardown list. */
function armAfterQuiet(stage: HTMLElement, controls: readonly HTMLButtonElement[]): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  for (const control of controls) control.disabled = true;

  const arm = (): void => {
    stage.removeEventListener('pointerdown', restart);
    for (const control of controls) control.disabled = false;
  };
  const restart = (): void => {
    clearTimeout(timer);
    timer = setTimeout(arm, ARM_DELAY_MS);
  };

  // scripts/arm-gate-coverage-check.mjs gates COVERAGE (every render function arms its buttons via
  // armAllButtons). The physical fact this restart leg rests on — a real touch on a `disabled`
  // button still bubbles pointerdown to #stage — is proven only by the manual scripts/arm-gate-probe.mjs.
  stage.addEventListener('pointerdown', restart);
  restart();

  return () => {
    clearTimeout(timer);
    stage.removeEventListener('pointerdown', restart);
  };
}

/** Same fail-closed gate as armAfterQuiet, but the control list is discovered instead of named: walks
 *  `stage`'s current children for every rendered <button> and gates all of them except `except`. This
 *  exists so the gate is self-maintaining — a button a render function adds later is picked up on the
 *  next call automatically, with no call site to edit, so a new control cannot silently ship ungated
 *  the way a hand-written `[a, b, c]` list would let it (issue #42). */
export function armAllButtons(stage: HTMLElement, except: readonly HTMLButtonElement[] = []): () => void {
  const found: HTMLButtonElement[] = [];
  const walk = (node: Element): void => {
    for (let i = 0; i < node.children.length; i++) {
      const kid = node.children[i];
      if (kid.tagName.toUpperCase() === 'BUTTON') found.push(kid as HTMLButtonElement);
      walk(kid);
    }
  };
  walk(stage);
  return armAfterQuiet(stage, found.filter((btn) => !except.includes(btn)));
}
