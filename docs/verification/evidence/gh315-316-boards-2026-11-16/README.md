# gh#315 / gh#316: phase-2 elimination game boards (2026-11-16), DRAWN TO THE OWNER'S PICKS 2026-11-18

Two boards in `design/`: `Gh315Zones.dc.html` (โซนสีลุกยืน, the colour-zone stand-up round) and
`Gh316Marbles.dc.html` (แข่งลูกแก้ว, the marble race). Both use gh#302's picked B NIGHT STAGE and gh#303's picked
values, offer options A/B/C per genuinely open decision, and draw idle, reveal, round result, reduced motion (the
2D path, also what below 640px shows) and the never-blank fallback (ADR-0051) at 1920x1080, shown at 75%.
**Picked 2026-11-16** (Z1 A FOUR BLOCKS, Z2 B NAMES SIT IN THEIR ZONES, Z3 approved; M1 A HEAT LANES, M2 A FREEZE
AT THE CUT, M3 approved; owner popups recorded on gh#315 / gh#316). The 2026-11-17 audit's owner-pick findings
were picked 2026-11-18 and are stamped here under gh#319 (canvas first, then code, ADR-0033): each board's header
is the Gh305AuditFrames picks banner with the picks quoted verbatim from the ticket's last pick comment; the
ratified values land in MOTION / VALUES / NOTES / COPY SOURCES and, for the marbles heat counter, in the counter
itself (the denominator is the heats that run). Every Thai string in a frame is approved copy (Z3 / M3) or
verbatim from a picked board or the ticket (COPY SOURCES).

Every count on both boards is the gh#303 event fixture (`lib.mjs` EV, imported read-only): 200 invited, 196 joined,
round 1 cuts 196 to 100, round 2 100 to 50, then 20, then 5 finalists. The three NAME FIT worst cases (12 x W,
12 x U+0E12, 12 x U+0E12 U+0E33) are drawn among the joined names on every surface.

## Fork ruling (source commit `1f575748a6c39b07a92d3a429fe8e8f8da2a60d3`)

The gh#303 directory (`../gh303-boards-2026-11-11/`) is read-only. Its libs are imported from there unchanged
where they can be; a lib is copied here only where it must change, and the change is named:

| File | How | Change from the gh#303 source |
|---|---|---|
| `thai-scan.mjs` | imported in place, never copied | none (generic raw-file scan) |
| `lib.mjs` | copied | the fixture, colour maths, SVG helpers, NAME FIT rule and annotation chrome are RE-EXPORTED from gh#303's lib unchanged; redefined here: the copy registry's source strings, COPY SOURCES, the frame tag, RULES CHECKED (2.5.0, queried 2026-11-16), boardDoc's generator comment; post-pick (2026-11-18, gh#319) the chrome stamps COPY APPROVED (Z3 / M3, 2026-11-16) and boardDoc writes the Gh305AuditFrames picks banner (picksBanner) with the 2026-11-18 picks quoted verbatim; added `fadedOver()` (a fade over an arbitrary base) and the zone palette constants |
| `stage.mjs` | copied VERBATIM (sha256 identical: `dab6beb6…0ebb89`) | none in the bytes; its `./lib.mjs` import now resolves to THIS directory's lib copy, so one copy registry serves the whole board |
| `grammar.mjs` | copied | ONE value change: `data-dir` admits `C` as well as `A,B,F` (three layout options); plus a fork header comment |
| `render-boards.mjs` | copied | CDP port defaults to 9555; EVERY option frame and the shared F frame is checked (no pick exists), each against its OWN dir's role table; no `data-pick` requirement (a `data-status` and a role table per dir are required instead); the frame matrix comes from the generators; the grammar report cap raised 8 to 40 (a plant tripping one computed check on every frame must not bury another check's line) |
| `mustred.mjs` | copied | plants rewritten for these boards' frames and checks; two controls (one per board); the idle-leak plants are new |
| `roles.mjs`, `board-zones.mjs`, `board-marbles.mjs`, `make-boards.mjs` | new | the shared chrome role rows are gh#303's STAGE rows verbatim (proven green there); the game rows are new |

## Decisions for the owner (owner popup 2026-11-16: Z1 A, Z2 B, Z3 approved; M1 A, M2 A, M3 approved)

### gh#315 โซนสีลุกยืน

