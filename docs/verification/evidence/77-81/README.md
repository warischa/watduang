# gh#77-gh#81 — the two acceptance criteria no static check can settle

Both criteria are about rendered geometry, so both are settled by driving a real headless Chrome
through `scripts/driver.mjs` at an emulated viewport. Reading the CSS and concluding is what produced
the wrong number the first time: the arithmetic behind the original "44.5px, passes" claim omitted the
UA body margin, because this site defines no `body { margin: 0 }` anywhere.

## 1. Every stick is a 44px tap target — `scripts/stick-tap-target-probe.mjs`

gh#79 requires every stick to be a tap target of at least 44px on its smallest edge. จับไม้สั้น seats
two to ten players, so the probe sweeps every roster size the game accepts at both 320px and 390px —
18 cases — and reports the smallest edge of any stick.

| file | build | result |
|---|---|---|
| `stick-tap-target-control-prefix.json` | before the wrap fix | **11 of 18 fail**, smallest edge 14.2px; even 6 sticks at 390px measured 42px |
| `stick-tap-target-fixed.json` | after the wrap fix and the body reset | **0 of 18 fail**, smallest edge 44.7px |

The control run is the calibration: the probe reds on the unfixed build and greens on the fixed one,
so a pass means the geometry changed rather than the probe being blind.

The fix is `flex-wrap` on the stick panel with the 44px floor as the flex basis, and row heights from
`align-content: stretch`. One row is arithmetically impossible — ten 44px sticks plus nine 10px gaps
need 530px of inner width, more than any phone has.

## 2. No screen scrolls sideways at 320px — `scripts/narrow-overflow-probe.mjs`

All six game screens, each with a normal roster and with a 24-character spaceless Latin name (the
longest the roster's `maxlength` allows), at 320px. It reports horizontal document overflow and names
any element inside `#stage` whose right edge passes the viewport.

| file | build | result |
|---|---|---|
| `narrow-overflow-before.json` | before the wrap fix | **3 of 12 fail** — ระเบิดเวลา, เซียมซีปาร์ตี้ and จับไม้สั้น each scrolled 28px sideways on the long name |
| `narrow-overflow-after.json` | after | **0 of 12** |

Cause: the rewrite replaced inline name styles that carried `overflow-wrap: anywhere` with classes
that did not. Thai wraps on dictionary breaks and hides the defect; Latin does not. ดวงวันนี้ and
ดวงความรัก were fixed in the same pass, so the whole set of name-bearing classes carries it now.

## Running them

Build, serve, and start headless Chrome as `docs/agents/browser-verification.md` describes, then:

```
node scripts/driver.mjs scripts/stick-tap-target-probe.mjs
node scripts/driver.mjs scripts/narrow-overflow-probe.mjs
```

Both poll for the stage to fill before measuring. The game module is lazy-imported, so measuring
straight after the start button reports zero sticks — which looks exactly like a broken screen.

## The body reset

This site had no `body { margin: 0 }` anywhere, so every page carried the UA's 8px gutter on each side.
That gutter is the width the original 44px arithmetic missed. The owner asked for it fixed in the same
session, so `src/layouts/Base.astro` — the layout that declares `<body>` — now carries the one global
reset on the site, and both probe runs above were re-measured against it.

Removing the gutter narrows the smallest stick from 50.5px to 44.7px rather than widening it: the
extra 16px lets one more stick fit per row, so each one's share of the row is smaller. It stays above
44px because `min-width: 44px` is a hard floor — the row wraps instead of squeezing — and the overflow
probe confirms no page scrolls sideways at 320px.
