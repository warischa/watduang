# Reset-control browser walk — gh#174 box5/box6, gh#175 box6, gh#177 box4/box5

2026-09-03. Real browser (headless Chrome 152.0.7977.65 over CDP), real `dist/` build served
statically, 320x568 viewport, setup/name screens only. Criterion (gh#182, owner ruling
2026-08-31, quoted verbatim): "the play screen must not scroll; the setup screen may." Scrolling
on a setup screen below is **allowed and not a finding** — several controls sit below the fold at
320px and are reached by scroll, same as any player would.

Selectors are pinned from `src/play/reset-control-pin.test.mjs`'s `RESET_TRIGGER` table, never
guessed. Driver: `scripts/driver.mjs` + a one-off probe script (not committed — task scope excludes
`scripts/`), same session API (`nav`/`setWidth`/`wipe`/`evaluate`) every other route walk in this
repo uses. Route set: the 8 named in the brief, matching `src/games/manifest.ts`.

## Method

For each route: wipe storage, reload on-origin, wait ~1000ms for the module to mount, snapshot
every visible in-viewport control, locate the reset trigger by its pinned selector. If the trigger
resolves to a 0x0 box (present in DOM but on an inactive screen — the mockup markup for all screens
is in the document at once, per `scripts/control-floor-probe.mjs`'s own comment), click the one
CTA that reaches the setup/name screen (largest non-header button in the mockup root; zero-trigger
needed an explicit `#btn-goto-setup` override because its menu screen's largest CTA is "quick
start", which skips setup entirely — the generic heuristic picks the wrong button there). Re-snapshot
after, and diff the two snapshots for any other control that was in-viewport before and is now
present-but-off-viewport after (a genuine push), not merely a different screen's different controls.

## Calibration (red@shrink-known-element)

Before trusting any "≥44px: yes" below, the same `getBoundingClientRect().height` check was proven
to report FAIL: `short-stick`'s `#btn-reset-names` measured 48.5px clean, then had `min-height`,
`height`, `padding`, `line-height`, `font-size` forced to shrinking values via inline
`!important` styles (the same technique `scripts/control-floor-probe.mjs` uses for its own mutant
leg) and re-measured at **10px — correctly reported `redOnShrink: true`**. The measurement is not a
tautological pass; it can and does say no. Height is read from the live box (`getBoundingClientRect`),
never a sampled pixel or the element's centre line (the two traps this repo has hit before).

## Per-route results

| route | reset trigger | reached via | measured WxH | >=44px | other control pushed off / reflowed |
|---|---|---|---|---|---|
| short-stick | `#btn-reset-names` | click "เริ่มตั้งวงเล่น ➔" | 246x48.5 | yes | no |
| power-meter | `[data-act="openResetNamesModal"]` | click "ถัดไป: ใส่ชื่อผู้เล่น ➔" | 246x48 | yes | no |
| cannon-flag | `#btn-reset-names` | initial load (setup is screen 1) | 246x54 | yes | no |
| how-close-is-near | `#btnResetNames` | click "ถัดไป ➔" | 270x48 | yes | no |
| timebomb | `#tb-reset-names` | initial load (setup is screen 1) | 288x48 | yes | no |
| freeze-tap | `#resetNamesBtn` | initial load — runtime-rendered by `main.js` `renderSetupScreen()`, the GameState.SETUP branch that is the default state on mount, so a live page reaches it with no click | 246x50 | yes | no |
| cursed-number | `#resetNamesBtn` | initial load (setup is screen 1) | 226x58 | yes | no |
| zero-trigger | `#btn-open-reset-cast` | click "⚙️ ตั้งค่าผู้เล่น & บทลงโทษ" (`#btn-goto-setup`, explicit override) | 280x50 | yes | no |

All 8 routes REACHED — none `UNREACHED`. Several triggers (cannon-flag, timebomb, freeze-tap,
cursed-number) sit below the 320x568 fold (`inViewport: false` in the raw JSON) — that is scrolling
on a setup screen, explicitly allowed by the gh#182 criterion, not reported as a failure.

## Box closure

- **gh#174 box5 / gh#175 box6 / gh#177 box5** ("adding the control does not push any existing
  control off screen or into a reflow at 320px"): CLOSED for all 8 routes — the before/after
  in-viewport snapshot diff found zero relocated controls on every route.
- **gh#174 box6 / gh#177 box4** ("the reset control clears the 44px tap floor on each route"):
  CLOSED for all 8 routes — every measured trigger is >=44px tall, against a measurement proven
  (see Calibration) to report a real failure when one exists.

## What this does NOT cover

Only the setup/name screen's reset trigger was measured on each route — not every control on every
screen (that is `scripts/control-floor-probe.mjs`'s job, a different walk). Not re-run under
`prefers-reduced-motion` or at any width but 320px. Freeze-tap's reachability (the one box#5/box#4
pairing the audit flagged as unsettled by static analysis) is the one route that genuinely required
reaching a runtime-rendered screen rather than reading `markup.html`; it mounts `GameState.SETUP` as
its default state, so no extra click was needed once the module runs in a real browser — a static
DOM read is what missed it, not the page.