| Decision | Option | One line | Picked |
|---|---|---|---|
| Z1 zone layout | A FOUR BLOCKS | 2x2 tinted panels, four zones of 49, names 20px to an 18px floor; strongest spatial grouping (`zn-idle A`) | **PICKED** 2026-11-16 |
| | B SIX COLUMNS | six colour columns of 33/33/33/33/32/32, names 18px; smaller groups, one name wide (`zn-idle B`) |  |
| | C TAGGED FIELD | the gh#303 picked field unchanged (8 cols, 27px rows), zones as dots in each chip, names to a 16px floor; readability first (`zn-idle C`) |  |
| Z2 how the cut lands | A WHOLE ZONES SIT | zone sizes drawn to the cut (48/48/50/50 here) so whole zones sit as one; **disclosed:** a player's zone leaks their fate at assignment (the gh#300 R2 precedent); odds unchanged (`zn-wholeidle`, `zn-whole`, `zn-wholeend`, `zn-wholerm`) |  |
| | B NAMES SIT IN THEIR ZONES | random zones, the verdict per name in a zone-by-zone wave; suspense kept; badges count who sat (`zn-reveal`, `zn-result` on every layout) | **PICKED** 2026-11-16 |
| Z3 proposed copy | — | approve, or mark strings to change (the board's COPY SOURCES row) | approved as it stands 2026-11-16 |

Z1 and Z2 mix freely: say so on the ticket. Z2-B is drawn on all three layouts; Z2-A on layout A (its geometry on
B/C is the same landing in those layouts' panels).

### gh#316 แข่งลูกแก้ว

| Decision | Option | One line | Picked |
|---|---|---|---|
| M1 track / how 200 names read | A HEAT LANES | 10 heats of 20 (last 16), names 28px to an 18px floor on 340px plates; 20 names read big at a time, the whole field over the round (`mb-idle A`) | **PICKED** 2026-11-16 |
| | B PACK + FULL ROSTER | all 196 names at once in a 10-column grid (18px to a 14px floor) under a 280px pack-race strip; the grid is the readable truth (`mb-idle B`) |  |
| M2 the cut moment | A FREEZE AT THE CUT | time stops the instant the drawn 100th survivor crosses; across = gold + glow, stopped = dim (`mb-reveal A/B`) | **PICKED** 2026-11-16 |
| | B PHOTO FINISH | no freeze: crossing order IS the draw's order, the first 100 across stay in (`mb-photo A/B`) |  |
| M3 proposed copy | — | approve, or mark strings to change (the board's COPY SOURCES row) | approved as it stands 2026-11-16 |

M1 and M2 mix freely. Marble colour is decoration (four canvas accents cycling) and carries no zone or fate
meaning; fate is gold or dim, never colour alone (dim AND struck through AND the legend in words).

## Changed after the pick (2026-11-16)

The picks above came from the sheet rendered before this change; its PICKED rows are untouched. The freeze frame on
that sheet counted 100 passed while freezing in a heat that cannot produce them, so the crossing order and the freeze
heat were fixed:

- **The crossing order is heat-major.** Heats run one after another in play order, so every survivor of heat 1 crosses
  before any survivor of heat 2, and the drawn 100th survivor can only cross in the last heat that holds one.
  `crossOrder` was the fixture's insertion order, which interleaved the heats, so a still derived from it froze in
  heat 1 — counting 100 passed with heats 2 to 10 never run. It is now each heat's survivors in that heat's own drawn
  order, heat by heat. The survivors are still the draw's (decision 7: the race stages a fixed result); a build whose
  order is not heat-major fails.
- **The freeze heat is the heat of `crossOrder`'s 100th entry** — the last heat holding a survivor, heat 10 of 10 with
  this fixture, which is where the frame's own rule puts it. The motion total (all ten heats plus the freeze, 65s) and
  the round-result sentence (the cut landed in the last heat) follow it again.
- **M2-B A HEAT LANES is marked not coherent with heats.** Under sequential heats, "the first 100 across stay in"
  would let heat order decide who crosses first, which breaks the draw's equal odds. The frame is drawn mid-race to
  complete the option pair and its tag says so; M2-B was not picked. The pack-race photo frame (B) is not affected.

Re-rendered and re-measured 2026-11-16: the sha and rendered-codepoint lines under Verify are this build's, and the
slice table above still holds (every frame sits in the slice named there).

## Boards and render slices

Renders are `<Board>-<n>.jpg` here, 1600px wide, JPEG q62, one clip per slice (at most 2000px, never cutting a
frame). Board heights at 1600px: **Gh315Zones 28665**, **Gh316Marbles 20140**. 27 JPGs = 16 + 11, matching the
tables below (frame offsets probed in the same browser at the same width).

| Gh315Zones slice | Carries |
|---|---|
| 1 | header, decisions pin, Z1 idle A |
| 2 | Z1 idle B, C |
| 3 | Z2-B reveal A, B |
| 4 | Z2-B reveal C, Z2-A idle (`zn-wholeidle`) |
| 5 | Z2-A reveal (`zn-whole`), end (`zn-wholeend`) |
| 6 | Z2-A reduced motion (`zn-wholerm`), Z1 result A |
| 7 | Z1 result B, C |
| 8 | Z1 reduced motion A, B |
| 9 | Z1 reduced motion C, never-blank fallback |
| 10 | MOTION beat tables, RULES CHECKED, VALUES head |
| 11 | VALUES tail, NAME FIT |
| 12 | VALUES BY ROLE dir A |
| 13 | VALUES BY ROLE dir B |
| 14 | VALUES BY ROLE dir C |
| 15 | VALUES BY ROLE dir F |
| 16 | COPY SOURCES, NOTES |

| Gh316Marbles slice | Carries |
|---|---|
| 1 | header, decisions pin, M1 idle A |
| 2 | M1 idle B, M2-A freeze A |
| 3 | M2-A freeze B, M2-B photo A |
| 4 | M2-B photo B, M1 result A |
| 5 | M1 result B, M1 reduced motion A |
| 6 | M1 reduced motion B, never-blank fallback |
| 7 | MOTION beat tables, RULES CHECKED |
| 8 | VALUES, NAME FIT |
| 9 | VALUES BY ROLE dirs A, B |
| 10 | VALUES BY ROLE dir F |
| 11 | COPY SOURCES, NOTES |

## Design values and their canvas sources

- Projector chrome: gh#302 B NIGHT STAGE picked 2026-11-11 (night gradient #14142b to #23214d, gold #ffcc00 passed
  state with the glow, dim #9a97c0 + line-through out state, soft #d9d6f0 secondary, white #ffffff primary, the
  round dots, the result band). The fallback frames carry those values UNCHANGED (10 columns, 32px rows, 14px
  name floor, 220px band).
- Zone colours (gh#315), each already in the canvas: punch #ff3d7f (`tokens.css --accent-punch`, gh#302 B picked),
  sky #2b7bff (`--accent-sky`, gh#302 B), lilac #c9c2ff (`--accent-lilac`, gh#303 K1 PICKED), white #ffffff
  (`--ink-light`), soft #d9d6f0 (`--ink-on-band-soft`, layout B only), cream #fff6e0 (`--color-ground-warm`,
  canvas D, layout B only). **Gold is reserved for the passed state**, so no zone or marble identity colour is gold.
- Panel grounds: the zone colour at 14% pre-composited over the night midpoint #1c1b3c (`faded()`, the gh#303
  mechanism): #3c2045, #1e2857, #343257, #3c3b57, #363555, #3c3a53. A 3px zone rim, 24px radius (the gh#302
  winner-card radius).
