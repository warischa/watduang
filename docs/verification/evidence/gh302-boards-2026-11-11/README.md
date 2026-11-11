# gh#302: prize-draw event boards, rendered and owner-approved (2026-11-11)

Three boards in `design/` cover every event screen. Each one is drawn in two directions: **A POSTER** (light, the site's canvas D language) and **B NIGHT STAGE** (dark, with four values labelled PROPOSAL). The owner picked by popup on 2026-11-11:

| Board | Owner's choice (popup 2026-11-11) |
|---|---|
| `design/Gh302Setup.dc.html` | **A POSTER**. B was NOT PICKED. |
| `design/Gh302Projector.dc.html` | **B NIGHT STAGE**. B's four PROPOSAL values are now picked values. A was NOT PICKED. |
| `design/Gh302Phone.dc.html` | **A POSTER**. B was NOT PICKED. |

Also decided:
- The proposed Thai copy is approved as it stands.
- The name limit is 12.
- A round code is 9 digits for a cut round (gh#300, changed from 8) and 12 for a card-deal round.

The picked code frames now carry 9 digits, grouped 3-3-3: B's projector code card and A's phone code-entry and wrong-code states. The 12-digit card-deal code, grouped 4-4-4, is named on the board but not drawn.

The boards carry PICKED and NOT PICKED stamps; nothing was deleted. The slices below are the unstamped renders the owner picked from, with 6-digit codes. The three changed picked frames were re-rendered alone at their authored size:
- `Gh302Projector-proj-code-B.jpg` (1920x1080)
- `Gh302Phone-reveal-code-320-A.jpg` (320x568)
- `Gh302Phone-reveal-wrong-320-A.jpg` (320x568)

They were made with `FRAME_SHOTS=... node render-boards.mjs`. The stamps lengthened the boards, so the artboard heights in `design/canvas.json` (another agent's file) are now 12642, 13250 and 9866.

| Board | Frames (each in A and B) | Renders |
|---|---|---|
| `design/Gh302Setup.dc.html` | setup-admin (the whole page at 1280, with the ad slot), setup-qr (the review list), setup-schedule-error | `Gh302Setup-1..7.jpg` |
| `design/Gh302Projector.dc.html` | proj-lobby, proj-round, proj-reveal (the plain 2D fallback), proj-code, proj-result, each authored at 1920x1080 and shown at 75% | `Gh302Projector-1..8.jpg` |
| `design/Gh302Phone.dc.html` | join-pin, join-name, join-taken and join-device at 320 and 375; reveal-code, reveal-wrong, reveal-pass, reveal-out, reveal-card and claim at 320 | `Gh302Phone-1..6.jpg` |

All Thai in the frames was new **proposed copy** (no src copy existed for this feature), and it is now owner-approved as it stands. The COPY SOURCES row on each board lists every string. The only strings taken from elsewhere are `ช่องโฆษณา` (from `src/pages/index.astro`) and the two game names (from gh#299).

## How the renders were made

This is the gh#295 method. Headless Chrome (`--headless=new`) loaded each board from `file://`, with its own CDP port (9333) and a profile outside the repo. After `document.fonts.ready`, the page was captured at 1600px wide. It was cut into slices no taller than 2000px and saved as JPEG at quality 62. No cut line passes through a frame that fits in one slice. A taller frame (the setup page) is cut only between its sections. Every slice was viewed at full size during the iterations. In the final render, the frames that last changed (the setup toggle and the review list, the projector round pills, B's dimmed names) were viewed at full size, and every slice was checked on contact sheets as well as by the checks below.

```
node make-boards.mjs                                              # writes the three boards (deterministic)
SHOT_TMP=<scratch dir> node render-boards.mjs ../../../../design/Gh302*.dc.html   # checks + slices
node thai-scan.mjs ../../../../design/Gh302*.dc.html make-boards.mjs
```

Edit the generator, not the boards.

## What the render checks found (last run), and the red each check produced first

| Check | Last run | Must-red |
|---|---|---|
| Frame matrix (every expected frame exists once per direction) | 44 frames, complete | One frame renamed in a scratch copy produced `frame B/join-taken-375 found 0 times` |
| Overflow, and a name chip clipped (200 names, one at the 12-grapheme-cluster cap) | none | The cap name tripled in a scratch copy produced `clipped chips in A/proj-round` (and 5 more) |
| A control label wrapping onto two lines | none | A real bug was caught first: the `.seg span` rule hit a nested span, producing `control label wraps ... ให้สแกน QR เข้าร่วม`. It was fixed afterwards |
| Console errors (exceptions, `console.error`, and `Log` errors such as a failed resource load) | none apart from the inherited one below | A scratch page with a planted `throw` and a missing script was caught on both counts |
| Fonts | Sarabun 400/700 and Mitr 600/700 all `loaded` from `file://` | — |
| Smallest tap control | setup 44px (delete), phone 52px | — |
| Smallest font in a frame (name chips excluded; the board reports them at 20px) | projector 30px, setup 16px, phone 16px | First run: projector 26px (A's round pills), setup 12px (the probe was counting the annotation stub), phone 15px. Each was fixed or excluded |
| Primary phone button bottom edge | at most 375px, inside the 568px fold | — |
| U+25CC in `innerText` | none | A planted U+25CC in a scratch copy produced `U+25CC in innerText` |

**Inherited, not counted:** each board logs one `ERR_FILE_NOT_FOUND` for `design/support.js`. The board pattern loads that file, and the canvas tool supplies it; it is not in the repo. The control board, `design/Gh295Home.dc.html`, logs the same line.

**Thai scan** (`thai-scan.mjs`, run over whole files rather than extracted Thai runs):
- Result: no letter or mark outside ASCII and U+0E00–U+0E7F, no invisible character, and none of the words gh#299 bars. This holds for all three boards and the generator.
- The only other non-ASCII characters are `·`, `…`, `“` and `”`.
- Must-red: a scratch copy with an Arabic U+0644 planted inside a Thai word and one barred word failed on both.

**Runtime references:** nothing in `src/`, `public/` (which holds `staticwebapp.config.json`) or `astro.config.mjs` names a `Gh302` board. A `Gh288MotionSheet` grep, used as the positive control, hits `src/styles/tokens.css`.

## Design input: ui-ux-pro-max 2.13.0

These are the queries that were run, one intent each, with neither `--persist` nor `--design-system`:
- `--domain ux`: projector legibility and contrast, touch target size, reduced motion, form error validation, colour not only
- `--stack threejs`: WebGL fallback and performance, context loss, dispose, pixel ratio
- `--stack astro`: islands and hydration

Each board's RULES CHECKED row lists the rules applied and the computed WCAG contrast for every colour pair used.

## Not covered

- A real projector, a real room, and viewing distance. The contrast figures are computed, not measured on a wall.
- Real phones, Safari and Firefox.
- Real AdSense (gh#29).
- The setup page at phone width.
- Each game's own 3D frames (gh#303).
- The QR in the frames is a placeholder pattern and cannot be scanned.
- The 6-digit round code is a placeholder until gh#300 fixes the format.

## REFUTE round 1 fixes (2026-11-11)

All five findings are fixed in the generator and the checks. The changed picked frames were re-rendered alone at their authored size as `<Board>-<frame>-<dir>.jpg` (27 files):
- Setup A: setup-admin, setup-qr
- Projector B: lobby, round, reveal, code, code-card, result
- Phone A: all 15 picked frames, plus the four Thai-at-320 worst cases

The 21 slices are still the unstamped renders the owner picked from.

| Finding | Change | Must-red, each a scratch copy with real font paths and a clean control (rc 0, 0 problems) |
|---|---|---|
| F1: 12-digit code not drawn | New picked frames for the card-deal round, grouped 4-4-4: B `proj-code-card` (round 2, 100 names, digits at 150px) and A `reveal-code-card-320` (26px). The codes carry `.fits`, and the render fails if one clips or wraps | — (covered by the F2 name/code check) |
| F2: capped names unproven | The NAME FIT row on each board states the rule: render at the surface's size, shrink in 1px steps to a floor, then wrap onto a second line (the typed name field scrolls instead). Every picked frame showing a name draws the widest names among the 200 (see the cluster correction below). Fitted sizes measured by the render are recorded in `name-fit.json`. B's field went to 10 columns with 8px chip padding. Floors: projector names 14px, prize-1 name 96px, result cards 32px, phone name card 21px, review row 17px | With the fitted sizes stripped, the check failed 16 times (`name or code clips in B/proj-round: "WWWWWWWWWWWW" at 20px`); with the wrap step stripped, it failed 8 times (`name or code clips … at 14px`) |
| F3: one role, two values | B code and QR cards set to 24px radius; A phone button set to 16px radius and a 5px shadow. Zero-area SVG strokes got `fill="none"`, and the frame edge became an outline. The picked VALUES table now lists every rendered value, one role per row, and the render fails on any rendered value it does not list | The old 4px button shadow: `values not in the A VALUES row ... box-shadow:#14142b 4px 4px 0px 0px` |
| F4: measurements were not assertions | All now fail the run: text >= 16px (setup, phone) or >= 30px (projector) unless it is a name with a floor; every tap >= 44px; the four faces present and loaded; the primary button's bottom at or above `data-fold` | 1px text: `text below 16px`. 1px tap: `tap control below 44px`. Missing font file: `font Mitr 700 status error`. Button pushed to 1193px: `primary button below the fold ... > fold 568px` |
| F5: scan read source only | The render scans each frame's innerText after fonts load, plus the whole board, using `scanText` from `thai-scan.mjs`. The CLI scans each file raw and again with tags stripped and entities decoded | The reviewer's two counter-examples, planted only in scratch copies and not quoted here (quoting them would plant them in this file): a barred word split by a `<span>` made the rendered scan red (barred word); a Thai word carrying an Arabic letter as a numeric character reference made it red (U+0644). The source scan read raw `ok` on both (the gap the reviewer found) and decoded `FAIL` on both |

## Correction: the name cap counts grapheme clusters (2026-11-11)

The owner's cap is **12 grapheme clusters**. The gh#308 server counts them under UAX #29 with `Intl.Segmenter`, so a letter with its marks is one cluster, and the gh#304 tracer counts the same way. The boards and this README now say clusters.

Measured, first with `Intl.Segmenter` and then with canvas `measureText` in the self-hosted faces:
- **Marks that add no width.** Thai above and below marks (U+0E31, U+0E34–U+0E3A, U+0E47–U+0E4E) join their cluster and stack.
- **U+0E33 (SARA AM) adds width.** It also joins its cluster, but it is a spacing mark. Twelve U+0E12 U+0E33 pairs make 12 clusters and measure **58% wider** than U+0E12 ×12: Sarabun 700 at 20px, 332.6 vs 210.2px; Mitr 700, 341.0 vs 231.1px.
- **The cluster cap bounds no width.** U+0E12 followed by 23 U+0E33 is still one cluster. The NAME FIT rows propose for gh#308: at most one U+0E33 per cluster, and only after a Thai consonant or tone mark. With that rule, the 24-code-point U+0E12 U+0E33 ×12 is the widest well-formed case.

That case is now drawn among the 200 names in every picked frame that shows a name, alongside `W` ×12 and U+0E12 ×12. The floors still keep every 12-base-letter name on one line; only the spacing-mark name reaches a floor and wraps to a second line. The setup review row, the projector name chips and the phone name card and header pill wrap. The prize-1 name shrinks to 110px on one line. The typed field scrolls.

The render now accepts a wrap only at the floor, on at most two lines, with nothing hidden. With the wrap step stripped from a scratch copy, it failed (`name or code clips in B/proj-round … at 14px`).

Re-rendered (text changed): Setup A setup-admin and setup-qr; Projector B round, reveal, code, code-card and result; Phone A join-name-375, join-device-375 and the four Thai-at-320 frames.

## NAME FIT depends on gh#308's join rules

The fit claims on these boards hold only while the gh#308 server enforces its name rules:
- **Allow-list:** Thai and ASCII letters and digits, space, and `. - ' _`.
- **Code points:** at most 3 per grapheme cluster.
- **SARA AM (U+0E33):** at most one per cluster, and only after a Thai consonant or tone mark.

Under those rules:
- **Thai:** U+0E12 U+0E33 ×12 is the widest valid name. U+0E13 U+0E33 ×12 is 0.6% wider in Sarabun 700, inside the 2% slack.
- **Latin:** `W` ×12 is the widest.
- **Out of scope:** a run of repeated U+0E33, such as U+0E12 followed by 63 of them, is refused at join and is not a fit case.

If gh#308 loosens any of these rules, the NAME FIT tables no longer hold and the floors must be re-measured.

## REFUTE round 2 fixes (2026-11-11, the last round)

The changed picked frames were re-rendered at authored size:
- Setup A: setup-admin, setup-qr
- Projector B: round, reveal, code, code-card, result
- Phone A: reveal-out-320, claim-320

Each must-red ran on a scratch copy kept under a `design/` path with real font paths. The unmodified controls (projector, phone, setup) returned rc 0 with 0 problems.

| Item | Change | Must-red |
|---|---|---|
| F2 | The result-card floor stays 35px; U+0E12 ×12 now wraps onto two lines at 35px | The name set to 32px: `name wraps above its floor in B/proj-result … at 32px (floor 35px)` |
| F4 | Legend labels raised to 30px (B, and the unpicked A for parity). The text-size exemption now covers only name elements, meaning those with their own `data-floor` (unpicked stage chips carry their 20px size as their floor) | Legend set back to 24px: `text below 30px in B/proj-reveal: "ผ่าน" 24px` |
| N2 | The picked fixtures are one event: 200 invited, 196 joined (review list, lobby, start), round 1 cuts 196 to 100, round 2 holds those 100. Each projector frame carries `data-expect-chips/in/out`, and the render counts the field against them | One passed chip flipped: `field count in B/proj-reveal: in 99, the frame says 100` |
| N3 | A name's box must sit inside its parent and inside every clipping ancestor up to the frame, on both axes | Review row squeezed to 30px: `… outside its parent or a clipping ancestor (jrow) in A/setup-qr` |
| N4 | The generator builds every picked fixture from one event (`EV`). `assertEvent()` and the frame helpers throw when the sets disagree: field, survivors, winners, the did-not-pass identity, the prize a claim frame shows. The phone claim now reads its prize from the event (W ×12 is prize 2, as on the projector) | Three generator mutations each threw before writing anything: a winner who did not pass, a did-not-pass identity who passed, a claim for someone who won nothing |
| F3 | The VALUES table is now ROLES: each row carries an element selector list and the only values those elements may render. Text roles grant text colours only, so a box value needs a box role that names the element. `::before` and `::after` are sampled too, and a pseudo-element with content other than `""` fails | A 20px phone button radius: `div.btn.tap (roles: button) renders radius:20px`. A role-less gold div: `matches no box role`. A styled `::after`: `div.btn.tap::after matches no box role` |
| F5 | The file scan fails on any template element and on any CSS `content:` value other than `''`, `""`, `none` or `normal`; numeric references now decode without a trailing semicolon. The render also fails on a template element on the board and on pseudo-element text, so all visible text is in the DOM, where the rendered scan reads it | The reviewer's template example (a barred word as three numeric references): file scan FAIL (template, and the decoded barred word) and render FAIL. The CSS-escaped barred word in `::before`: file scan FAIL (CSS content) and render FAIL (`h3::before carries content`) |
| N1 | The README NAME FIT dependency above, and the board's NAME FIT rows, now cite gh#308's enforced rules | — |
