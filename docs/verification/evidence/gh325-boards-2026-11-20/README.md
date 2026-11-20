# gh#325 canvas kit + gh#326 pilot board (2026-11-20), AWAITING OWNER

The shared canvas kit for the seven letter and word games of the prize draw (gh#325), and the pilot board for
game 1, เลือกคำ ลุ้นกติกา (gh#326, the template): `design/Gh326PickRule.dc.html`. Order (ADR-0033): owner
picks, canvas, code. Nothing here is approved; every new Thai string on the board is PROPOSED copy.

Cite the phase-3 tickets by gh number: each one's TITLE number is one lower than its gh number.

## Decisions for the owner

| Decision | Scope | A | B |
|---|---|---|---|
| D1 glyph floor on the densest projector screen: admin mode, 200 heads, a word beside every name, 1920x1080 at scale 1 | SHARED (kit parameter, all seven boards) | ONE SCREEN AT 14PX: words and names at 14px, 1.30% of the screen height, all 200 cells on one screen in 6 columns | TWO SCREENS AT 20PX: 20px, 1.85% of the height, 100 cells per screen in 4 columns, the two screens alternating |
| D2 vowel-form spelling in the condition label (conditions.ts `มีรูปสระ “x”`) | PILOT (gh#326) | HYPHEN SLOT, AS STORED: “เ-ีย”, “-ัว”, “-ิ” (default, the written-only form) | อ IN THE SLOT: “เอีย”, “อัว”, “อิ” |
| D3 grouping of the 14-digit round code (ADR-0080 decision 2) | SHARED (kit parameter, all seven boards) | 4-4-4-2: the picked 12-digit 4-4-4 plus a pair | 5-5-4: three groups, as the 12-digit code has |

D1 numbers: the word column holds the widest of the 923 bank words at 50f74b7, เครื่องปรับอากาศ (7.29 em in Mitr
600, measured in headless Chrome over all 481 Thai and 442 English words), at the floor. A Thai consonant body is
0.54 em in Mitr 600, so 7.6px in A and 10.8px in B. 30px, the board's own text floor, would need four screens of
50 and is not offered. Read off the D2 render: neither option draws a dotted circle; in A a lone mark sits on the
hyphen, so “-ิ” and “-ั” read close to a plain dash or an equals sign; B attaches every mark to a real consonant.

Already ruled, not re-asked: 3D on the main screen (gh#299 decision 11), the never-blank 2D fallback (ADR-0051),
half-cut word rounds and the 14-digit code (ADR-0080), picks changeable until the MC closes picking (gh#311
owner ruling 2026-11-19; the picks design doc carries it, not ADR-0076's amendment text).

## Fork ruling and source commit

Source commit: `50f74b7e1dfa355768f7cc6dd4d9a3e13599c7aa` (`git rev-parse HEAD` at build time).

- **Imported read-only from `../gh303-boards-2026-11-11/`:** `lib.mjs` (copy registry `th`/`nm`, the NAME FIT
  script, PRNG, colour maths, the 200-name gh#302 roster and its NAME FIT worst cases, annotation CSS and tables),
  `grammar.mjs` (the closed authoring grammar, through the render), and `thai-scan.mjs` (run as-is).
- **Copied and changed:** `render-boards.mjs` and `mustred.mjs` from `../gh317-318-boards-2026-11-16/` (each
  file's header lists the changes: one board per run, nothing keyed by board name, CDP_PORT required, 2000px page,
  the glyph-floor and 14-digit checks). The projector chrome in `kit.mjs` is copied from gh303 `stage.mjs` and
  renamed (no class carries a word the company-party _Avoid_ list bars), values unchanged.
- **Read once, copied as literals, never imported:** bank words from `src/prize-words` at the source commit; the
  Damm table and code layout from `round-code.ts` / `round.ts`; the condition template from `conditions.ts`;
  `MAX_HEADS = 200` from `src/prize-event/event.ts`.

## Files

| File | Status | What |
|---|---|---|
| `kit.mjs` | FROZEN (siblings never edit; the orchestrator edits only `PICKS`) | shared options, the 200-head half-cut fixture and its guard, the 14-digit code and its guard, board chrome, every common frame, kit CSS, kit roles, render selectors, generic must-red plants |
| `make-boards.mjs` | FROZEN | loads ONE board module by dynamic import, writes `design/<name>.dc.html` |
| `render-boards.mjs` | FROZEN | one board per run: checks, then captures `<name>-<n>.jpg` slices |
| `mustred.mjs` | FROZEN | one board per run: kit source guards, kit + board plants, board extras |
| `banned-scan.mjs` | FROZEN | casino and gambling props and wording over a board's raw HTML |
| `measure-render.mjs` | FROZEN | wall time and peak Chrome-tree RSS of render runs |
| `board-pickrule.mjs` | pilot | the gh#326 board |
| `three-still.mjs` | pilot only | the real three.js still and its below-floor twin |
| `Gh326PickRule-<n>.jpg`, `Gh326PickRule-3d-*.jpg` | artifacts | render slices; the two 3D stills |

## Kit API for sibling builders

Add `board-<x>.mjs` next to the kit, exporting `BOARD = { name: 'Gh<n><Name>', build, expect, plants, extra, sel,
floors }`: `build()` returns `boardDoc(...)` from the kit frame helpers (`stage`, `phone`, `topBar`, `hud`,
`lowBand`, `count`, `denseField`, `codeCard`, `codeField`, `ruleCard`, `ruleTap`, `hand`, `tiles`, `poolTiles`,
`poolButtons`, `timer`, `winners`) and `rolesRow([...KIT_ROLES, ...yours])`; `expect` lists frame ids per dir
(A/B/F); `plants` are `[name, html => planted html, /its own line/]`; `extra` are `[name, args, env, /line/ or
null]`; `sel` adds selectors to `KIT_SEL`; `floors` overrides `KIT_FLOORS`. Draw the shared decisions with
`KIT_OPT('D1')` / `KIT_VALUE('D3')` and say so with `pickNote(d)`; never redraw D1/D3's options. Never edit a
FROZEN file, another board's module, or `design/` by hand.

## Commands (from this directory; the browser and the scratch dir are yours)

```
node make-boards.mjs board-pickrule.mjs
CDP_PORT=<port> SHOT_TMP=<scratch> MODE=floor node three-still.mjs
CDP_PORT=<port> SHOT_TMP=<scratch> MODE=below node three-still.mjs
CDP_PORT=<port> SHOT_TMP=<scratch> node render-boards.mjs board-pickrule.mjs
CDP_PORT=<port> node mustred.mjs board-pickrule.mjs <scratch outside the repo>
node banned-scan.mjs ../../../../design/Gh326PickRule.dc.html
node ../gh303-boards-2026-11-11/thai-scan.mjs ../../../../design/Gh326PickRule.dc.html *.mjs README.md
CHROME_PID=<pid you started> CDP_PORT=<port> SHOT_TMP=<scratch> RUNS=3 node measure-render.mjs board-pickrule.mjs
```

The 3D stills run before the render: the board embeds them, and a missing file is a console error. Chrome:
`--headless=new --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --remote-debugging-port=<port>
--user-data-dir=<its own profile>`, never `--disable-gpu`; torn down by the pid started.

## Verification (this run, 2026-11-20)

- **Determinism:** `node make-boards.mjs board-pickrule.mjs` twice: identical sha256
  `30050902ad8c1ea7e225f1674a3c9790f483ec27fcc5b0bfe8ccff9c65fa7a01`. The argv guard refuses zero or two modules
  (exit 2, must-red'd).
- **Render:** 0 problems, 24 frames (A 4, B 4, F 16), 16 slices, page 25283px at 2000px wide; the one inherited
  error is `design/support.js` (the canvas tool supplies it). The first render went red (17 problems: the dense
  field one row too tall for 880px with the wrapped worst-case name, the 14 digits clipped at 128px, the mini-event
  count overflowing its band, an unowned ring on the picked pool button, the missing 3D still); fixed in the kit,
  then green. Slices opened: 1 (the 200-cell field at 14px: Thai intact, no dotted circle, the wrapped 12 x U+0E12
  U+0E33 name inside its cell), 4 (D2 rule cards and phone taps; the forms table), 5 (the 14-digit code), 12 (the
  mini-event phones).
- **3D still:** three 0.170.0, `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device ...))`, WebGL2 context live in the
  page. At the floor (on-screen font 1.06 x 14px): ink 16 / 12 / 12px against the floor's 2D ink 15.51 / 11.58 /
  11.58px (exit 0). At 0.75 x: 12 / 9 / 9px, every card red on `3D glyph ink under the floor` (exit 1). The first
  cut sized the passing still at 1.25 x the floor (ink 1.29 x) and turned the side cards about the vertical, which
  let the near edge pass a below-floor card; both fixed. Both stills opened: the rule card shows the A spelling
  “เ-ีย” with the mark on the hyphen; the word cards shape correctly.
- **Pick path:** with `PICKS = { D1: 'B', D3: 'B' }` the board regenerates (header "D1 PICKED B", the code drawn
  5-5-4, shared frames at 20px), the render reports 0 problems, and the still at the 20px floor passes (ink 24 /
  18 / 18 against 22.16 / 16.54 / 16.54px; 0.75 x fails). PICKS restored from a byte copy of kit.mjs.
- **Kit portability:** a throwaway mini-event-only board (as game 6's will be) ran make, render (0 problems) and
  must-red (19 plants, 4 controls, 5 kit plants not applicable, 0 unexpected) with no frozen-file edit; deleted.
- **Thai scan:** exit 0 on the board, every `.mjs` here and this README.
- **Banned-word scan:** 0 hits on the board; positive control `design/Gh318Cards.dc.html` 69 hits (exit 1). The
  first board scan found 3 (the gh#299 heading quoted in two annotation lines, a role note); reworded, scan unchanged.
- **Must-red:** 29 plants and 5 controls, 0 unexpected: source (half-cut x2, code x3, argv x2, banned-scan English
  and Thai), the kit's 15 generic plants (fonts, console, frame matrix, sideways scroll, template, split barred word,
  foreign glyph, glyph floor, code digit, code length, name clip, grammar, palette role, phone floor, tap size), the
  board's 4 (word column clip, rule clip, field count, pool overlap), and the 3D still below the floor. A kit
  plant whose marker a board lacks (no dense field, code or go button) prints `not applicable`, never counted.
- **Cost (orchestrator sizing):** `CHROME_PID=<pid> CDP_PORT=<port> SHOT_TMP=<scratch> RUNS=3 node
  measure-render.mjs board-pickrule.mjs`, one Chrome with the flags above: wall 41.98 / 46.04 / 39.16 s per full
  render (16 slices, capture and JPEG encode included; same frame set as the final board); peak summed RSS of the Chrome tree 3135 / 3155 / 3157 MB
  over 10 processes (idle before run 1: 1455 MB; it stays near 2500 MB after). Summed RSS double-counts shared
  pages. A CHECK_ONLY render (no capture) is under a second: the whole must-red set ran in 15 s.
- **Gates:** `node scripts/evidence-local-path-check.mjs --selftest` and `node scripts/evidence-local-path-check.mjs`
  exit 0; `node scripts/check-citations.mjs` exit 0.

## Not covered

- A real projector, room or viewing distance; the 3D motion itself (frames are stills; the beats are described).
- English rounds (same frames, bank English words); the MC's own controls on the setup device; phone widths
  other than 320px.
- Roles own paint; type is held by the floors and the grammar's value shapes.

## `design/canvas.json` entry wanted (orchestrator-owned; not written here)

```
{"file":"Gh326PickRule.dc.html","title":"gh#326 เลือกคำ ลุ้นกติกา pilot + gh#325 kit · AWAITING OWNER: D1 glyph floor, D2 vowel-form label, D3 code grouping","page":"page-16","x":0,"y":0,"w":1990,"h":25283}
```

## Sibling boards (2026-11-20, one builder per game, kit frozen)

Each board: `node make-boards.mjs board-<x>.mjs` (deterministic — the orchestrator re-ran all seven after the
wave and got the builders' sha256 back), render, must-red and banned scan per the commands above. Canvas: page-16,
artboards 2080px apart (boards are 1990px wide).

| Board | Module | gh | Own decisions | Slices | Must-red (plants / controls / n/a) |
|---|---|---|---|---|---|
| `Gh327LetterHand` | `board-letterhand.mjs` | #327 game 2 | D4 mark tile · D5 script labels · D6 hidden word · D7 phone pace · D8 pick grid | 20 | 32 / 4 / 0 |
| `Gh328LetterBingo` | `board-letterbingo.mjs` | #328 game 3 | D4 draw visual · D5 admin field · D6 mini-event pick (a rule, not only a look) | 19 | 33 / 5 / 0 |
| `Gh329WordChain` | `board-wordchain.mjs` | #329 game 4 | D4 unheld chain word · D5 link letter · D6 rule tap | 18 | 28 / 4 / 0 |
| `Gh330ThreeGroups` | `board-threegroups.mjs` | #330 game 5 | D4 group mark · D5 third class · D6 drawn word · D7 phone pick | 19 | 35 / 5 / 0 |
| `Gh331NameLetter` | `board-nameletter.mjs` | #331 game 6 (mini-event only) | D4 letter card · D5 match on a name · D6 redraw | 13 | 32 / 5 / 3 |
| `Gh332SyllableCount` | `board-syllables.mjs` | #332 game 7 | D4 number face · D5 count reveal · D6 live tally | 16 | 36 / 5 / 0 |

Findings the builders raised, for the owner or the build tickets:
- **gh#328 engine:** `bingo.ts` can deal one card holding ห, ว and ย, so a row can spell หวย (a barred word);
  the board fixture refuses it, the engine does not.
- **Kit:** the 2b labels ชุด ก / ชุด ข use letters the games draw (gh#327 D5 offers คำที่ 1 / คำที่ 2); a lone mark
  drawn on a hyphen reads close to "=" (pilot D2, gh#327 D4); `banned-scan.mjs` misses ball, cage, drum, dauber,
  cash, coin and stamp.
- **Rules the tickets leave open:** gh#329 "longest chain wins" (drawn as a labelled reading; redraw and tie
  open) · gh#331 which alphabets a round draws · gh#327 what follows a first hit on the mini-event page ·
  gh#330 and gh#332 event rounds deal two of the values (three groups / 1–4 exist only on the mini-event page).
- Every bank word is still `pending`, so fixtures treat words as reviewed; no board is an engine run.
- Not covered on any sibling: the D1 B / D3 B pick path (only the pilot regenerated under B), real projector
  distance (rehearsal, gh#333), motion.
