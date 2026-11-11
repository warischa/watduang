# gh#303: prize-draw game boards, the new category page and its home row (2026-11-11), approved 2026-11-11

Five boards in `design/`. The game boards use gh#302's picked B NIGHT STAGE, offer options A and B where a real choice exists, and draw idle, reveal, round result, reduced motion and the never-blank fallback (ADR-0051) at 1920x1080, shown at 75%. The owner picked on 2026-11-11 (popups). Each board carries an APPROVAL RESULT line, PICKED or NOT PICKED on every option's frames and VALUES (the unpicked kept as history), COPY APPROVED on every frame tag, and its pick in `data-pick` on the root.

| Decision | Picked |
|---|---|
| F1 elimination reveal / F2 final variant | A FIVE BURSTS / A SIDE BY SIDE |
| C1 card reveal / C2 red suits | B ALL AT ONCE / #c2185b |
| L1 ladder / L2 no-prize slot | B DEPTH, ONE AT A TIME / "ไม่มีรางวัล" with "ขอบคุณที่ร่วมลุ้น" |
| K1 accent / K2 home placement | A LILAC #c9c2ff / between the fortune and tools rows, typographic (A) |
| K3 event card / K4 third pill | full-width lead card / "ขึ้นจอโปรเจกเตอร์ได้" |
| F3, C3, L3, K5 copy | all proposed Thai copy approved as it stands |

**Changed after the pick (ladder board):** B's far prize slots were drawn at 62% scale (prize name 16.1px at 1920x1080); they are now full size above the far lane ends, joined by leader lines, prize name 30px. **Card art:** the slot in `CatCompany-partyPop` stays empty until the picked art is forwarded.

## REFUTE round 1

- **F1:** card ranks 30px Mitr 700 beside a 24px suit, 6 columns of 40px rows; fireworks prize labels and legend chips 30px; `ld-few` redrawn in B. Non-name text under 30px fails in picked and F frames.
- **F2:** `lib.mjs` copies the gh#302 event (200 invited, 196 joined; rounds 196 to 100, 100 to 50, then 20, then 5). Each judged field carries `data-expect="total/passed"`, checked by the render.
- **F3:** values by role (`roles.mjs`, a VALUES BY ROLE row on each board). Found a real defect: a failed card kept a red rank.
- **F4:** a name or code box sits inside its parent and every clipping ancestor, both axes. **F5:** pseudo-element `content` other than `""`/`none`/`normal` fails, as does any `<template>`. **F6:** the driver fails a green plant, an unapplied plant or a red control (an inert renderer: exit 1). The "field spare" claim was removed.

## REFUTE round 2 (the last round)

