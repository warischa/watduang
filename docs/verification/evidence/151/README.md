# gh#151 evidence — ระเบิดเวลา, a 30-90s fuse nobody can time

Captured 2026-09-01 against `dist/` built from commit `354e5ff` plus this session's changes
(`src/play/timebomb/fuse-clock.test.mjs`, `src/play/timebomb/canvas-pixels-probe.mjs`).
Browser: headless Chrome 152.0.7977.65, served with `npx serve dist -l 4326`, CDP on 9226.

Command for every JSON here (the `.json` extension is deliberate — `.log` is gitignored):

```
BASE=http://localhost:4326 [TB_FULL_ROUND=1] [TB_REDUCED=1] \
  node src/play/timebomb/canvas-pixels-probe.mjs 9226 <shot.png>
```

## Box 4 — the canvas draws, and the probe can tell when it does not

| file | renderer | `drawn` | coverage | distinct colours | exit |
|---|---|---|---|---|---|
| `probe-full-motion.json` | shipped | `true` | 0.3774 | 160 | 0 |
| `probe-stubbed-renderer.json` | `paint()` stubbed to `return;`, rebuilt | `false` | 0 | 0 | 1 |

The stub was reverted and the tree rebuilt after the red leg; `bomb-canvas.ts` hashes identical to
its pre-stub copy.

## Boxes 5 and 6 — a full round at 320px, both motion modes

Viewport 320x640 CSS, `deviceScaleFactor: 2`, `mobile: true`. Both legs clicked `#tb-begin` and
`#tb-start` through the arm gate, passed the phone once, and waited out the real fuse.

| file / screenshot | `reducedMotion` at runtime | detonated | ticking coverage | boom coverage | boom colours |
|---|---|---|---|---|---|
| `probe-full-round-full-motion.json` · `full-round-full-motion-320.png` | `false` | yes | 0.3772 | 0.6619 | 616 |
| `probe-full-round-reduced-motion.json` · `full-round-reduced-motion-320.png` | `true` | yes | 0.3756 | 0.6619 | 617 |

`reducedMotion` is read from `matchMedia` inside the page, so the emulation is confirmed to have
taken effect in both directions rather than assumed. Reduced motion is not a static screen: the
round runs, detonates, and repaints to the boom frame — the screenshot shows the blast wash, `ตูม!`,
the loser's name and `เล่นอีกรอบ` at 320px.

**Read race found and fixed while capturing this.** The `TB_FULL_ROUND` loop returns the instant
`#tb-again` appears, one rAF before the renderer's boom frame. Without a settle the boom readback
returned the ticking image — 0.3756 / 163 under reduced motion, byte-identical to the ticking read
and indistinguishable from "the explosion never drew". Full motion hid it because every frame
repaints there anyway. `canvas-pixels-probe.mjs` now sleeps 1500ms before that readback; the numbers
in the table above come from the settled probe.

## Boxes 1-3 — pinned by tests, no browser needed

`node --test src/games/timebomb.test.mjs src/play/timebomb/fuse-clock.test.mjs` — 22 pass.

The live region a screen reader hears is captured in the full-round JSONs as `round.liveRegion`:
`ระเบิดแล้ว ชิบะ ถือมือถืออยู่ตอนระเบิด — แพ้รอบนี้`, which is the result and no timing.
