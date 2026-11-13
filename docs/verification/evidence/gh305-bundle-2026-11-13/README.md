# gh#305 — bundle freeze re-pin, per-visitor cost of the three prize-draw 3D games, dangling custom properties

Date: 2026-11-13 · Tree: HEAD 1b4fb75 plus the uncommitted gh#305 work · One local build, n=1, read as found
(`dist/` was NOT rebuilt for this evidence). Every number below is printed by a command in this file.

## 1. Freeze re-pin (ADR-0060)

Red before, measured on the same `dist/` (`node scripts/bundle-freeze-check.mjs`, exit 1, 23 `::error::` lines):
15 new basenames, 7 new page-entry pairs, total 1241557 outside [1055800, 1166936] around 1111368.

| Constant | Before | After |
|---|---|---|
| `BASELINE_TOTAL_BYTES` | 1111368 | **1241557** (+130189, +11.7%) |
| `BASELINE_BASENAMES` | 39 entries | +15: `_render-hold.js demo.js index.js join.astro_astro_type_script_index_0_lang.js paint.js plan.js preload-helper.js prize-cards.js prize-fireworks.js prize-ladder.js reveal.js seed.js setup-page.js store.js three.module.js` |
| `BASELINE_PAGE_ENTRIES` | 62 pairs | +7: PlayExit and play script for each of `game/prize-{cards,fireworks,ladder}/play/`, and `game/prize-draw/join/` with its `join` script |

Green after (`node scripts/bundle-freeze-check.mjs`, exit 0): 37 HTML walked, 54 reachable chunks match the pinned
set, 69 pair(s) across 37 pages match, 1241557 total within ±5% of baseline 1241557. `--selftest` exit 0, 8 case
groups. The band (±5%) and every rule are untouched; only constants and the comments beside them changed.

Why the total moved (sizes from the built files):

- +627908 — the fifteen new chunks. `three.module.js` is 511833 of it, the three renderer entries (all named `index.js`) 57392, `reveal.js` 11905, the join script 9316, the rest helpers and the setup logic now split out of the setup script.
- +1605 — the three new play entry chunks (539, 535, 531). They are small because the shared reveal host carries the work.
- −499324 — net change across chunks that already existed. INFERRED, not isolated by a second build: nearly all of it is croc-bite's play entry shedding the library it used to carry inline (66266 now; 561684 recorded at gh#213). The library moved out of one entry into the shared chunk, so the union did not grow by 511833.

The freeze total is a union over pages (CDN bytes), not a visitor cost. Section 2 is the visitor cost.

## 2. Per-visitor cost (ADR-0068)

Command (script in this directory, output in `closure-output.txt`):

```
cp docs/verification/evidence/gh305-bundle-2026-11-13/closure.mjs.txt /tmp/closure.mjs && node /tmp/closure.mjs dist game/prize-draw/play \
  game/prize-fireworks/play game/prize-cards/play game/prize-ladder/play game/croc-bite/play \
  game/prize-draw game/prize-draw/join
```

Method. Initial closure = the page's `<script src>` chunks plus every static `from"./X.js"` and side-effect
`import"./X.js"` edge, no dynamic imports (the freeze gate's own regex skips the side-effect form). Activated
reveal = initial plus the one renderer chunk the host's registry loads for that game (found by reading the
registry chunk, `reveal.js`) with its static edges, plus `three.module.js`. JavaScript only: stylesheets are not
counted, the way the freeze gate counts. Gzip is node zlib level 9, not the CDN's encoder.

| Route | Initial raw / gzip | Activated raw / gzip |
|---|---|---|
| `/game/prize-fireworks/play/` | 37,835 / 16,279 | 577,207 / 158,340 |
| `/game/prize-cards/play/` | 37,831 / 16,274 | 580,719 / 160,300 |
| `/game/prize-ladder/play/` | 37,827 / 16,270 | 576,693 / 159,117 |
| `/game/prize-draw/play/` (projector) | 54,743 / 23,691 | one game: 585,856 / 162,751 (ladder) to 597,305 / 167,482 (cards); all three: 630,578 / 181,364 |
| `/game/croc-bite/play/` (existing user) | 603,632 / 159,650, `three` in the initial closure | same, nothing lazy |
| `/game/prize-draw/` | 30,153 / 12,692 | none (no lazy import) |
| `/game/prize-draw/join/` | 37,750 / 15,602 | none |

