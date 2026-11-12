# gh#304: prize-draw tracer — evidence (2026-11-11)

Base `7cefc99` (`git rev-parse HEAD`, checked at start). Nothing committed. Node v22.22.1, Chrome 157.0.8103.39
headless, one pair: `npx serve dist/ -l 4324`, Chrome `--remote-debugging-port=9335`, both torn down by pid.

## URLs

- setup (normal page, ads, SEO): `/game/prize-draw/`
- projector (play route, no ads): `/game/prize-draw/play/`
- category page: `/c/company-party/`

## Shapes later tickets build on

- `src/prize-event/event.ts`: `EventState` (setup, rounds, final, `at`), the walk `ready -> drawn -> revealed`
  per step (`drawNext`, `revealDrawn`, `advance`, `position`, `liveIds`), `drawAndSave` (stores the draw before
  anything shows it), `scheduleIssues` / `setupIssues`, `uniformPermutation`, `winners`, `encodeEvent` /
  `decodeEvent` (re-validates everything on read), `readEvent` (the stored text is the event's version on a
  screen that shares storage), `cryptoRng`.
- `src/prize-event/names.ts`: `nameIssue` — THE name rule (allowlist, 12 grapheme clusters, 3 code points per
  cluster, SARA AM rule), `nameKey` (case and spaces folded), `parseRoster`.
