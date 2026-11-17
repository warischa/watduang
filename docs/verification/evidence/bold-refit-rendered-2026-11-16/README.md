# Rendered proof of the prize-draw bold refit (b50b4cf)

Question: does the bold refit hold in a real Chrome render, not only in the width model of
`src/play/prize-draw/bold-refit.test.mjs`? Verdict: yes. On the code before the fix the real route leaves
reveal names wider than their box (`scrollWidth > clientWidth` and the fit rule's own inequality both fail); on
the current code the same harness, name set and viewport read clean. n=3 each leg.

## Method

- Worktree HEAD at the start: `4daa92b`. Current `stage.ts` sha1 `1412f0afc6709f554e23b14e01d585b5f169ddff`,
  re-checked identical after the red leg; `git diff --stat` empty.
- Harness kind: the BUILT route (`npm run build`, then `npx serve` of a copy of `dist/`), driven through the real
  setup page and a real mouse click on the MC's reveal button. Why: the wave, the re-mark frame and the bold-face
  refit all live in `stage.ts`/`main.ts` wiring and the route's own `reveal.css` and Sarabun webfont, so a bundle
  of the module alone would be a second copy of the route.
- Two builds from the same tree, nothing else changed: current `stage.ts`, then
  `git show b50b4cf^:src/play/prize-draw/stage.ts` dropped in for the second build and restored from a copy
  (hash compared). The old file differs from HEAD's by the fix alone (20 diff lines). The built routes differ only
  in the play bundle: `play.astro_astro_type_script_index_0_lang.1isUHiTV.js` is the old build,
  `...CF04VCCJ.js` the current one; each run records the bundle name it loaded.
- Browser: Chrome 157.0.8103.51, `--headless=new`, CDP port 9344, static server port 4344 (one dist at a time,
  fresh `--user-data-dir` per leg under the session temp dir, removed afterwards). Both started and stopped by
  recorded pid; ports confirmed free after each leg. Driver: `scripts/driver.mjs`.
- Viewport 1920x1080, `mobile: false`, asserted in-page each run (`innerWidth === 1920`, reduced motion off). The
  page is never resized after the press (a resize refit would heal the old code).
- Each run: clear storage on the origin, setup page (30 names: 11 band names + 19 fillers), real click on start,
  projector route loads, real click on the reveal button, wait for the field's `pd-marked`, wait 4 s more, measure
  every passed chip (`.pd-chip.in`). Names reach the route only through the setup page's textarea and are written
  by the route with `textContent` (names-dom.ts), no markup path of mine.
- Harness: `bold-refit.harness.mjs` (named so the test glob does not collect it). Usage in its header.
  Raw per-run output: `raw/old-run{1,2,3}.json`, `raw/new-run{1,2,3}.json`.

## Choosing the name (by measurement)

The defect needs a name that fits with the fit rule's 2% slack at regular weight at some size S but whose BOLD
width at S exceeds the chip's room. On this route at 1920px a chip has `clientWidth` 172, padding 8 each side,
room 156; Sarabun bold is about 3.3 to 4% wider than regular. So the band is narrow: a regular width of about
150 to 152 layout px at 20px.

- The width-model test's fixture is Latin; the brief asked for a Thai name, so it was not used. First try: Thai
  given-name pairs. The setup page refuses names over 12 clusters, which removed the 17+ cluster pairs I measured
  first.
- Measured in the real page (a detached chip with the real classes, fonts loaded, widths read at every size 14..20
  in both weights; the chip was appended to a hidden `.pd-field.pd-marked` wrapper in the route): 3052 realistic Thai names (given names, surnames, pairs, with and without a space): 0 in the
  band. 1800 + 8000 random but roster-valid Thai strings (`checkName` ok, 9 to 12 clusters): 2 + 9 in the band.
  The scan scripts were one-off scratch and are not kept; the harness header states the criterion.
- Used: the 11 band names listed in the harness, all valid roster names, all fit at 20px regular with slack and
  need 19px bold (`offsetWidth` at 20px bold 157 or 158 against room 156). They are not natural names. Finding to
  read with the verdict: among natural Thai names the scan found none in the band, so the live incidence of this
  defect is low (inferred from that scan, not an exhaustive claim), and its size is 1 to 2 layout px.

## Font loaded

Per run, in the page: before the press `document.fonts.check('700 20px Sarabun','ก')` was already `true` (the
route's own bold text had loaded it, so the explicit warm-up call was a no-op), `document.fonts.load(...)`
then resolved, `FontFace` entries for Sarabun 400 and 700 both `status: loaded`. The face Chrome painted a band
name in, from CDP `CSS.getPlatformFontsForNode`: `familyName Sarabun`, `postScriptName Sarabun-Bold`,
`isCustomFont true` (the self-hosted webfont, not a system fallback), in every run of both legs.

## Numbers (per run; band = the band-named chips that passed round 1 and render bold)

Legend: `scroll-client` is `chip.scrollWidth - chip.clientWidth` per band chip; `fit violations` counts passed
chips whose `run.offsetWidth * 1.02 > room` (the fit rule's own inequality at the render weight); `spill` is the
worst `run.offsetWidth - room` over passed chips.

| leg | run | bundle | passed / band | band chip size | scroll-client per band chip | max scroll-client (all passed) | fit violations | max spill px |
|---|---|---|---|---|---|---|---|---|
| old (b50b4cf^) | 1 | 1isUHiTV | 20 / 7 | 20px | 1,1,1,0,0,0,1 | 1 | 7 | 2 |
| old | 2 | 1isUHiTV | 20 / 6 | 20px | 1,1,0,0,0,1 | 1 | 6 | 2 |
| old | 3 | 1isUHiTV | 20 / 7 | 20px | 1,1,1,0,0,0,1 | 1 | 7 | 2 |
| current (HEAD) | 1 | CF04VCCJ | 20 / 7 | 19px | 0 x7 | 0 | 0 | -6 |
| current | 2 | CF04VCCJ | 20 / 9 | 19px | 0 x9 | 0 | 0 | -5 |
| current | 3 | CF04VCCJ | 20 / 8 | 19px | 0 x8 | 0 | 0 | -5 |

Red leg: `scrollWidth > clientWidth` on 4, 3 and 4 band chips (by 1px), and every band chip breaks the fit
inequality, by up to 2px of layout width. Green leg: `scrollWidth <= clientWidth` on every passed chip, no fit
violation, bold names at 19px.

Same name, red then green (the pairing the goal asks for): `ฉืน็ลึ่ะฟน๋ญช๋ผผปศึ` passed round 1 in all three
old runs with `scrollWidth - clientWidth` = 1 in each (old runs 1, 2, 3), and in all three current runs with 0 in
each. Whole matrix (name: old per-run values | current per-run values; a name is listed only for the runs where
it passed round 1, so n differs by name):

| name | old | current |
|---|---|---|
| `ฉืน็ลึ่ะฟน๋ญช๋ผผปศึ` | 1,1,1 | 0,0,0 |
| `ตษัะล็นพ๋หฮฟข้ฟั้ซ` | 1,1 | 0,0,0 |
| `แทซัฟปีาซษึศญืฮ่ล` | 1,1 | 0,0 |
| `ทฟหืในวญ็ตษนิาญ` | 1,1 | 0,0 |
| `ลศฟไษ๊ปมญขีะญ้ก็` | 1 | 0,0 |
| `ษิปีญึ้ฟยลิผ๋แป่ฝึคา` | 1 | 0,0 |
| `ไญ็๋ษะฝแญออพมิธิ` | 0 | 0,0,0 |
| `ดศ็๊ญตตพัยะษห๋ทึถ็` | 0,0,0 | 0,0 |
| `ห๋ยะซนฟแมญึฟฮฉ` | 0,0 | 0,0 |
| `ยฝืาบึญญื่ลึ๊ขัแปฉืฝ` | 0,0 | 0 |
| `ผฟึญึาธโลฟญนึผ็๋ตื` | 0 | 0,0 |

The names with 0 in the old column (157px bold width, 1px spill) still break the fit inequality there (the
`fit violations` column counts them) but their `scrollWidth` does not exceed `clientWidth`; only the 158px names
(2px spill) do. So the literal `scrollWidth` metric reds on a subset of band names; the fit inequality reds on all.

Why `scrollWidth` reds with a spill this small (inferred, not tested): Chrome likely adds the inline-end padding to
a flex container's scrollable overflow once the content overflows its content box, so a 2px spill of the run past
the content box would read as 1px past the padding box (`173` against `172`). If so the chip, being
`overflow: hidden`, clips about 1px; no screenshot was taken, so how visible that is to a player is not measured.

## Path gate

`node scripts/evidence-local-path-check.mjs` printed `1946 tracked evidence file(s) scanned ... 0 local-path
hit(s)`; it scans tracked files only and this directory was untracked, so that zero does not cover it. Separate
check: a grep of this directory for the home, system-temp and hyphen-encoded path shapes the gate names, plus the
session-temp directory token and the account name: no match in the evidence files; the same grep matched a scratch
file containing a home path and a temp path (control red). The orchestrator's commit step will put the directory in the gate's view.

## The mechanism, from the mutation log

`log` in each raw file records the frame's mutations with the band-named chips' fitted size and whether the field
carries `pd-marked` (M) or not (u). Old build, every run: field rebuilt marked and fitted bold (19px) at press ->
wave drops the mark -> a refit lands in the unmarked window and grows every band chip back to 20px (regular
width) -> re-mark frame, still 20px, now bold and overflowing. Current build: the refit in the unmarked window is
skipped and the re-mark callback fits, so the chips stay at 19px marked. (The log lists every band-named chip,
including those that did not pass round 1 and so never render bold; those stay at 20px in both legs. The table
reads only the passed chips.) This is the b50b4cf commit message's account, observed in a browser.

## Not covered

- The phone layout (2-column field, `--fit-size` 16), widths other than 1920px, and any roster size other than 30.
- The cold-face order (bold face arriving after the re-mark; `document.fonts.ready` refit), which the old code
  already handled; the face was already loaded in every run here.
- Browsers other than Chrome 157 on this Mac; no iOS WebKit.
- A screenshot of the clipped glyph edge.
- Whether natural names reach the band: the scan found none in 3052, which is a sample, not the population.
