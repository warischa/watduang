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
 *  (1) a human double-tap's second contact lands under ~500ms, and (2) neither game has a legitimate
 *  sub-500ms follow-up tap, because between any two consequential taps the phone is physically in
 *  transit between two people. Assumption (2) is what a future change breaks first: a game where one
 *  player taps twice in a row (rapid-fire rounds, a hold-and-repeat control) needs its real inter-tap
 *  gap measured before reusing this, not this number copied.
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
export function armAfterQuiet(stage: HTMLElement, controls: readonly HTMLButtonElement[]): () => void {
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

  stage.addEventListener('pointerdown', restart);
  restart();

  return () => {
    clearTimeout(timer);
    stage.removeEventListener('pointerdown', restart);
  };
}