- Measured 2026-11-16 (WCAG relative luminance, computed): zone-coloured header text on its own tint FAILS for
  punch (4.19:1) and sky (3.60:1), so headers are white with a zone dot (10.74:1 or better on every tint).
  White on night 15.04, ink on gold 11.93, dim on night 5.42.
- Race track (gh#316): #14142b (`tokens.css --color-line-strong`, the gh#302 ground's top stop) so the night name
  pills read as raised on it; every fade on the track is pre-composited over #14142b (`fadedOver()`), not over the
  frame midpoint. Finish line 4px gold with a 24px glow at 35%; lane separators soft at 25%; marble bodies the four
  non-gold accents, stopped at 40%, streaks at 35%, spec highlight white.
- Departures, each a PROPOSAL for the game frames only: the lower band 170px (gh#303 drew 190px); the zone field
  100..870; layout A panels 4 columns of 22px rows; layout B 21px rows; layout C a 14px zone dot costing name width
  (16px floor); marbles A 20 lanes of 36.5px with 340x32px plates, B a 280px strip over 10 columns of 21px rows.
- New drawings, PROPOSAL: the seated figure (head, back, thigh, shin), the marble (body, spec, streak, glow), the
  zone badge wording. No new colour, font or radius outside the canvas.

## Rules input (ui-ux-pro-max 2.5.0, design input per the gh#299 owner ruling 2026-11-11)

Queried 2026-11-16 with `--domain ux`: "animation reveal duration easing stagger", "readability large display
distance contrast font size", "reduced motion vestibular sensitivity", "color only indicator meaning
accessibility", "flashing seizure blink" (returned nothing); `--stack threejs`: "instanced mesh many objects
performance", "webgl context lost fallback". Rules taken, never its palette or fonts; no `--persist`, no
`--design-system`. Applied (each board's RULES CHECKED row carries the same list with its own specifics):
Excessive Motion (1-2 moving elements per view); Reduced Motion / Motion Sensitivity (the RM frames are the final
readable states, the round still finishes); Easing Functions (ease-out on arrivals, linear only on the count as a
progress readout); Duration Timing (150-300ms micro, beats sized by what they carry); Continuous Animation (one
1px ambient loop, stopped under reduced motion); Color Only (dim AND strike AND words); Color Contrast (4.5:1,
computed, with the punch/sky header rejection above); Readable Font Size (the phone path keeps the gh#302 14px
floor); threejs InstancedMesh / Single Renderer / pixel-ratio cap 2 / dispose / canvas role="img" + live region
(ADR-0051). Flashing is not from the skill (its query returned nothing): WCAG 2.3.1 applied from outside it.

## NAME FIT (the gh#302 rule, on these boards' surfaces)

12 grapheme clusters max; shrink 1px to the floor, then two lines; never clipped, never three lines. Floors:
zones A 18px (4 columns in an 894px panel), zones B 18px (the column less padding), zones C 16px (the dot costs
width), marbles A plates 18px (a 316px box takes even the SARA AM case on one line), marbles B grid 14px,
fallback 14px (gh#302 picked). The render fails a clip, a wrap above a floor, a 12-base-letter wrap, a missing 2%
slack, or a field whose rows overflow it. Measured on the rendered frames: the SARA AM case wraps on every surface
except the marble plates; 12 x W and 12 x U+0E12 stay on one line everywhere.

## How the renders were made

One headless Chrome (`--headless=new --disable-gpu --no-sandbox`, the boards are 2D stills with no WebGL) on CDP
port **9555** only, profile under `<tmp>`, torn down by the pid this run started. Each board loaded from `file://`
at 1600px; after `document.fonts.ready` and the name-fit script, each slice captured on its own clip as JPEG q62.
All five self-hosted faces report loaded; the one inherited console error per board is the missing
`design/support.js` the canvas tool supplies. The round-2 slices were viewed (zone idle A/B/C, reveal A/C, whole
zones, result B, reduced motion C, both fallbacks; marble idle A/B, freeze A/B, photo B, result A): the first
render exposed two real defects the checks could not see — idle plates/marbles leaking the draw in gold, and the
lane plate column positioned frame-relative instead of track-relative — both fixed, and the idle leak is now a
judged invariant (`data-expect="N/0"` at idle) with two must-red plants.

```
node make-boards.mjs          # writes both boards; identical sha256 over two runs
SHOT_TMP=<scratch dir outside the repo> node render-boards.mjs ../../../../design/Gh315Zones.dc.html ../../../../design/Gh316Marbles.dc.html
node ../gh303-boards-2026-11-11/thai-scan.mjs ../../../../design/Gh315Zones.dc.html ../../../../design/Gh316Marbles.dc.html *.mjs README.md
node mustred.mjs <scratch dir outside the repo> <repo root> <path of render-boards.mjs>
```

Edit the generators (`make-boards.mjs`, `lib.mjs`, `stage.mjs`, `grammar.mjs`, `roles.mjs`, `board-*.mjs`), never
the boards.

## Verify (measured this session)

- `node make-boards.mjs` twice: identical sha256 both runs (re-measured 2026-11-18 after the pick stamps;
  `git status --porcelain` unchanged across the second run) —
  Gh315Zones `cfd875615b67dc77c239da6b05117251cd09351c3ff00276a345fd77bd00496e`,
  Gh316Marbles `556ee40fb63f23d7602e54c6fe77839f7fb01b2b86e5b381f5062f47064fe8f0`.
- Render: exit 0; Gh315Zones 0 problems, 17 frames, 16 slices; Gh316Marbles 0 problems, 11 frames, 11 slices;
  27 JPGs on disk, exactly the slices the tables above list. Page heights 29331 / 21127 at 1600px (measured
  2026-11-18; the picks banner grew the header). The 2026-11-18 re-render ran on CDP port 9333 with its own
  `--user-data-dir`, per the gh#319 brief; the 2026-11-16 run used 9555. The stamp slices were opened (zones
  MOTION/VALUES and COPY/NOTES, marbles MOTION/VALUES and COPY/NOTES, both banners): the ratified values render
  as written, Thai as words.
- `thai-scan.mjs` over both boards, every `.mjs` here and this README (12 files): exit 0, no foreign letter/mark,
  no invisible, no character reference, no barred word. Must-red, three plants in temp copies of a board, each
  exit 1 on its own line: a contiguous barred word (`barred words U+E2B U+E27 U+E22`), a numeric character
  reference to U+0644 (the ampersand-hash form, reported under `character references`), a U+200B
  (`foreign letters/marks/invisibles U+200B`). The reference is named here, not written: this scan fails any
  numeric reference in a file it reads, including this one.
- `mustred.mjs`: exit 0 — **30 plants and 3 controls, 0 unexpected**; every plant red on its OWN check's line.
  With an inert renderer (a stub that always exits 0): exit 1, 28 unexpected (the two board controls and the three
  source-side event checks stay as expected; every board plant comes back green-or-missing).
- `node scripts/evidence-local-path-check.mjs` (from the repository root, with these files tracked) reports 0 local-path hits for the two boards and this directory.

## Must-red table (plant: the line its own check reported)

| Check | Plant: its line |
|---|---|
| Event guard (source) | 1 invited: `196 joined but only 1 invited`; an outsider in round 2: `round 2 participants are not exactly the round 1 survivors` |
| Controls | both boards unmodified: rc 0, 0 problems |
| Clip | floor 20 + nowrap: `clipped in A/zn-idle` |
| NAME FIT floor | floor 20 without nowrap: `a 12-base-letter name wraps` |
| Name floor | names 10px: `fit below its floor in A/zn-idle` |
| Fonts | broken Sarabun 700 file: `font Sarabun 700 error` |
| Values by role | `#00ff00` game name: `(role: gold figures) renders color:#00ff00`; zone header in punch: `(role: zone header text) renders color:#ff3d7f` |
| Exclusive ownership | an intruder row claiming `.zname`: `color is owned by 2 roles` |
| Rendered Thai | a barred word split by a span: `barred word U+E2B U+E27 U+E22`; a hex reference to U+0644: `foreign letter/mark/invisible U+0644` |
| Console | a planted throw: `console: exception Error: planted` |
| Frame matrix | renamed fallback frame: `frame F/zn-fallback found 0 times` |
| Page overflow | a 1700px block: `page scrolls sideways` |
| Field rows | 34px zone rows: `name field overflows its box in A/zn-idle` |
| Field counts | first expect +1: `field count in A/zn-reveal`; marble grid 196/101: `field count in B/mb-reveal` |
| Idle leak (new) | one gold plate at idle: `holds 20 with 1 passed, says 20/0`; one gold grid chip: `holds 196 with 1 passed, says 196/0` |
| Text floor at rendered size | legend 24px: `@24.0px rendered`; game name 50px at scale(0.5): `25.0px rendered (50px x 0.50)` |
| Containment | chips 1px tall: `outside its parent or a clipping ancestor` |
| Overlap | all zone panels at one x/y: `name boxes overlap in A/zn-idle` |
| Generated text | `::before` content: `::before carries content`; a `<template>`: `<template> element(s)` |
| NAME FIT wrap above floor | plate names forced to wrap at 120px: `name breaks the NAME FIT rule` |
| Grammar | `fill-opacity: 0.5`: `computes fill-opacity 0.5`; a `::marker` rule: `pseudo-element ::marker is outside the grammar`; `display: list-item`: `computes a list item (::marker)`; a gradient on the track: `no role owns background-image` |

## Not covered

- A real projector, room or venue frame rate; the 3D motion itself (the frames are 2D stills of the 3D intent).
- Rounds 2 to 4 and the final (same frames, fewer names; a smaller field gets larger chips, never smaller floors).
- The round-code frame (gh#302's) and the phone verdict screen (gh#309's, from the round code alone).
- Whether a room actually stands and sits on the MC's beat, or cheers a 6-8s race (rehearsal questions, gh#310's manner).
- The seeded marble speed curves and the zone wave timings are proposals to profile, not measurements.

## `design/canvas.json` entries (orchestrator-owned; not written here)

The page-14 entries exist with APPROVED 2026-11-16 titles (Z1 A FOUR BLOCKS, Z2 B NAMES SIT IN THEIR ZONES;
M1 A HEAT LANES, M2 A FREEZE AT THE CUT). Their heights predate the 2026-11-18 stamps and are stale: the boards
now measure 29331 (Gh315Zones) and 21127 (Gh316Marbles) at 1600px wide. The orchestrator re-measures and updates
the artboard boxes; this directory only reports the numbers.