Reading it. A prize route's page load is about 38 KB raw, 2.2× the 17,543 raw ADR-0068 measured for a party
game's page before any 3D, against the 29× of a static import it warned about. The library (511,833 raw) is paid
only on activation, and only by a visitor with motion allowed and WebGL2. The projector's initial cost is higher
because it also carries the event store, the plan and the seed logic. croc-bite still loads `three` on page load
(static import); it now fetches the shared 511,833 chunk instead of an inline copy. ADR-0068 measured that
shared chunk at 497,654 (static) and 503,550 (dynamic, destructured) on a different tree, so a croc-bite visitor
carries about 8–14 KB more than that measurement. Not isolated by a separate build.

The play routes do not load the `prize-*.js` game-module chunks (2,066 to 2,304 raw): those are reached only
through the `[id]` landing page's glob, which no prize route renders.

## 3. Reduced motion and no-game reach no `three`

Commands, run from the repo root against `dist/`:

```
# (a) the initial closure of every prize route, the join page and the setup page has no three chunk;
#     croc-bite prints true on the same line, the positive control
grep -E "^##|three in initial" docs/verification/evidence/gh305-bundle-2026-11-13/closure-output.txt

# (b) which chunks import three.module at all, and how
cd dist/_astro && for f in $(grep -l 'three.module' *.js); do echo "$f static=$(grep -o -E 'from\s*"\./three\.module[^"]*"' $f | wc -l) dynamic=$(grep -o -E 'import\(\s*"\./three\.module[^"]*"\s*\)' $f | wc -l)"; done
for h in B1qV2OLA ClKeB51M DiwL06GZ; do echo "index.$h: $(grep -l "index.$h" *.js | tr '\n' ' ')"; done
```

Results. (a) `three in initial: false` on the three game routes, the projector, the setup page and the join page;
`true` on croc-bite only. (b) `three.module` is imported statically by exactly four chunks: croc-bite's play
entry and the three renderer chunks `index.B1qV2OLA.js`, `index.ClKeB51M.js`, `index.DiwL06GZ.js`; `reveal.js`
reaches it only through `import("./three.module…")`. Each of the three renderer chunks is named by `reveal.js`
alone, as a dynamic `import()`, and by no HTML page. So `three` is reachable from a prize page only through two
lazy edges in `reveal.js`: the renderer chunk's loader and the `three` loader.

Order, from the built `reveal.js` (one function, offsets by `indexOf`): the `return u("fallback","reduced-motion-entry")`
sits at 6419, the `return u("fallback","no-webgl2")` at 6973, and the call `Promise.all([d.loaderFor(r)(),e.loadRenderer()])`
at 7017. A reduced-motion room, a null or unavailable game, or a context without WebGL2 leaves the function before
either import. The source start function reads the same way: no game, unavailable, reduced motion, then WebGL2, then the loaders.

Uncovered: a runtime network trace (no browser was run; the brief forbids one), and `game-host.test.mjs` was not run here.

## 4. Dangling custom properties

The rules reading them are in `src/play/prize-draw/play.css`. Every element that reads one sets it at creation
in `lanes.ts` or `stage.ts`, so the fallback never wins at runtime. The repo already prefers a fallback on the
reading rule (`var(--pd-x, 0px)`, `var(--pd-scale, 1)`), so the same shape is used:

| Read | Was | Now |
|---|---|---|
| slot and plate position | `var(--x)` | `var(--x, 0px)` |
| plate dot fill | `var(--dot)` | `var(--dot, transparent)` (an unset value was already transparent) |
| lane button position | `var(--lane-x)` | `var(--lane-x, 160px)` (the term is `(lane-x − 160px)`, so the fallback adds 0) |

Proof without a rebuild: the check's own logic on a copy of `dist/` with the built stylesheet patched the way the
build would (`cp -R dist/. /tmp/gh305-dist-copy/`, then `sed` on `_astro/play.CkN8I8C_.css`):

```
env -u CI -u GITHUB_ACTIONS node scripts/dangling-css-var-check.mjs /tmp/gh305-dist-copy
```

Unpatched copy: 3 dangling references (`--dot`, `--lane-x`, `--x` on `game/prize-draw/play/index.html`), exit 1.
Patched copy: `37 HTML page(s) scanned ... 0 references ...`, exit 0. The real minifier's output may differ in spelling
from the `sed` patch, so the next build is the final proof.
