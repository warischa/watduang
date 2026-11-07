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

/** gh#190. Two clocks reach every gate in this repo and only one of them can answer "was this contact
 *  inside the window". `setTimeout` fires when the main thread got round to it; `event.timeStamp` is
 *  stamped by the browser when the input was DISPATCHED. A long transition task queues the arm timer
 *  AND the next contact behind itself, so the timer can expire before a contact the finger made
 *  235.5ms after the transition is ever handled — measured on the cursed-number play route with the
 *  control already ENABLED and the round genuinely left.
 *
 *  So the timer is no longer the only guard. It keeps owning the visible `disabled` attribute (the
 *  control must LOOK inert and stay keyboard-inert, and removing it would leave a keyboard user with
 *  a never-focusable control), and this second, always-on comparison decides whether a contact was
 *  dispatched inside the window. Two independent guards, neither waiting on the other.
 *
 *  Stamp-to-stamp ONLY. Never compared against performance.now() or Date.now() and never used to
 *  derive a timer delay: both of those read when the handler RAN, which is the clock this defect is
 *  made of. Shared by all four gates on the site so the rule has one implementation.
 *
 *  ponytail: a closure over one number, no class and no options bag. `anchor(undefined)` means "no
 *  input reference", which reads as OPEN and leaves the timer in sole charge — byte-for-byte the
 *  behaviour every caller had before this existed. */
export function inputClockGate() {
  let openAt: number | undefined;
  const anchor = (stamp?: number): void => {
    openAt = stamp === undefined ? undefined : stamp + ARM_DELAY_MS;
  };
  return {
    anchor,
    /** Restart the window from this event's own dispatch stamp. */
    hold: (ev: { timeStamp: number }): void => anchor(ev.timeStamp),
    /** Was this event dispatched at or after the end of the window? */
    isOpen: (ev: { timeStamp: number }): boolean => openAt === undefined || ev.timeStamp >= openAt,
  };
}

/** The dispatch stamp of the last pointerdown the page saw. armAfterQuiet is called from inside a
 *  render that a tap triggered, and that event is long gone by the time the gate is built, so this is
 *  the only input-clock reference the FIRST window of a gate has. Capture phase on document, so a game
 *  that stops propagation inside its own root cannot hide a contact from it.
 *
 *  BOTH ends of the press are recorded, and the later one wins. A press has a duration: the render
 *  that builds the gate runs on the RELEASE (a click), while the contact that opened the press was
 *  stamped `d` milliseconds earlier. Anchoring to the pointerdown alone therefore ends the window `d`
 *  short of the timer it is supposed to shadow, and a ghost stamped in that gap reads as outside the
 *  window and inside the timer at the same time — with the timer arming first under a stall, that
 *  ghost activates. 120ms of press is an ordinary tap, not a hold. PlayExit.astro already anchors on
 *  pointerup as well as pointerdown; this makes the shared seed agree with it.
 *
 *  Guarded on `document` because the node tests import this module with no DOM at all. Stated ceiling:
 *  a gate built with no pointer contact behind it (a keyboard or programmatic render) anchors to a
 *  stale stamp or to none, reads as open, and is governed by its timer exactly as before.
 *
 *  That ceiling is a description, NOT a safety proof, and an earlier wording overreached by claiming
 *  such a case "has no ghost contact to refuse". A render fired by a SHORT timer after a real tap
 *  anchors to that tap, so the stamp window can close before the timer does and a ghost delivered
 *  after a long enough stall is accepted — dice-loser arms its revealed next-button one roll-length
 *  after the roll tap under reduced motion, which is the shape to measure against. Inferred from
 *  source, never measured; recorded here so the next reader tests it rather than trusting this line. */