- **R1-1, rendered size.** The 30px floor and the NAME FIT floors read computed font size x the scale of every transform, `scale` and `zoom` between the text and its frame (the frame's own 75% is the board's).
- **R1-2, the fixture guard.** `assertEvent(ev, schedule)` is pure and also fails more joined than invited, round-2 participants not exactly the round-1 survivors, and a survivor who never played. The round-1 guard had no joined/invited comparison and only length-checked round 2.
- **Annotations from the fixture:** fw-result now says 100 passed and 96 dark; cd-rule says 50 cards meet the rule; every event count in the fireworks and card prose is generated from `EV` (by construction; no gate reads the prose).
- **Category page, live values:** re-diffed against `src/pages/c/[category].astro`, `src/styles/tokens.css` and `fonts.css`: pills weight 500 (was 700), ad slots `2.5px dashed rgba(20,20,43,0.35)` (was #c9c3a8) with a Mitr 500 label, kicker and cross-link cards Mitr 500 (were 600), card call to action at the inherited weight (was 700; inferred: neither the page, `tokens.css` nor `web.css` sets one); pills drawn as spans. All five boards now load Mitr 500, as the site does. The source is named in the board's NOTES. The ad border has a red (below); the weights have no gate.
- **Closed authoring grammar** (`grammar.mjs`): the only elements, attributes (with value shapes), CSS longhands (with value shapes) and pseudo-elements (`::before`, `::after`) a picked frame may carry; anything else fails, as does a value holding `url(`, `var(` or `attr(`. Computed checks back it: opacity, fill-opacity and stroke-opacity other than 1, a url paint, filter, blend, zoom, individual scale/rotate/translate, a list item, a transform on any element bearing text, and an ancestor that fades or filters the frame.
- **Frames rewritten to fit it:** card suits are inline paths (no `<symbol>`/`<use>`); the rocket trail is a gold taper (no gradient); faded bursts, ladder lanes, the glow (every glow drawn before any path, so none covers another path) and the result's 25% track are solids pre-composited over the ground midpoint #1c1b3c (no opacity); plates, lane plates and slots centre by a negative margin (no transform); the category pills are spans (no list items). The unpicked ladder A keeps its fog gradient: history, and the grammar binds picked frames only.
- **Exclusive ownership:** each property an element renders must be listed by exactly one matching role row; no row is a wildcard (the white-text and ink defaults are gone). Card ranks and suits have a row per state (black, red, failed, face down). The no-owner and two-owner branches went red on the real boards against the round-1 role table (once, not a standing plant).

## Boards and render slices

| Board (slices) | Frame: slice |
|---|---|
| `Gh303Fireworks` (14) | elimination: idle A 1, B 2; countdown A 2, B 3; reveal A 3, B 4; result A 4, B 5; reduced motion A 5, B 6; fallback 6. Final: idle 7, reveal 8, result 9, reduced motion 10 (A and B each); fallback 11; then tables |
| `Gh303Cards` (10) | idle A 1, B 2; code 2; rule 3; reveal 4; result 5; reduced motion 6 (A and B each); fallback 7; then tables |
| `Gh303Ladder` (9) | idle A 1, B 2; reveal A 2, B 3; result A 3, B 4; reduced motion A 4, B 5; `ld-few` 5; fallback 6; then tables |
| `CatCompany-partyPop` (6) | page at 1440: A 2, B 3; then tables |
| `Gh303Home` (4) | 1440: A 1, B 2; 320 A and B 2; then tables |

Renders are `<Board>-<n>.jpg` here, heights 26218 / 17404 / 15372 / 8808 / 6054 at 1600px (the page-13 artboards in `design/canvas.json`). **Why CatCompany-partyPop:** `src/pages/c/category.test.mjs` derives a category's board from its slug (`Cat` + capitalised slug + `Pop.dc.html`) and requires `.game-card-art` there once the category sets `cardArt`; gh#304 wired `company-party`. The rule is byte-identical to `CatPartyPop` and the page. Thai in a frame is proposed copy unless the board's COPY SOURCES row marks it verbatim.

**Against gh#302's picked board** (`design/Gh302Projector.dc.html` B, diffed 2026-11-11): the fallback frames use its values unchanged (10 columns, 32px rows, NAME FIT floor 14px, 220px band, prize-1 floor 96px, the code card, the round dots). The game frames' departures are on each VALUES row: lanterns 8 columns, 27px rows, 18px floor; cards 6 columns, 40px rows, 16px floor; a 190px band.

## How the renders were made

Headless Chrome on port 9334 (profile in the session scratchpad, torn down by pid) loaded each board from `file://` at 1600px; after `document.fonts.ready` and the name-fit script each slice was captured on its own clip (at most 2000px, never cutting a frame) as JPEG q62. One full-page capture repeated the page top past about 16384px, hence per-clip capture. The round-2 slices were viewed: the card faces and rule card with inline suits, the five-burst reveal and result, the final variant's trails and result, the ladder reveal, result, reduced motion and `ld-few`, and the category page. The ladder reveal showed an opaque glow covering another path; the glows now draw first.

```
node make-boards.mjs     # writes the five boards; identical hashes over two runs
SHOT_TMP=<scratch dir> node render-boards.mjs ../../../../design/Gh303*.dc.html ../../../../design/CatCompany-partyPop.dc.html
node thai-scan.mjs ../../../../design/Gh303*.dc.html ../../../../design/CatCompany-partyPop.dc.html *.mjs README.md
node mustred.mjs <scratch dir outside the repo> <repo root> <absolute path of render-boards.mjs>
```

Edit the generator (`make-boards.mjs`, `lib.mjs`, `stage.mjs`, `roles.mjs`, `grammar.mjs`, `board-*.mjs`), never the boards.

## Must-red

`mustred.mjs` feeds `assertEvent` two broken events, then copies a board per plant into `<scratch>/gh303-mr/<plant>/design/` (with `public/` linked), plants one fault and runs the render (`CHECK_ONLY=1`). A plant counts only if the render exits 1 AND reports its own check's line. Last run: both controls green, all 31 plants red on their own line (29 board, 2 source), exit 0. With an inert renderer it exits 1 (29 UNEXPECTED); a plant red on another check's line counts as UNEXPECTED (seen once, exit 1).

| Check | Plant: its line |
|---|---|
| Frame matrix, fonts, console, overflow | renamed frame, broken Sarabun 700, a `throw`, a 1700px block |
| Clip, NAME FIT, 12-letter names, name floor, field rows, overlap, tap | floor 20 without wrap; plates wrapped at 120px; lantern floor 20; card names 10px; rows 34px; plates at one x; see-all shrunk |
| Text floor at rendered size | legend 24px: `@24.0px rendered`; `.gname` 50px with `scale(0.5)`: `@25.0px rendered (50px x 0.50)` |
| Field counts | `100/51`: `field count in A/cd-result` |
| Values by role, exclusive | `#00ff00` game name; unpicked card ground #23214d; red rank #ff3d7f; white rank on a red card: `(role: rank on a red card) renders color:#ffffff`; the old ad line #c9c3a8: `(role: ad slots) renders border-color:#c9c3a8` |
| Grammar | a heart `<symbol>` through `<use>` in #ff3d7f: `element <use> is outside the grammar`; a gradient stop in the NOT PICKED #23214d: `element <defs>`; `fill-opacity: 0.5`: `computes fill-opacity 0.5`; `::marker { content: "\00644" }`: `pseudo-element ::marker` |
| Containment, generated text, template, rendered text | lanterns 1px tall; `::before` content; a `<template>`; a barred word split by a `<span>`; a hex reference to U+0644 |
| Event guard (source) | 1 invited: `196 joined but only 1 invited`; an outsider in round 2: `round 2 participants are not exactly the round 1 survivors` |

Run against the round-1 render, the white rank on a red card and the 50px text at `scale(0.5)` both passed green: the two holes were real.

**Inherited, not counted:** each board logs one `ERR_FILE_NOT_FOUND` for `design/support.js`, which the canvas tool supplies. **Source scan** (`thai-scan.mjs`): a foreign letter or mark, an invisible character, a numeric character reference or a barred word fails; clean on all five boards, every script here and this README.

## NAME FIT

The gh#302 rule: 12 grapheme clusters at most; a name shrinks 1px at a time to its floor without 2% slack, then wraps to a second line; each floor keeps 12 x W and 12 x U+0E12 on one line; 12 x U+0E12 U+0E33 wraps. All three are drawn among the names and finalists. Each board's NAME FIT row lists every surface.

## Design input

ui-ux-pro-max 2.13.0, one intent per query, over `--domain ux`, `--domain gsap` and `--stack threejs`; WCAG 2.3.1 is applied from outside the skill. Each board's RULES CHECKED row lists them.

## Not covered

- A real projector, room or venue frame rate; the 3D motion itself (the frames are 2D stills).
- Type by role: roles own paint; type is held by the floors and the grammar's value shapes.
- The page boards beyond the category page's diffed values; the home row was not re-diffed this round.
- The name-fit script under the canvas tool's `support.js`; the category page at phone width; the card art.
