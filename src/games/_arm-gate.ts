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
 *  before it is gated, not this number copied. One such control is still recorded as deliberately
 *  left ungated on this reasoning: daily-fortune's roster chips. The second, a party game's pick
 *  button, went with its page in gh#154. Read
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
/** Which `disabled` writes came from THIS module. gh#188's follow-up: a construction-time snapshot of
 *  `control.disabled` cannot tell the caller's own intent from a previous gate's disable-all residue,
 *  and the canceller below arms nothing, so cancel-then-rearm on the same non-rebuilt nodes stranded
 *  every control permanently -- gate 1 disabled them, the disarmer left them that way, gate 2 read
 *  that as caller intent and handed back nothing. That is a dead overlay with a dead close button.
 *
 *  This set is the missing distinction rather than a patch on the path that produced it. The
 *  alternative considered -- having the canceller re-enable the complement of the owned set -- fixes
 *  only the cancel path, needs a second flag to avoid re-enabling a control `onArm` deliberately
 *  disabled after the window closed, and still misclassifies residue from two live gates whose
 *  control sets overlap (a screen gate and a panel gate inside it, which this repo does have).
 *
 *  ponytail: a WeakSet, so a removed node is collected with no bookkeeping and no teardown call.
 *  Stated ceiling: a caller that disables a control DURING an open window is invisible here -- the
 *  control is already marked gate-disabled, so `arm` hands it back enabled. That case is what `onArm`
 *  is for and it is unchanged by this. */
const gateDisabled = new WeakSet<HTMLButtonElement>();

function armAfterQuiet(
  stage: HTMLElement,
  controls: readonly HTMLButtonElement[],
  onArm?: () => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // gh#188. The re-enable below used to be blanket, so a control the CALLER had already disabled for
  // its own reason -- a count pill at its cap, a straw already drawn, a scan button mid-sequence --
  // came back enabled when the window closed. Reading the state here makes the caller's own state the
  // exception list, computed at arm time: no call site changes, and nothing is hand-listed, so a
  // control disabled inside a render loop (short-stick's straw grid) cannot rot it. This is narrower
  // than `except`, which opts a control out of the gate entirely; here the control is still gated,
  // it simply is not handed back enabled.
  //
  // `!gateDisabled.has` is what makes it a read of INTENT rather than of state: a control this module
  // disabled and never re-enabled is residue, never an instruction.
  const ownedDisabled = controls.filter((control) => control.disabled && !gateDisabled.has(control));
  for (const control of controls) {
    if (!control.disabled) gateDisabled.add(control);
    control.disabled = true;
  }

  const arm = (): void => {
    stage.removeEventListener('pointerdown', restart);
    for (const control of controls) {
      if (ownedDisabled.includes(control)) continue;
      control.disabled = false;
      gateDisabled.delete(control);
    }
    // Runs AFTER the re-enable, so a caller whose control became owned-disabled DURING the window
    // (the read above only sees the state at construction) can still take it back. Optional and
    // undefined for every caller that has no such control.
    onArm?.();
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
 *  the way a hand-written `[a, b, c]` list would let it (issue #42).
 *
 *  `onArm` is the one hook out of the gate: it fires once, synchronously, right after the window
 *  closes and the collected controls that were enabled when the gate was called have been set
 *  `disabled = false`. It exists because a control whose enabled state is OWNED by the page
 *  (pinocchio-luck's `#start`, owned by validateCount()) can become invalid DURING the window --
 *  gh#188's snapshot only reads the state at construction -- which would offer an invalid roster as
 *  startable. Excepting such a control instead would leave it with no ghost-tap guard at all, so the
 *  hook re-asserts the owner's state rather than opting the control out of the gate. Default
 *  `undefined` — the gate's behaviour for every caller that omits it is byte-for-byte what it was. */
export function armAllButtons(
  stage: HTMLElement,
  except: readonly HTMLButtonElement[] = [],
  onArm?: () => void,
): () => void {
  const found: HTMLButtonElement[] = [];
  const walk = (node: Element): void => {
    for (let i = 0; i < node.children.length; i++) {
      const kid = node.children[i];
      if (kid.tagName.toUpperCase() === 'BUTTON') found.push(kid as HTMLButtonElement);
      walk(kid);
    }
  };
  walk(stage);
  return armAfterQuiet(stage, found.filter((btn) => !except.includes(btn)), onArm);
}