- `src/prize-event/view.ts`: `screenView(state)` — what the projector shows, as data (game slot `game: null`).
- `src/play/_prize-reveal/`: the plain 2D reveal (`renderScreen`, `fitFrame`, `announce`) and the one
  name sink (`names-dom.ts`: `writeName`, `nameBox`, `fitName` with the board's FIT sizes and floors).

## Unit tests, each seen red first

| file | red first | then |
|---|---|---|
| `src/prize-event/event.test.mjs`, `names.test.mjs` | 32 of 32 failed against export stubs | green |
| mutants on `event.ts` (each restored by `cp`, hash compared) | first-k instead of the gh#300 draw -> equal-odds test red; biased shuffle `int(i)` -> 3 permutation tests red; swallowed write failure -> write-before-reveal test red; prize order = roster order -> prize-order test red; stored names not rechecked -> blob test red; fate-rank survivor order -> 5 red | restored |
| mutants on `names.ts` | code-point cap; allowlist widened to any letter; no SARA AM rule; no per-cluster cap; key without case fold — each red | restored |
| `src/play/prize-draw/arm-reveal-paths.test.mjs` | close path not re-armed (the "nothing to re-arm" comment shape) -> 2 red; `show()` without `armAllButtons` -> 3 red; a render path skipping the arm -> 2 red | restored |
| `src/play/prize-draw/hostile-names.test.mjs` | sink via innerHTML -> 4 red; no `dir=auto` -> 1 red; stored names not rechecked -> 1 red; event name via innerHTML -> 4 red | restored |
| `src/play/prize-draw/resume.test.mjs` | resume redraws a stored step -> 2 red; no stale-press guard -> 1 red | restored |
| `src/prize-event/setup-page.test.mjs` | error-row name via innerHTML -> 2 red; navigate before store -> 2 red; refused names not blocking -> 2 red | restored |
| `scripts/non-party-play-routes.test.mjs` + gate runs | a planted `_player-screen` import in the route reds seat-cap, player-screen-mount and render-suspension checks | restored |
| `scripts/play-screen-fit-probe.test.mjs` (screenless wait) | branch disabled -> 1 red | restored |
| `landing-claims-check --selftest` (ads) | ad slot planted on the play route -> `ad-on-play-route`; setup page without its slot -> `setup-ad-missing` | — |

## REFUTE round 1 fixes (2026-11-11)

Each new test was run against the unfixed tree first; every red below is from that run or from a mutant restored
by `cp` with the hash compared.

- **Two writers (two tabs, a duplicated projector tab).** The stored text is the event's version: a screen
  writes only while storage still holds the text it last read or wrote, and otherwise takes the stored state up
  and re-renders (an armed reveal). Every press re-reads inside one exclusive Web Lock named after the storage
  key; a `storage` event makes the other tab follow. Chosen over a stored counter: a counter is a second field
  that can disagree with the walk, and on its own it misses a replaced event (new key, lower count) and the
  equal-count race; the text covers all three with one equality. `src/play/prize-draw/two-writers.test.mjs`
  (fake locks that grant only on demand, one shared storage behind a Storage object per tab, write log):
  every interleaving of length 6 of {press A, press B, grant, event to A, event to B} (15,625 runs) and of
  {A, B, event A, event B} without locks (4,096 runs), invariant checked after every step. Red on the unfixed
  tree: 11 of 13 ("tab A wrote a step that is not ahead of the stored one"; "the stale tab wrote over newer
  state"; "the old screen wrote over the new event"; "the following tab did not re-render"). Mutants: re-read
  ignored -> 10 red; read taken before the lock -> 3 red; locks ignored -> 1 red; no double-tap guard -> 1 red;
  a refused lock request with no unlocked fallback -> 1 red (the MC button went dead). The follower renders are
  reveals (ADR-0057) and are pinned in `arm-reveal-paths.test.mjs`, on a storage event and on the stale tab's
  own press: red on the unfixed tree (no re-render; the stale tab drew its own round 1), and with the follower
  render bypassing the armed render -> 2 red.
  **Superseded by round 2 (below):** this round's unlocked fallback (compare-before-write without Web Locks)
  and the setup page's unlocked store were both refuted by REFUTE round 2 and are gone. The remaining
  ceiling stands: the HTML spec does not order localStorage visibility across processes with a lock grant,
  so even with locks the guard rests on the browser having propagated the other tab's write before the grant.
- **Stored roster uniqueness by `nameKey`.** `decodeEvent` refused only identical names; it now refuses a pair
  setup refuses (`Bee K` and `beek`). `event.test.mjs`, red on the unfixed tree ("\"Bee K\" and \"beek\" share a
  key, and the stored roster kept both"), with a positive control (`beex` decodes).
- **One name sink, live region included.** `announce` writes the result line's winner names through
  `writeName`, one `dir="auto"` run each; the line reads as before. `src/play/_prize-reveal/single-sink.test.mjs`:
  the prize fake DOM reports every string written into it, and each roster name written by the setup page or
  the projector (walked to the result) is attributed to the module on the stack, which must be `names-dom.ts`;
  a source leg bans the text sinks the fake does not model. Red on the unfixed tree: 2 ("Qz2Kv by ... render
  (stage.ts)"; no isolated run in the live region). Mutants: a setup error row writing the name with
  `textContent` -> red naming `errorRow` in `setup-page.ts`; a planted `x.title = 'y'` in `names.ts` -> the
  source leg lists it. Hostile announcement case in `hostile-names.test.mjs`;
  mutant (result line joined into one string) -> 3 red.

## REFUTE round 2 fixes (2026-11-11)

The judge reproduced three races the 13 two-writer tests could not see: the setup page storing a new event
inside a projector press's critical section (then overwritten by the old event, after it had navigated); two
lock-less tabs both drawing round 1; and a press queued at the lock acting on a replacement event it was never
rendered at. The adopted verdict, and the tests that are the proof (no further review round runs). "Red on
current" = the new tests and harness run over a scratch copy of `src/` with the four pre-fix sources
(`stage.ts`, `main.ts`, `event.ts`, `setup-page.ts`) overlaid; every red below was read at its failing line.
Mutants were applied to the fixed tree one at a time and restored by `cp`, hash compared.

- **D1, fail closed without Web Locks.** `event.ts` `withEventLock(locks, storage, fn(tx))` never runs `fn`
  without a lock manager, without storage, or on a request the browser rejects or throws on (resolves false; a
  throw inside `fn` rejects). `mountStage` with no locks reads nothing: the cold screen (`COPY.cold`), no
  button, no write; the setup page shows `STORAGE_FAILED`. No new copy. A refused request clears the busy flag,
  so the next tap asks again. Red on current: judge block 2 inverted ("a lock-less tab wrote"); the four
  `without Web Locks` scenarios ("a screen without Web Locks offered a press"; setup: "opened the projector
  without Web Locks"); the press inside the other tab's re-read; the lock-less explore over {A, B, event A,
  event B, setup} (3,125 runs, "tab A offered a press without Web Locks"); the positive control (a lock-less
  tab beside a locked one offered a press); "a refused lock request writes nothing" ("a refused press wrote");
  the new rejected-then-granting test ("the refused press wrote"). Mutants: busy not cleared on refusal -> 2
  red ("the button is dead after a refused lock"); the stage reading storage without locks -> 8 red; the helper
  running unlocked without a manager -> 4 red; the helper running the body on rejection -> 4 red; the helper
  swallowing a throw inside the body -> 1 red ("Missing expected rejection"). The `withEventLock` unit tests in
  `event.test.mjs` are red on these mutants only: current code has no such export.
- **D2, one writer of the event key.** `saveEvent` is gone; `tx.write` is the only `setItem` of the key. The
  setup page takes the locks from its window (`navigator.locks`, so `mountSetup(document, window)` is
  unchanged), writes inside the lock, opens the projector only after the write landed, and drops a second
  submit while the first waits. A running event is replaced (fresh `eventKey`), and every screen adopts it
  without writing. Red on current: judge block 1 with the real `mountSetup` on the shared fake locks ("the setup
  page did not queue behind the projector"); without locks ("a start without the event lock wrote the event");
  "the start waits for the event lock" ("the start never asked for the event lock"); double submit ("a double
  submit stored two events"); refused request (stored anyway). Mutants: no double-submit guard -> 1 red;
  navigating before the lock -> 9 red; the tx kept open after its callback -> 2 red. **Scan:**
  `scripts/roster-lock-structure-check.mjs` condition 4 flags any `.setItem(` on the key (literal, imported,
  aliased or namespaced) outside `event.ts`, and requires exactly one `.setItem(` in `event.ts`, inside
  `withEventLock`; the selftest plants each shape (5 known-bad, 1 known-good, 2 blind-scan). Red on the real
  tree: a planted `storage?.setItem(STORAGE_KEY, encodeEvent(next))` in `stage.ts` -> exit 1, "a second writer
  of the event key: setItem outside src/prize-event/event.ts's withEventLock"; restored, hash matched.
- **D3, a press is bound to what was rendered.** The control captures `token = seen` at render; inside the
  lock a press acts only if `token === seen && seen === read().raw` (and the step it was built for still
  holds); otherwise it takes up a moved text and is dropped. `adopt` always re-renders (the wave only when the
  state moved): with its unchanged-text shortcut, a failed reveal-save followed by the other tab's reveal left a
  button at the old text that dropped every press. `seen` is assigned only in `save()` and `adopt()` (source
  test), and `checkInvariant` asserts on every tab after every step that the mounted control's token equals
  `seen` (`StageHandle.version()`, read-only). Red on current: judge block 3 inverted ("the queued press drew
  the replacement without a new press"); the same with the setup page's real store ahead in the lock queue; the
  dead-button test ("taking up the other tab's reveal did not rebuild the button"); the source test ("adopt()
  renders only on a condition"). The dead button itself is red only on the D3-with-shortcut mutant (current
  code keys the button by position and stays live): "the button is dead after taking up the other tab's
  reveal". Mutants: the token check dropped -> 3 red, including the setup explore; the shortcut kept with
  only the two rebuild asserts removed -> `checkInvariant` reds ("tab A's button was rendered at another text
  than the one it holds"); `seen = now.raw` planted in the storage listener -> the source test reds ("seen is
  assigned outside save() and adopt()"). `version().token` is a variable set beside the control at render, not
  the click handler's own captured value; the handler's closure is what the token-dropped mutant covers.
- **Harness.** `mount` defaults to one shared, synchronous, exclusive granting lock (`grantingLocks`), so the
  12 mounts in four files that pass no locks do not turn into cold screens; `locks: null` means no Web Locks.
  `fakeLocks().as(name)` tags each queued request with its tab. `sharedStorage().put` is now only for writes
  from outside the project; the setup page is driven for real (`mountSetupPage`). `checkInvariant` keys draws
  per `eventKey`, allows a key change only by the setup page to a fresh round-1 event, and `explore` gains a
  setup actor: every interleaving of length 5 of {A, B, grant, event A, event B, setup} (7,776 runs), with a
  provenance check (a granted press's first write replaces exactly the text its button showed). On current
  code that explore reds at "setup A evA grant: tab A acted on a step its pressed button was not rendered at"
  (run with the token assertion stripped, since current code has no `version()`). Must-red after the harness
  change: a redraw on the resume path -> 1 red, a render that draws -> 2 red ("drew on the resume path"); with
  the default removed, 10 of 20 in those four files red (no button, the positive control's names missing).

## Browser (`browser-check.mjs`, `setup-shots.mjs`, output `browser-check-output.json`)

- Projector 1920x1080 (`innerWidth` read back 1920x1080): 200 names incl. `W`x12 and (DDO + SARA AM)x12.
  Round 1: 200 boxes, **0 clipped**, 0 below floor, 0 slack lost, **1 wrapped** ((DDO+SARA AM)x12 at the 14px
  floor). Reveal: 0 clipped, (DDO+SARA AM)x12 wrapped. Result: 5 boxes, 0 clipped, 0 wrapped. Ad slots on the
  stage: 0. Console errors: none. An earlier run also wrapped a bold `W`x12 on the reveal; that was this
  code's bug (names fitted before the bold face loaded), fixed by refitting once the 700 face loads
  (`whenBoldLoaded`).
- Bold `W`x12, re-measured on the final dist (the `boldW12` leg of `browser-check.mjs`; the draw is the
  browser's crypto, so the leg re-seeds until `W`x12 passes round 1, 2 attempts on the last run): weight
  700 read in-page, `document.fonts.check('700 20px Sarabun')` true, box classes `in` under `.pd-marked`:
  **14px (the floor), 147px in a 156px box, 1 rendered line, no `nm-wrap`, not clipped.** Must-red, same
  leg with `BOLD_MUTANT=1` (stubs `document.fonts.load`, so the bold refit never runs): `nm-wrap` set, the
  old symptom (`browser-check-bold-w12-mutant.json`; clean leg alone: `browser-check-bold-w12.json`).
  Bounds: the 700 face was ALREADY loaded before the press on every attempt, clean and mutant, so the
  late-face race the fix was written for is UNREPRODUCED here; what is shown is the end state and that
  without the refit `nm-wrap` sticks. "Wrapped" in this instrument is the `nm-wrap` class: the mutant
  read 1 rendered line with the class set.
- Setup refusal rows (the approved copy), 320x700 through `scripts/cdp.mjs`: 0px sideways, no `<img>` from
  a markup name, each row the name over its reason. First render put the name and the reason side by side
  and squeezed a 13-`W` name's reason to a word per line (120px tall); fixed to one text column (48px).
- Must-red of the clip check: `fitName` disabled in a scratch build -> `W`x12 and (DDO+SARA AM)x12 clipped at
  20px (199px and 316px in a 156px box), `browser-check-output-mutant-nofit.json`.
- Refresh after the round-1 reveal: same screen (`reveal`), same 100 passed names.
- Reduced motion (CDP `Emulation.setEmulatedMedia`, `matchMedia` read back `true`): the field fades
  (`pd-fade 0.2s`), chip transition delay `0s`. Control: motion allowed, last chip delay `0.796s`, no fade.
- Setup 320x568 and 1280x800: 0px sideways, 1 ad slot, schedule proposed 200/100/50/20, no control under
  44px (the stepper was 42px wide at 320 on the first run; fixed with `flex: none`), the board's error
  sentence "หลังรอบ 2 ต้องน้อยกว่าหลังรอบ 1 (100 คน)" and "แก้ตารางคัดออกก่อน แล้วจึงเริ่มงานได้", nothing stored.
- Fit probe, `ROUTES_ONLY=prize-draw`, n=3 (`fit3-5.txt`): 320x568, 390x844, 1440x900 all 0px over 7 screens.
- `play-top-band-probe`: OK 59 screens across 15 routes; BREAK_BAND control: "content red on all 15 route(s)".
- `play-exit-probe` and `play-exit-guard-probe`: red for prize-draw until both seeded the route through
  `routeSeed` (`play-exit-*-before-seed.txt`, `-after-seed.txt`).
- Final dist, one pair (serve 4324, Chrome 9335 `--headless --disable-gpu --no-sandbox`), one probe at a
  time, every one exit 0: fit `ROUTES_ONLY=prize-draw` (3 rows, 21 screens); `play-top-band` (59 screens,
  15 routes) and `BREAK_BAND=1` (content red on all 15); `control-floor` (`.game-btn` 6, play buttons 201)
  and `BREAK_FLOOR=1` (every claim red); `live-region-floor` (8 regions, 5 pages) and `BREAK_GUARD=1`;
  `play-exit-probe ... ci` (15 of 15, 0 failures, 0 UNMEASURED); `play-exit-guard-probe` (15 routes, 48
  legs, 0 failed, 0 UNMEASURED); `browser-check.mjs` (all numbers above). dist hashed per file before and
  after the run: identical.
- Home and `/c/company-party/` at 320 and 1440 (K2, K3): 0px sideways; home's company row present, the
  event card leads the category page (284px at 320, 940px at 1440).
- Not run: `canvas-ink-probe` (canvas2d routes only; this route is `dom`), `player-screen-face-probe` and
  `webgl-pixels-probe` (party routes only), `category-pop-probe` (hard-coded fortune/party; `/c/company-party/`
  was opened only by the overflow look below), the full `npm run ci-probes` (needs six ports; one pair
  allowed).
- `control-floor-probe`: green; landing `.game-btn` still 6 (CONTROL_COUNT unchanged: the new pages are a
  play route and a setup page, neither a shell landing); play-route visible buttons 201 across 15 routes.
- Screenshots: `stage-1920-{round1,reveal1,final,result,reveal1-reduced}.png`, `setup-{320,1280}.png`,
  `setup-{320,1280}-schedule-error.png`.

## Two tabs on one event (review round 1, `two-tab-check.mjs`)

Real Chrome 157 headless on the pair, two targets on one browser (shared `localStorage`, real `storage`
events), 1920x1080, real mouse presses on the MC button through CDP `Input.dispatchMouseEvent`. Observers
installed before the page's script: a wrapper on `navigator.locks.request` (call name, callback entered,
lock mode), a count of this tab's writes to the event key, and a wrapper on the `storage` listener so tab B
can be made to miss events. Output `two-tab-check-output.json`.
- Web Locks: `'locks' in navigator` true, `isSecureContext` true (localhost); every press took the
  exclusive lock `watduang:prize-draw:event` and entered it (A: 3 calls, 3 entered; B: 1, 1).
- Leg 1, A presses "เปิดผล": stored text changed between the reads before and after (A wrote twice: the
  draw, then the reveal); B wrote 0, made 0 lock calls, and followed on the storage event to the reveal
  with the same 20 survivors (`two-tab-leg1-{A,B}.png`).
- Leg 2, B on a stale screen: B drops storage events (2 dropped) while A advances and draws round 2, so B
  shows round 2 ready with "เปิดผล" (`two-tab-leg2-B-stale.png`). B's press: 1 lock call, 0 writes, the
  stored text unchanged, B now shows A's 10 survivors (`two-tab-leg2-B-after-press.png`).
- Must-red, `TWO_TAB_MUTANT=1` (B's storage reads keep returning its pre-draw text, the shape of a press
  that never re-reads): B wrote 2, the stored text changed, B's survivors differ from A's draw
  (`two-tab-check-mutant-output.json`). The detector sees a second draw.
- Not covered: two presses in the same instant (the header's no-lock race), and the unlocked fallback path
  (Web Locks were present). Round 2 removed that fallback: no lock now means no write.

**Round 2 re-run (2026-11-11, final dist, same pair, torn down by pid).** Legs 1 and 2 as above (A wrote 2,
B 0; B's stale press: 1 lock call, 0 writes, stored text unchanged, B then shows A's 10 survivors). The
observers now also count writes across a navigation of the same tab (sessionStorage), and can keep a press's
lock held after its callback ran (`window.__holdNext`), so the projector itself is the holder.
- Leg 3, the setup page (tab C, `/game/prize-draw/`, 12 names typed, a real click on "เริ่มงาน") submits
  while A's own "รอบต่อไป" press holds `watduang:prize-draw:event`. While held: C made 1 lock request and
  never entered it, wrote 0, did not navigate, and the stored text stayed A's. After release: C wrote,
  navigated to `/game/prize-draw/play/`, the stored event is C's ("Setup leg", a fresh key, round 1 ready),
  and A and B both show its 12 names at round 1 with "เปิดผล", with 0 writes of their own
  (`two-tab-leg3-{A,C}-after.png`; output `two-tab-check-output.json`).
- Red on the pre-fix build (the dist built from the round 1 tree, before any round 2 edit;
  `two-tab-check-prefix-output.json`): C made 0 lock requests, wrote 1 and navigated while A held the lock,
  and the stored text changed under the holder. That output comes from an earlier revision of this script:
  it has no `field` (the follower verdicts read only screen and button there), and its leg 1 A count reads 3
  because the harness's own seed write was still counted. The dist it measured is gone, so it cannot be re-run.
- Must-red, `TWO_TAB_MUTANT=1` (also: C's lock request runs its callback at once, unlocked): leg 2 B wrote 2
  and the stored text changed; leg 3 C wrote 1 and navigated while A held the lock, the stored text changed,
  and B (left on its stale reads) shows the old guests, not C's names (`two-tab-check-mutant-output.json`,
  `two-tab-mutant-leg3-{A,C}-after.png`).
- C logs one page error on its navigation in every run, the pre-fix one included: "InvalidStateError:
  Transition was aborted because of invalid state. ViewTransition opt-in disabled" (inferred: the view transition the
  site's pages opt into, aborted by the script navigation); not from this ticket's code.
- Not covered in a browser: a stage without Web Locks (fail closed is covered by node tests only), and a
  request the browser refuses.

## Baselines

- Round 2 (2026-11-11): no re-pin. `bundle-freeze-check` after the round 2 build: 39 chunks and 62 page-entry
  pairs match the pinned sets exactly, total 1111824 bytes against the pin 1111368 (+456, within the +/-5%
  band). The +456 is not attributed per chunk: the pre-round-2 dist was rebuilt over before it was measured.

- `BASELINE_TOTAL_BYTES` 1080518 -> 1111368 (final tree). Base `7cefc99` built from a `git archive` copy
  measures 1084518 (+4000 unpinned carry); gh#304 = +26850: setup script 5335, projector script 8751,
  event 9354, names-dom 989, prize-draw 2263 (= 26692) and +158 in shared chunks. Since the first pin of
  this ticket (1107799): event +1080 (name rule rewrite +1021, then `readEvent` and unique names +59),
  projector +1009 (bold refit +226, then the review round's lock, storage follower and announce sink +783),
  setup +1426 (approved copy +1146, one-column refusal row +122, review fixes +158), prize-draw +54
  (`cardArt` fields +57, -3). The +57, +783/+59, +1146 and +122 are each measured by a rebuild around that
  edit alone.
- `BASELINE_BASENAMES` +4 (`event.js`, `names-dom.js`, `prize-draw.js`, `index.astro_...`);
  `BASELINE_PAGE_ENTRIES` +5 (category page, setup page x2, projector x2).
- `CONTROL_COUNT` unchanged at 6 (measured, see above).

## ui-ux-pro-max audit (2.13.0, `--domain ux`, no `--persist`; queries and output in `audit/`)

Rows are labelled: [measured] in the browser on the built pages, [css] read from the shipped stylesheet,
[board] computed by the gh#302 board (contrast was NOT measured on the built pages).
Fixed here: schedule boxes now `aria-describedby` the schedule message; a failed start moves focus to the
first box in error. Passes: touch targets [measured: setup 0 under 44px; MC button floor 52px css]; focus rings [css];
reduced motion [measured]; colour-not-only [css + screenshot]; one animated element per view [css];
contrast [board: lowest text pair 5.42:1]. Enter in a one-line setup field no longer starts the event
(found in review; fixed, unit-tested).
Listed for the owner: see "Gaps".

## Gaps for the owner (none invented in code unless marked)

- NAME FIT: the board's 14px chip floor was measured on DDO x12; the widest valid name under the new rule,
  (DDO + SARA AM) x12, takes the fit's wrap fallback (`nm-wrap`) at that floor (no clip; rendered line
  count not read). Bold `W`x12 now fits one line at the
  floor (re-measured, see Browser). Not tuned (ADR-0033).
- Copy: CLOSED. Every string with no board source, and the 11 that were missing, approved by the owner
  2026-11-11 and in code (see "Copy for owner approval").
- Layout with no board: the MC button (bottom-left, real pixels, outside the scaled frame); the setup page
  below 640px; the setup page's back link to the category; the wave step (4ms per name); a refused name's
  row (name over its reason in one column beside the icon, the name breaking anywhere; existing row type
  and weight, no new values). The range message shows from the first name typed, as the count outline
  does, and after a start with no names.
- gh#303 picks K1-K4: DONE (K1 accent `lilac`; K2 home row between fortune and tools; K3 the event card
  leads the category page; K4 `thirdPill` "ขึ้นจอโปรเจกเตอร์ได้").
- Event card art (K3 AMENDMENT 2026-11-11 on `design/CatCompany-partyPop.dc.html`, owner-approved): the
  page builds the `img.game-card-art` once and both card shapes carry it as their first child (src only,
  lazy: the party cards' own path, which has no density srcset on this page). 1440: 273x320 contain beside
  the copy; 1099 and 320: 100% x 160px contain above it. Measured on the built page through
  `scripts/cdp.mjs` (art forced eager, read after load): 1440 art 273x320 at x 104, copy at x 405, row;
  1099 art 1015x160, column; 320 art 236x160, column; natural 273x320 loaded at all three; 0px sideways.
  Screenshots `category-event-art-{1440,1099,320}.png`. `landing-claims-check` was red before the edit
  ("card prize-draw ... carries 0 img.game-card-art").
- Still open from gh#303, no frame to build from: the 4th chrome pill (drawn on the picked frame, NOT
  wired: it is site-wide chrome and the board has no 320 frame for it); the event card's stacking under
  1099px (no board frame for that width).
- Head counts: 9-200 start; 9-49 work with gh#300's proposal; under 9 or over 200 cannot start.
- The projector at phone width is the 1920x1080 frame scaled whole (names unreadably small at 320).
- The board's claim line is QR-mode copy and is not shown in admin mode.
- When gh#305 adds WebGL to this route, `render-suspension-check` and `webgl-pixels-probe` cover party routes
  only and must be widened then.

## Copy for owner approval — approved 2026-11-11

The owner approved this whole section on 2026-11-11 (popup): the 19 strings already in code and the 11
proposed strings below, which are now wired as written (`src/prize-event/setup-page.ts` ·
`REFUSAL_COPY`, `HEAD_RANGE`; the stepper `aria-label`s in `src/pages/game/prize-draw/index.astro`).
Every Thai string gh#304 put in code that no picked board carries, and the strings that were missing. Strings now on a picked gh#302 or gh#303 board are NOT listed: they are
approved (the category `label`, `whenToUse`, `hubHeading`, `hubBody`, `intro`, `listHeading`, the third
pill and the event card copy, gh#303 K5). In code, as written:

| # | string | where it appears (file · symbol) |
|---|---|---|
| 1 | เปิดผล | projector, the MC button on a round or the final (`src/play/prize-draw/stage.ts` · `COPY.reveal`) |
| 2 | รอบต่อไป | projector, the MC button after a reveal (`stage.ts` · `COPY.next`) |
| 3 | ยังไม่มีงานบนจอนี้ ตั้งค่างานแล้วกด เริ่มงาน | projector with no stored event (`stage.ts` · `COPY.cold`) |
| 4 | บันทึกผลไม่ได้ จึงยังไม่เปิดผล ลองกด เปิดผล อีกครั้ง | projector notice when the draw cannot be stored (`stage.ts` · `COPY.saveFailed`) |
| 5 | ตกลง | the close button of that notice (`stage.ts` · `COPY.ok`) |
| 6 | บันทึกงานไม่ได้ เบราว์เซอร์นี้ไม่ให้เก็บข้อมูล | setup page, when the browser refuses storage at the start (`src/prize-event/setup-page.ts` · `STORAGE_FAILED`) |
| 7 | จับรางวัลปีใหม่ — จอใหญ่ | the projector page's `<title>` (`src/pages/game/prize-draw/play.astro`) |
| 8 | รอบที่ N จาก 4 · รอบนี้คัดเหลือ K คน / ผ่านรอบที่ N · K คน / รอบชิง / ผู้ได้รับรางวัล · รางวัลที่ i · name | the projector's screen-reader announcements, approved board strings joined with " · " (`src/play/_prize-reveal/reveal.ts` · `announce`; winner names are sink runs, the line reads the same) |
| 9 | เกมงานเลี้ยงบริษัท จับรางวัลปีใหม่ \| วัดดวง | category `seo.title` (`src/games/categories.ts`) |
| 10 | จับรางวัลปีใหม่ในงานเลี้ยงบริษัทบนจอใหญ่ คัดชื่อออกทีละรอบจนเหลือ 5 คนสุดท้าย แล้วชิงรางวัล ทุกคนมีโอกาสเท่ากันทุกรอบ | category `seo.description` (`categories.ts`) |
| 11 | จับรางวัลปีใหม่ — เกมงานเลี้ยงบริษัท คัดชื่อออกทีละรอบบนจอใหญ่ | game `seo.title`, the setup page's `<title>` (`src/games/prize-draw.ts`) |
| 12 | จับรางวัลปีใหม่สำหรับงานเลี้ยงบริษัท คัดออกทีละรอบจนเหลือ 5 คนสุดท้าย แล้วชิงรางวัลบนจอใหญ่ ทุกคนมีโอกาสเท่ากันทุกรอบ ไม่ต้องโหลดแอป ไม่ต้องสมัคร | game `seo.description` (`prize-draw.ts`) |
| 13 | ตั้งชื่องาน ชื่องานจะขึ้นบนจอใหญ่ตลอดงาน | game `seo.steps[0]`, HowTo JSON-LD (`prize-draw.ts`) |
| 14 | พิมพ์รายชื่อคนในงาน บรรทัดละ 1 ชื่อ ใส่เฉพาะคนที่มาถึงงานแล้ว | `seo.steps[1]` |
| 15 | ดูตารางคัดออกที่ระบบเสนอ แก้ตัวเลขได้ก่อนเริ่มงาน | `seo.steps[2]` |
| 16 | ตั้งชื่อรางวัล 1 ถึง 5 รางวัล แล้วกด เริ่มงาน | `seo.steps[3]` |
| 17 | บนจอใหญ่ กด เปิดผล ทีละรอบ 4 รอบคัดออก แล้วรอบชิง 5 คน | `seo.steps[4]` |
| 18 | จับรางวัล · จับฉลากรางวัลปีใหม่ · เกมงานเลี้ยงบริษัท · จับรางวัลงานปีใหม่ · สุ่มรางวัลบนจอใหญ่ | game `keywords` (the first three are gh#299's search terms) |
| 19 | หลังรอบ N ต้องน้อยกว่าเริ่ม / … รอบชิง ต้องน้อยกว่าหลังรอบ 3 (K คน) | setup schedule error for boxes the board did not draw: the board's own sentence with its own labels (`setup-page.ts` · `renderSchedule`) |

Were missing, now in code as approved, one per reason code of `checkName` (`src/prize-event/names.ts`, the
same codes as the join server's, gh#308). A refused name's row is the icon, the name through the name
sink, then the fixed message for its reason; the message never carries the name. `empty` has no row (a
blank line is skipped). Tests, each red before the wiring: `src/prize-event/setup-page.test.mjs` (one
message per reason and for a taken name; hostile names get the fixed message and no echo; the range
message at 8 and 201 and after a start with no names, not at 9 or 200; both stepper labels). Mutants,
restored by `cp` with the hash compared: the message echoing the name -> 2 red; the start never
marking itself tried -> the empty-start case red.

| reason / slot | approved Thai |
|---|---|
| `charset` | ใช้ได้เฉพาะตัวอักษรไทย อังกฤษ ตัวเลข เว้นวรรค และ . - ' _ |
| `emoji` | ชื่อใส่อีโมจิไม่ได้ |
| `too-long` | ชื่อยาวเกิน 12 ตัว |
| `stacked-marks` (also SARA AM out of place, which the shared rule files here) | สระหรือวรรณยุกต์ซ้อนกันเกินไป |
| `leading-mark` | สระหรือวรรณยุกต์ต้องตามหลังพยัญชนะ |
| `control` | ชื่อนี้มีตัวอักษรที่มองไม่เห็น ลบแล้วพิมพ์ใหม่ |
| `lone-surrogate` | ชื่อนี้มีตัวอักษรที่อ่านไม่ได้ |
| taken (a duplicate after case and spaces fold) | ชื่อนี้ซ้ำกับชื่อที่มีแล้ว |
| head count outside 9-200 | ใส่ได้ 9 ถึง 200 ชื่อ |
| prize stepper minus, `aria-label` | ลดจำนวนรางวัล |
| prize stepper plus, `aria-label` | เพิ่มจำนวนรางวัล |
