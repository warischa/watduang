# gh#297 — fix E in the shared arm gate (2026-11-07)

## The two readings, written before the fix

- **W (claimed):** in the overlap scenario, a ghost contact stamped inside the newer gate's window never activates the control. Green means E closes the ghost class. Red means E is wrong.
- **S (not claimed):** no gate's arm enables a control while another live gate's window is open. Under E this stays false. When two gates overlap, the older gate's arm still enables the control (`scanDisabledAt851: false`), and the control stays enabled until a contact reaches the stage. A ghost's own pointerdown is such a contact, so it is re-held before its click, but keyboard activation in that span is not refused. This is recorded as the gate's third ceiling, in the comment on `gateDisabled`. Making S true needs a per-control list of live holders instead of one bit, and that change also moves `gateHolds`.

## Why W is enough here

E re-holds on the ghost's pointerdown. That only helps a control that acts on `click`. Every control that writes `disabled` on a gated page was checked; none acts on press:

- cannon-flag's fire button acts on `mousedown`/`touchstart`, but it is in `rapidTapControls()`, which the panel gate's `except` list excludes.
- siamsi's hold button (`renderShake` in `src/games/siamsi.ts`) registers `pointerdown`/`pointerup` and sits inside a collected stage. It self-guards on `hold.disabled`, and every siamsi render calls `stage.replaceChildren()`, so no two gates ever share that node and the overlap cannot reach it. (Corrected by REFUTE finding 2; the first draft said no gated control acts on press.)
- No other gated control registers `pointerdown`, `mousedown` or `touchstart`. The stage-level `pointerdown` listeners (bangkok-drift steering, freeze-tap surface, croc-bite and one-bomb canvases) are on canvases or stages, not on gated buttons.

E rests on the same physical premise as the rest of the restart leg: a contact on a disabled button still bubbles `pointerdown` to the stage. The owner ruled on gh#232 that this premise stays unmeasured at runtime.

## The enable sites, with a verdict for each

The set is every file under `src/` that imports `armAllButtons` and writes `.disabled =`. There are no `removeAttribute`/`toggleAttribute`/`setAttribute('disabled')` writes under `src/`. Tool pages without a gate (`number`, `draw`, `team`) and PlayExit (which has its own timer) are outside the set.

| Site (symbol) | Collected by a gate? | Can the write land inside an open window? | Needs it held after a re-hold? | Under E |
|---|---|---|---|---|
| wire-snip `setupTurn`: scan enable | yes (screen and banner) | before its own screen gate, but inside an older live gate's window (the overlap) | yes | re-held on contact and handed back; the `setupTurn` order is now defence in depth |
| wire-snip `triggerScanSequence`: scan disable | yes | yes (Enter key, mid-window) | n/a (a disable) | handed back enabled at arm, the same as at HEAD (the first ceiling); the state guard refuses the action. Detector `CASE=scan` is RED at both HEAD and E |
| cursed-number turn setup: confirm enable | yes | before `showScreen` (ae7b73b) | yes | same as scan |
| cursed-number `handleConfirmGuess`: invalid-guess re-enable | yes | only by keyboard mid-window | yes | unchanged |
| one-bomb `severEngineLeafControls`: clone enable | the clone is a new node that no live gate collected | n/a | n/a | unaffected (E touches only the controls a gate collected) |
| cannon-flag turn setup: fire enable | no (excepted) | n/a | n/a | unaffected |
| croc-bite tooth pills `disabled = resolved(id)` | yes | no (written before the board is walked) | a pressed tooth must stay disabled | stays the caller's through a re-hold (the third new test pins this) |
| short-stick `renderSetup` count pills, straw grid | yes | no (render before the arm) | a capped pill or a used straw must stay disabled | same as croc-bite |
| love-match `sync`: open button | yes | no (answers are gated) | yes, until all three are answered | same as croc-bite |
| player-screen `syncControls`: start, add | yes | they compute `surfaceHeld`, which is true for the whole first window | yes | unchanged; the re-hold after an arm is gh#298 |
| player-screen `syncControls`: dec, inc | no (`steppers()` is excepted) | n/a | n/a | unaffected |
| wheel `syncControls`: spin, disc (OR `gateHolds`), stop, mode radios | spin, disc and stop yes; the mode radios NO (`also` names only the eliminate box and the name input; corrected by REFUTE finding 2) | yes (when a spin ends) | yes | `onArm` re-asserts. A stop that a re-hold took is now handed back and its marker cleared |

## Measurements (fake DOM, fake clock)

- Gate unit tests (`src/games/_arm-gate.test.mjs`), three new cases. At HEAD's gate: the overlap case and the late re-hold hand-back case are RED; the case where a caller-disabled control stays disabled is green. With E: 8/8.
- Mutants against those tests:
  - blanket un-own (clear the skip-set on every re-hold): RED on cases 7 and 8.
  - no shrink: RED on case 7.
  - `if (armed)` guard restored: RED on case 6.
- `wire-variant-post-ae7b73b.mjs.txt`, `ORDER=c`, turns 1–3:

  | Case | HEAD | E |
  |---|---|---|
  | overlap | RED | green |
  | dead | green | green |
  | scan | RED | RED (pre-existing, identical at HEAD) |

- `npm test`: 1495/1495 with E, including all 14 routes' `arm-reveal-paths`.

## REFUTE round 1 (2026-11-07): RES=FAIL on one low finding, fixed

- **Finding 1 (introduced by E, fixed):** under an overlap plus a stall spanning the newer gate's timer, a deliberate tap stamped past both windows was disabled under the finger. `restart` now skips the re-hold only for an unarmed gate whose window is anchored and whose contact is stamped past it. `inputClockGate().anchored()` was added because an unanchored `isOpen` reads true for every stamp. Two new cases cover it: the deliberate tap lands; with no anchor, a stamped contact is still re-held. Mutants: removing the narrowing turns case 9 RED; removing the anchor check turns case 10 RED.
- **Finding 2 (doc):** corrected above. It covered siamsi's press-driven hold and the wheel radios, which are not in `also`.
- **Finding 3 (hypothesis, no route):** two gates both own a caller-disabled control, the caller enables it in the window, a contact lands, the gate that wrote the hold is cancelled before arming, and the survivor arms. The control is then stranded. Every canceller in the repo either rebuilds the nodes or cancels and re-arms sequentially, never alongside a live overlapping gate, so no route reaches this. Recorded as a ceiling. A caller that starts cancelling one of two overlapping gates must re-read this.
- **Finding 4 (coverage):** case 7 now also asserts `gateHolds(btn) === false` after the hand-back.
