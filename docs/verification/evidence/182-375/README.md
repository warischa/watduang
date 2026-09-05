# gh#182 box 6 / gh#140 box 3 / gh#152 box 6 — 375px player-name surfaces, 2026-09-05

Recorded against the live checkout (dirty tree, chip-cap track integrated: `--strip-chip-cap`
96/128/96px on short-stick/wire-snip-panic/zero-trigger). `npm run build` once per leg, `npx serve
dist/ -l 4323` + headless Chrome `--remote-debugging-port=9334`, own ports per the concurrent-agent
rule (sibling held 9333/4322, untouched).

## gh#179 fit probe, 320x568 + 390x844 (also ran 1440x900, not this box's scope)

```
env BASE="http://localhost:4323" CDP_PORT="9334" node scripts/play-screen-fit-probe.mjs
env BASE="http://localhost:4323" CDP_PORT="9334" BREAK_WALK=1 node scripts/play-screen-fit-probe.mjs
```
Clean leg: exit 0 (`fitprobe-clean-320-390-1440.log`). Control leg: exit 0, "all 33 route/viewport
row(s) stayed on the fresh screen" (`fitprobe-control.log`) — the script's own must-fail-and-doesn't
calibration (BREAK_WALK inverts the assertion; see the file's own header).

**Warning printed, not gated:** pinocchio-luck 320x568 sideways clip measured 50px against a
recorded 11px in `KNOWN_OVERFLOW_X` — grew past what was excused on the same machine. Reported,
not fixed (out of scope).

**Exemption-reason audit (gh#182 box 1's reworded criterion: an exemption needs a recorded OWNER
RULING, not just a recorded number).** This section no longer states the count, because it has gone
stale twice. **Run the command; do not read a number here.** For the two phone viewports box 1 is
scoped to:

```
grep -cE "^  \['[a-z-]+ (320x568|390x844)'.*gh#182 open:" scripts/play-screen-fit-probe.mjs
```

Drop the viewport alternation for the all-viewport count. The shape of the finding — which is what
this file is actually evidence for, and which no commit has changed — is that `cursed-number
320x568` is the ONLY row carrying an `owner ruling` reason, that the `gh#202 open:` rows belong to
that ticket's sideways-clip map and are not box 1's to close, and that a row reading only
`gh#182 open:` is a recorded number rather than a legitimate exemption.

**Why the number is gone rather than updated — it has now been wrong twice, for two different
reasons.** First, on 2026-09-05, it read "the other **16** are `gh#182 open:`", mixing two scopes and
being true of neither: 16 counts all three viewports (21 rows in total) while the phone scope this
box owns held 17 rows. That was corrected to **12**. Then, later the same day, commit `b4ea5e5`
moved six rows (`cannon-flag` and `power-meter`, each at all three viewports) out of `gh#182 open:`
into the new `not a defect <date>` class, and **12 became 8 without this file being touched**. A
count written beside the command that computes it will always lose that race: the map is edited by
commits that have no reason to look here. The first wrong figure had already propagated into a
session handoff and two agent briefs before anyone re-ran the grep; the second was caught by an
audit that re-ran the command instead of quoting the file.

## Surface enumeration — derived, not assumed

`src/shell/PlayerSetup.astro`/`player-select.ts` is the ONLY item on the brief's own list. **Verified
absent from the live build**: `getStaticPaths` in `src/pages/game/[id].astro` filters
`games.filter(g => !g.playRoute)` — every one of the 11 party games (which have a roster) has a
`playRoute` and its `/game/<id>/` landing page is DELETED; the only two games left ( siamsi,
daily-fortune) are `players: [1,1]`, which `GameLayout.astro`'s own guard hides `PlayerSetup` for.
`dist/game/<id>/` confirms: only siamsi/daily-fortune ship an `index.html`, everyone else is a bare
directory listing. PlayerSetup renders on zero live pages today — not tested, reported instead.

Real, reachable surfaces (17 total):
- 11 routes' own setup roster row (`renderSetup()`/equivalent in each route's own module) —
  `cannon-flag, cursed-number, dice-loser, freeze-tap, how-close-is-near, pinocchio-luck,
  power-meter, short-stick, timebomb, wire-snip-panic, zero-trigger`
- 6 chip-strip surfaces on 4 routes: `#draw-player-strip` (short-stick), `#hud-player-strip`
  (wire-snip-panic), `#game-player-strip` (zero-trigger), `#handoffPlayerStrip` /
  `#selectionPlayerStrip` / `#safePlayerStrip` (cursed-number — 3 screens, found by reading
  `renderPlayerStrip()` call sites, not on the brief's list)

## 375px per-surface result (short / longest-mascot / synthetic-15-char, 10 seats each)

All 11 setup rows: **0 clipped, 0 wrapped, 0 out-of-viewport**, `innerWidth===375` confirmed on
every nav (`setup-rows-375.json`, `timebomb-setup-row-375.json` — timebomb keeps its own
`watduang:timebomb-players` key, ADR-0054/gh#177, confirmed by reading `main.ts`; the shared-roster
seed is inert for it by design, re-seeded separately).

Chip strips (`chip-strips-375.json`): short-stick and zero-trigger's `fifteen` variant clip via the
route's own `text-overflow:ellipsis` (10/10 chips each) — the DESIGNED chip-cap behaviour, confirmed
visually in `chipstrip-short-stick-375-fifteen.png` (ellipsis + `+N` band, nothing broken). All other
combinations (short/longest on every route, all 3 variants on wire-snip-panic and cursed-number):
0 clipped. cursed-number's badges never clip at any length — no `max-inline-size` cap in its CSS
(unlike the other 3, which are the chip-cap track's own scope) — it grows the badge instead.

## Calibration

- **Setup-row scan, must-red found organically, then fixed:** first run matched 21-69 "elements"
  per route with IDENTICAL counts across all 3 name variants — the tell. Root cause:
  `el.textContent.includes(name)` inside `Runtime.evaluate` resolves `name` to `window.name`
  (DOM global, default `""`), not the Node closure variable — matches everything. Fixed by
  JSON-embedding the literal. Re-run: `nEls===10` (exactly the seeded seats) on every route.
- **Setup-row scan, deliberate must-red:** short-stick's `.input{width:30px}` (scratch edit,
  `git checkout --` immediately after) — 10/10 rows `clipped:true`. Reverted, `npm run build` re-run
  before any real-evidence pass.
- **Chip-strip scan, must-red found in real data (n=20):** the `fifteen` variant on short-stick and
  zero-trigger genuinely clips (10/10 chips each) — same instrument, same run, real overflow.

## Not measured

`PlayerSetup.astro`/`player-select.ts` (dead page, see above). 1440x900 fit-probe rows recorded but
outside this box's two named viewports.