let lastPointerStamp: number | undefined;
if (typeof document !== 'undefined') {
  const note = (ev: Event): void => {
    if (lastPointerStamp === undefined || ev.timeStamp > lastPointerStamp) lastPointerStamp = ev.timeStamp;
  };
  document.addEventListener('pointerdown', note, true);
  document.addEventListener('pointerup', note, true);
}
export const lastInputStamp = (): number | undefined => lastPointerStamp;

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
 *  is for and it is unchanged by this. The same holds after a re-hold (gh#297): a control the caller
 *  enabled and a late contact then re-disabled is this gate's to hand back, so a caller that disables
 *  it again before the window closes also gets it back enabled, and `onArm` re-asserts it.
 *
 *  Third ceiling (gh#297): the marker is one bit, not a list of holders. When two gates overlap on a
 *  control, the older gate's arm enables it inside the newer gate's window, and it stays enabled
 *  until a contact reaches the stage. A ghost tap IS such a contact and is re-held before its click;
 *  keyboard activation in that span is not refused. */
const gateDisabled = new WeakSet<GatedControl>();

/** Is `control` disabled because a gate holds it, not for its caller's own reason? For a page whose
 *  own render also writes `disabled` on gated controls (gh#295, the wheel tool): that render must not
 *  hand back a control a window still holds, and only this module knows, because a late in-window
 *  contact (ADR-0059) re-holds the set without telling the caller. Residue left by a cancelled gate
 *  also reads as held until the next gate on those nodes arms. */
export const gateHolds = (control: GatedControl): boolean => gateDisabled.has(control);

/** Every control the gate can hold: anything with a native `disabled`. Buttons are found by
 *  armAllButtons; the other kinds only ever arrive by name through its `also` list (gh#295). */
type GatedControl = HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement;

function armAfterQuiet(
  stage: HTMLElement,
  controls: readonly GatedControl[],
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
  //
  // gh#297: the set only ever shrinks, and a control leaves it only when THIS gate writes `disabled`
  // on it from enabled. So every control this gate held, it hands back: a caller that enabled one of
  // these after construction and then met a late re-hold no longer gets a dead control. Nothing else
  // removes a control, so one the caller still has disabled through a re-hold stays the caller's.
  const ownedDisabled = new Set(controls.filter((control) => control.disabled && !gateDisabled.has(control)));
  // Extracted because the window can now be re-entered AFTER the timer armed the set: a contact the
  // browser stamped inside the window but delivered late has to put the controls back, and it has to
  // do it through the same gateDisabled bookkeeping or the second arm would hand back a control the
  // caller had disabled for its own reason.
  const disableAll = (): void => {
    for (const control of controls) {
      if (!control.disabled) {
        gateDisabled.add(control);
        ownedDisabled.delete(control);
      }
      control.disabled = true;
    }
  };
  disableAll();

  // gh#190. The window this gate opens is anchored to the tap that caused the render, not to the
  // moment this function ran — see lastInputStamp above.
  const stamps = inputClockGate();
  stamps.anchor(lastInputStamp());

  let armed = false;

  const arm = (): void => {
    armed = true;
    for (const control of controls) {
      if (ownedDisabled.has(control)) continue;
      control.disabled = false;
      gateDisabled.delete(control);
    }
    // Runs AFTER the re-enable, so a caller whose control became owned-disabled DURING the window
    // (the read above only sees the state at construction) can still take it back. Optional and
    // undefined for every caller that has no such control.
    onArm?.();
  };
  // The listener is NOT detached when the timer arms any more, and that removal is the whole defect:
  // a ghost contact queued behind a long task arrives after `arm` ran, meets nothing, and activates
  // the control it lands on. It stays attached until a contact the INPUT clock puts outside the
  // window arrives — that one is the deliberate tap, and it is also the only moment we can prove the
  // window is really over. Until then an in-window contact re-disables the set and reschedules, so
  // `arm` (and with it `onArm`) can run twice on a ghost; every onArm on the site is idempotent by
  // construction — the only one, the shared player screen's surface gate (ADR-0071), recomputes
  // `disabled` from its own state through syncControls rather than toggling it.
  //
  // `ev` is optional because the route tests dispatch a bare pointerdown with no event object, and
  // because the construction call below has none: no stamp means the timer alone decides, unchanged.
  const restart = (ev?: { timeStamp: number }): void => {
    // Before the timer has armed anything, this is byte-for-byte the old gate: every contact restarts
    // the window, whatever it is stamped. The stamp only gets a vote AFTER the controls went live,
    // which is the only situation the old gate got wrong.
    if (armed && ev && stamps.isOpen(ev)) {
      stage.removeEventListener('pointerdown', restart);
      return;
    }
    if (ev) stamps.hold(ev);
    // gh#297: unconditional. The old `if (armed)` assumed an unarmed gate's controls were still
    // disabled, but an OLDER gate over the same controls (a modal close re-arms its region inside a
    // screen gate's renewed window, ADR-0057) can arm and enable them inside this window. This
    // contact is the ghost's own pointerdown, so re-holding here lands before its click.
    disableAll();
    armed = false;
    clearTimeout(timer);
    timer = setTimeout(arm, ARM_DELAY_MS);
  };

  // scripts/arm-gate-coverage-check.mjs gates COVERAGE (every render function arms its buttons via
  // armAllButtons). The physical fact this restart leg rests on — a real touch on a `disabled`
  // button still bubbles pointerdown to #stage — is deliberately unmeasured at runtime per the
  // site owner's ruling on issue #232.
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
 *  `disabled = false`. It exists because a control whose enabled state is OWNED by the page (the
 *  shared player screen's start control, owned by its syncControls()) can become invalid DURING the
 *  window -- gh#188's snapshot only reads the state at construction -- which would offer an invalid
 *  roster as startable. Excepting such a control instead would leave it with no ghost-tap guard at all, so the
 *  hook re-asserts the owner's state rather than opting the control out of the gate. Default
 *  `undefined` — the gate's behaviour for every caller that omits it is byte-for-byte what it was.
 *
 *  `also` names non-button controls to hold in the same window: discovery finds buttons only, and a
 *  checkbox or textarea the page moves under the finger needs the same guard (gh#295, the wheel tool
 *  scrolls on names-in). Named, not discovered, so no existing caller starts gating its inputs.
 *  Default empty: every caller that omits it is unchanged. */
export function armAllButtons(
  stage: HTMLElement,
  except: readonly HTMLButtonElement[] = [],
  onArm?: () => void,
  also: readonly (HTMLInputElement | HTMLTextAreaElement)[] = [],
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
  return armAfterQuiet(stage, [...found.filter((btn) => !except.includes(btn)), ...also], onArm);
}
