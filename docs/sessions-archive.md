# Sessions archive

Rolled-out state entries from `SESSION-HANDOFF.md` § Current state, newest first. Append-only.
(เคยอยู่ใน `CLAUDE.md` — ย้ายบ้าน 2026-08-14 ดู `.claude/commands/save-session.md`)

### S2026-08-18#1

done: **4 commits `dc55dd7`→`915e288`, pushed, CI green (run 32096079848), Deploy `skipped`** (`gh secret list` empty, re-checked at push). **gh#40 + gh#41 CLOSED** by commit trailers, verified via `gh issue view`. NEW `src/games/_arm-gate.ts` — ghost-tap gate, `ARM_DELAY_MS=400`, controls render `disabled`, any `pointerdown` in `#stage` restarts the window; applied at short-stick `renderDraw` + `renderResult` and timebomb `renderIdle` → ADR-0016 · **prior session's `BUNDLE_STYLE` geometry fix REFUTED before it was built** — ADR-0014:29-30 had already measured that guard class (y swings 323→683px) and ruled it never converges · **timebomb's root harm was fuse-arming, not name loss** — `arm()` accepts any gesture, so a ghost chain starts a live fuse; `lastLoser` carry kept as complement · **short-stick's `#ss-again` was the mirror path we nearly shipped open** — found by REFUTE, gated, `renderResult` result-erasure has no checkpoint to recover · `scripts/thai-comments.mjs` `.astro` `{/* */}` channel closed, quoted-span exemption narrowed to `"..."`/backticks only after apostrophe-pairing hole (`don't` + `stage's` blanked real Thai between them) · `ci.yml` runs `crawl-check-gamenav.mjs`; `--selftest` deliberately NOT wired there · NEW `scripts/{arm-gate-probe,ad-slot-grid-probe}.mjs`, captures `docs/verification/evidence/{40,adslot}` · tests 144→**149**

dec: ADR-0016 — the gate is allowed where ADR-0014:31-34's spatial guard was not **because it classifies nothing**: it disables everything for a fixed window we own, instead of telling a stale tap from a deliberate one with browser-owned signals. Do not restate, cite · **owner: fix 2 games now, file the other 4** → gh#42 · **owner: measure the tool-page ad slots now, not deferred** · `--selftest` stays out of CI — it mutates tracked source and rebuilds `dist/` 4×, so Smoke test and Deploy would ship an artifact the CSP + sitemap gates never checked · **no `lastLoser`-style carry for short-stick** — its ghost chain is one hop and now gated; timebomb's is two, so only it needs belt AND braces · **measured, not assumed:** a real touch on a `disabled` button DOES dispatch `pointerdown` that bubbles to `#stage`, so the restart leg is real

next:
- [ ] **gh#42 — the ghost-tap gate for the remaining 4 games (focus).** `daily-fortune` · `love-match` · `pick-loser` · `siamsi`. `_arm-gate.ts` already exists; the work is per-game analysis, not mechanism. **Check siamsi FIRST and separately** — ADR-0014:34 records it has a legitimate every-turn ส่งต่อ→จั่วดวง overlap, which is exactly the counterexample that kills the 400ms premise; siamsi is also the sole checkpoint writer (ADR-0010) so its harm may be recoverable. Done when each of the 4 names its consequential post-swap control, states with evidence whether a legitimate sub-500ms tap exists on it, and gated games carry a unit test asserting game state with a real-touch probe calibrated red pre-fix
- [ ] **`wheel.astro` ~1200ms delayed shrink above a live ad slot** — outside any double-tap window, so NOT the ghost-tap class; it is a CLS misclick risk for a *deliberate* tap. Recorded in `docs/verification/evidence/adslot/README.md`, unmeasured, no issue. Done when measured or an issue is filed
- [ ] **gh#38 ruling still open** — evidence + the silent-no-op trap posted as a comment this session (`issuecomment-5322765639`). `@astrojs/check` is NOT a devDependency, so a bare `astro check` step exits 0 having checked nothing. Done when the owner rules
- [ ] `docs/verification/evidence/39/*.json` (last session) carry no `verdict` / `capturedAtCommit` — same provenance gap `docs/verification/README.md` forbids; agents omitted them on `{40,adslot}` too until corrected by hand. Done when 39's four files carry the required keys
- [ ] **owner-run, unchanged:** wizard §2 Azure token · gh#9 domain · gh#29 AdSense pub-ID (gh#29 closes gh#15–18, then epic gh#14). ⚠ the moment `gh secret list` is non-empty every push to main IS a deploy (`ci.yml:232` gates on `HAS_DEPLOY_TOKEN`) — every push pre-auth void, re-gate it. Done when `gh secret list` non-empty

inflight: measured at save — working tree carries only this save's own 2 files · `0/0` with `origin/main` before this save · **open PRs: checked, none** · branches: `main` only · worktrees: 1 (the probe's `dc55dd7` worktree was created and removed) · CI green on `915e288` · GitHub writes this session: 1 comment (gh#38) + 3 issues filed (gh#40 gh#41 gh#42); gh#40 + gh#41 closed by commit trailer, not by hand · committed direct to main, no PR

spent: queue 7→5 · closed 2, filed 3, discovered 3 · batches 9 · ctx ~26% of 1M at save · ended early: no

### S2026-08-17#4

done: **4 commits `1c84799`→`ceba91c`, pushed, CI green (runs 32041905261 · 32043355492), Deploy `skipped` both.** **gh#39 CLOSED** — leave-confirm on `a[href]:not([data-stable-exit])`, gated on `root.hidden`, lives in PlayerSetup's existing island (no new `<script>`, still 3 tags/page) → ADR-0015 · ADR-0013 resolved **unamended** (it always governed *aimed* taps) · ADR-0014 keeps its stage-scoped invariant + records that its probe's claim 2 stays RED by design · **love-match DOES reproduce** — roster **2** with 20–24 char names, 4/40 grid points → the "not reproduced" line is RETRACTED; collision is **not monotonic in roster size** · 3 harness holes closed: `inViewport` vacuous PASS → INCONCLUSIVE, an unmeasurable tap could mask real hits → FAIL-first, crawl check passed a page linking to its own game · NEW `scripts/{crawl-check-gamenav,leave-confirm-probe}.mjs`, `driver.mjs` gained `session.tap()` (`Input.dispatchTouchEvent`) · **gh#37 re-affirmed** with 2 corrections (love-match `271→325/331` was stale → `268→322`; timebomb `detonate()` REFUTED as a ghost-tap pair, it is rAF-driven) · captures `docs/verification/evidence/{38,39}` · tests 144 throughout

dec: ADR-0015 — ownership answer is the **inverted set**: mark the provably-immobile links (`data-stable-exit`, 1 element) instead of enumerating the hazardous ones; do not restate, cite · **owner accepted the confirm's ceiling as PERMANENT** — it can only ask whether to leave, because `root.hidden` means "this page started a round", not "a round is running now", and no such state exists site-wide (siamsi is the sole checkpoint writer, forward-only). Both buttons bounded the same way; copy is FINAL, not placeholder · **neither CI gate wired, by decision** — `crawl-check-gamenav.mjs` + `astro check` exist as scripts only, so CI still cannot catch a GameNav self-link regression nor any broken `.astro` ref · **3 hazards found and deliberately NOT filed** (owner) — they live in `next:` below and nowhere else · verification of this class needs **real touch events**, never `.click()`+`elementFromPoint` — the latter proves where a link is, never that navigation happens

next:
- [ ] **short-stick geometry fix (focus).** The one decisive-consumed ghost pair — `drawOne` `:149-157` can end the round for a player who never held the phone; no checkpoint by design (`short-stick.ts:3-4`). ADR-0014 forbids **anchors** in `#stage`, **not geometry**, so offsetting `BUNDLE_STYLE` (`:76`) below the pass button's slot needs no timing window and no unowned set. Done when a grid probe shows `:111`'s box clear of the stick grid at rosters 2–10, both name lengths
- [ ] **timebomb boom-screen name loss.** `renderBoom` `:133` swaps the stage with zero tap warning; `again` `:145` destroys `players[holder]` (printed `:138`, persisted nowhere). Single-tap class, not gh#37's double-tap class. Done when `renderIdle` `:84-98` carries the loser's name so a ghost `again` is non-lossy
- [ ] **`scripts/thai-comments.mjs` is blind to `{/* */}` in `.astro`** — proved with a throwaway; the gate has never checked any `.astro` in `src/`. A gate that cannot fail. Done when a Thai brace-comment in an `.astro` makes it exit non-zero
- [ ] ad slot (`GameLayout.astro:50`) sits below a shrinking stage — once live ads ship, a double-tap onto the iframe is both a leave-the-site event and AdSense accidental-click exposure. Done when measured with the grid probe against a real ad-height iframe, or accepted in writing
- [ ] `ci.yml` gates deferred to the deploy-chain decision: `astro check` (needs `@astrojs/check` as devDependency or the step is a silent no-op — see below) + `crawl-check-gamenav.mjs`. Done when both are wired and each is calibrated red
- [ ] gh#38 — evidence captured (`docs/verification/evidence/38/`), decision + issue comment NOT authorized this session. Done when the owner rules on adding `astro check`
- [ ] **owner-run, unchanged:** wizard §2 Azure token · gh#9 domain · gh#29 AdSense pub-ID (gh#29 closes gh#15–18, then epic gh#14). ⚠ the moment `gh secret list` is non-empty every push to main IS a deploy (`ci.yml:222`) — every push pre-auth void, re-gate it. Done when `gh secret list` non-empty

inflight: measured at save — working tree carries only this save's own files · `0/0` with `origin/main` before this save · **open PRs: checked, none** · branches: `main` only · agent worktrees created and torn down, release verified · CI green on `ceba91c` (run 32043355492, Deploy `skipped`) · GitHub writes this session: 2 comments (gh#39, gh#37) + 1 close (gh#39); **0 issues filed — owner declined all 3** · committed direct to main, no PR

spent: queue 6→7 · closed 4, filed 0, discovered 4 · batches 6 · ctx ~28% of 1M at save · ended early: no

### S2026-08-17#3

done: **5 commits, `655b671`→`78af47b`, pushed, CI green on both pushes (32008049334 · 32012262344), Deploy `skipped` on both.** `655b671` **`roster.remove`/`clear` DELETED** — 0 callers incl `.astro`; chose delete over locking them (union-then-subtract = cross-tab tombstone semantics with 0 callers to exercise) and over a source-scan guard (enumerates syntactic call shapes = grammar-owned); union-then-subtract warning + the real ceiling now on `Roster` in `types.ts` · `6fefa67` **FIRST capture ever on a real iOS engine** — `navigator.locks` present + functional on iOS 26.5 Safari (`request()` resolved 42) ⇒ `roster.ts` runs its **locked** path on the actual target platform, not the untested fallback · taken-chip `opacity` 1→0.5 + `disabled` + `aria-pressed` confirmed on WebKit · 320px chip-row stable under a real touch · NEW `docs/agents/ios-webkit-verification.md` (ADR-0012 task-seam split; `browser-verification.md` had 709B headroom) · `ba58746` **daily-fortune double-tap hazard CONFIRMED at roster 8** — capture 12's original verdict ("never on a different person or a navigating element") was measured on a 2-name roster and is retracted in place, both roster readings kept; NEW `scripts/daily-fortune-double-tap-probe.mjs` · `196fdde` **in-stage `<a href="/games/">` removed from all 6 games**, static link at `src/layouts/GameLayout.astro:34` ABOVE `#stage` → ADR-0014; crawlable `/games/` in `dist/` **0/6→6/6** (had only ever been JS-rendered) · `78af47b` NEW `scripts/gamenav-{again,start}-grid-probe.mjs` · captures `docs/verification/evidence/34/12`–`15` · tests 144 throughout · filed gh#37 · gh#38 · gh#39

dec: ADR-0014 — no navigation target inside `#stage`; ownership rationale + both rejected guards live there, do not restate · **ADR-0013 is now CONTESTED by measurement, note added at its foot — do not read it as settled while gh#39 is open** · editing all 6 games was measured, not churn: the same control's y swings 323→683px across rosters 2→8, so per-game clearance (−26px…+339px) cannot be reasoned from · **centre-x sampling is why the harness missed GameNav** — anchors sit ~7px off axis; grid-scan the whole control box, and sample the `#start-round` transition too · `containerTop` observable is BLIND to chips reflowing inside a flex row (0px delta against known-buggy `05b103a`) — never reuse it for chip-row questions, use `elementFromPoint` · `daily-fortune`'s wrong-person path is real but its class was mis-diagnosed at first: `replaceChildren()` closes the *pre*-tap DOM only, the hazard is what replaces it

next:
- [ ] **gh#39 — `GameNav` vs ADR-0014 conflict, owner decision (focus).** Done when ADR-0013 is amended, exempted, or accepted with reasoning recorded · repro `node scripts/driver.mjs scripts/gamenav-again-grid-probe.mjs`
- [ ] **owner-run, unchanged:** wizard §2 Azure token · gh#9 domain · gh#29 AdSense pub-ID (gh#29 closes gh#15–18 in one stroke, then epic gh#14). ⚠ the moment `gh secret list` is non-empty every push to main IS a deploy (`ci.yml:222`) — every push pre-auth void, re-gate it. Done when `gh secret list` non-empty
- [ ] gh#38 — CI runs no typecheck and `tsc`'s program holds 0 `.astro` files. Done when `astro check` first-run output is recorded verbatim + a decision on adding it, calibrated so a broken `.astro` ref makes CI red
- [ ] `inViewport` latent hole in `scripts/no-nav-in-stage-probe.mjs` — computed ~:69, recorded ~:78, never feeds `walkUsable` ~:219-230, so a control below ~900px makes `elementFromPoint` return null = **vacuous PASS**. Done when wired into scoring or removed
- [ ] love-match nav clearance is "not reproduced", **not** "safe" — only centre-x was tried. Done when the grid probe runs against `#lm-again` at rosters 2–10
- [ ] gh#37's remaining ghost-*action* pairs accepted as recoverable, not fixed (siamsi `217→232→248` · short-stick `111→93` where a ghost tap can draw the deciding stick · pick-loser `61→77` · timebomb `96→122` incl. `detonate()` firing from `frame()` · love-match `271→325/331`). Done when field evidence shows a ghost action losing a real round, or the acceptance is re-affirmed

inflight: measured at save — working tree carries only this save's own files · `0/0` with `origin/main` before this save · **open PRs: checked, none** · branches: `main` only · CI green on `78af47b` (run 32012262344, Deploy `skipped` = no deploy fired) · GitHub writes this session: 3 issues filed + 2 comments + 4 title edits (each issue created with a placeholder title, then set from the number GitHub actually assigned; gh#37 retitled twice, the second time when its scope widened from one game to six) · committed direct to main, no PR

spent: queue 6→6 · closed 0, filed 3 · batches 4 · ctx: not measured (no transcript read) · ended early: no

### S2026-08-17#2

done: **5 commits, `0189b22`→`a2e8eca`, pushed, CI green on both pushes (runs 32000503398 · 32002361529), Deploy step `skipped` on both.** `0189b22` **love-match double-tap fixed: tap 1 re-rendered the chip row without the picked person, so later chips shifted left under the finger and tap 2 announced someone the group never chose** — `renderPick()` now builds chip row + header + back button once and is never called again mid-pick; `pick()` marks the chip taken in place (`disabled` + `aria-pressed` + authored `opacity:0.5`, not Chrome's UA default) and `if (index===firstIndex) return` blocks the self-pair that in-place marking newly allows; header name truncated (`headerNameFor()`, `HEADER_NAME_MAX=20`) so a long name cannot wrap to a 3rd line and shift the row vertically · `41cfcb4` `maxlength="24"` on `#roster-add-name` + the `saveGroup` comment's "additive and recoverable" claim corrected (false — `saveGroup` overwrites wholesale) · `4e1d5d0` **`roster.add` two-tab race CONFIRMED in a real browser, then fixed** — `navigator.locks.request` wraps the whole read-modify-write, `add` is now async with 1 caller, inline fallback where Web Locks is absent · `a2e8eca` NEW `scripts/roster-lock-two-tab-race.mjs` · 6 captures `docs/verification/evidence/34/06`–`11`; provenance notes on `06`–`08` re-derived (had been byte-identical copy-paste, under-declaring the dirty tree) · tests 138→144

dec: **love-match fix chosen on ownership, not taste** — a timing settle gate enumerates how long after a re-render a tap is stale (browser-scheduler-owned, never converges); name-keying contradicts shipped intent, `love-match.ts:232-234` makes duplicate names supported with the index as disambiguator; DOM structure is ours, so no-reflow converges. `pick-loser`'s `phase` gate is same-button re-entrancy, NOT a shifted-target gate — still do not copy it · owner approved the taken chip staying in the row dimmed rather than disappearing · **owner ruled `GameNav` stays as-is, item closed** → ADR-0013 · `remove`/`clear` share the lost-update shape but have 0 callers; left unlocked deliberately — locking needs union-then-subtract inside the lock, else a tab whose write was swallowed by quota deletes names it never saw · **the `withLock` callback must stay synchronous** — `ponytail:` comment records that ceiling; an `await` inside widens a ms-wide window to human scale · **Node 22 defines `navigator` WITHOUT `navigator.locks`** — a bare `typeof navigator` guard picks the wrong branch in the test runner · ADR-0009 extended: the harness is part of the evidence, not just the result

next:
- [ ] **owner-run, unchanged:** wizard §2 Azure token · #9 domain · #29 AdSense pub-ID (**#29 closes gh#15–18 in one stroke**, then epic gh#14). ⚠ the moment `gh secret list` is non-empty every push to main IS a deploy (`ci.yml` `HAS_DEPLOY_TOKEN`) — every push pre-auth void, re-gate it. Done when `gh secret list` non-empty
- [ ] `pick-loser` + `daily-fortune` double-tap — was parked as "depends on pixel positions, static reading can't decide"; now decidable, the apparatus exists. Done when the chip-row `getBoundingClientRect().top` delta is measured at 320px for both games and a capture is committed · via `docs/agents/browser-verification.md`
- [ ] **no capture has ever run on iOS Safari, the actual platform** — all 11 are headless Chrome, incl. every taken-chip and 320px reflow claim. Done when one capture runs on a real iOS engine, or the gap is recorded as accepted with its reason
- [ ] `roster.remove`/`clear` unlocked while `add` is locked. Done when either gains a caller (then union-then-subtract inside the lock) or a test pins that they have none
- [ ] start-button tap during the awaited `roster.add` snapshots the roster before the new name lands (REFUTE finding, unreachable today: window is ms, human taps ≥50ms). Done when the `withLock` callback is re-confirmed synchronous, or add + start are disabled for its duration

inflight: measured at save — working tree carries only this save's own 2 files · 0/0 with `origin/main` · **open PRs: checked, none** · branches: `main` only · CI green on `a2e8eca` (run 32002361529, Deploy `skipped` = no deploy) · open issues 12 · GitHub writes this session: none · committed direct to main, no PR

spent: queue 6→5 · closed 0, filed 0 · batches 2 · ctx ~25% at save · ended early: no

### S2026-08-17#1

done: **3 commits, `c92ae41`→`5c36883`, pushed, CI green on all 3.** `95db4bf` **#25-class data loss fixed: `ล้างกลุ่มนี้` destroyed a live round in 5 of 6 games with no prompt** — `planClear` gained `roundLive` (`player-select.ts`), fed from `root.hidden` in `requestClear` (`PlayerSetup.astro`), the liveness bit the shell already set and never read back · `clearCopy()` picks 3 copy cases · `roster.add` re-reads before write (cross-tab lost update) unioned with the in-memory list so a failed write still keeps names on screen · NEW `scripts/check-citations.mjs` + `roster.test.mjs` · `thai-comments.mjs` now `exitCode=1` on hit (it **always exited 0 and ran nowhere** — #36 was closed on its metric) · both wired into `ci.yml`, both selftest-calibrated both ways · `c92ae41` `วง`→"group" in 10 `src/games` comments · `5c36883` `<!--` → `{/* */}` in `GameLayout` + 4 tool pages: **dev prose reached 10 of 14 built pages**, `dist/` −2774B · tests 122→138 · ADR-0008 + ADR-0010 corrected · gh#29 body: 4 line-number cites → `§N`

dec: **`วง` = the roster subset playing this round, renders "group"** — anchored to shipped `GROUP_KEY='watduang:group'`, verified at `75322a9`: `types.ts:23` defines it, `timebomb.ts:1` used `วน` not `วง`, `pick-loser.ts:1` was already English. A fable SOLVE fork claimed polysemy citing those exact lines; refuted on primary evidence. **Scope: code comments only** — `นั่งเป็นวง` in UI copy is a real physical-circle sense and stays · **citations never quote heading prose or line numbers** — 4 have died that way; cite issue/ADR numbers or `§N`, the *checker* is what bounds the set, not the syntax (ADR-0008 §Flip-fact re-scored: the 2026-08-15 entry inferred safety from manifest *length*; the load-bearing fact is that siamsi is the sole `saveCheckpoint` caller) · **owner approved** all 3 confirm-copy pairs incl. the both-case over-naming on siamsi's own page (over-names OK, under-names never)

next:
- [ ] **owner-run, unchanged:** wizard §2 Azure token · #9 domain · #29 AdSense pub-ID (**#29 closes gh#15–18 in one stroke**, then epic gh#14). ⚠ the moment `gh secret list` is non-empty every push to main IS a deploy (`ci.yml:14`) — every push pre-auth void, re-gate it. Done when `gh secret list` non-empty
- [ ] `love-match.ts:290-301` — first chip tap re-renders the row without that person, shifting later chips under the finger; a rapid double-tap reads out a pair the group never chose. Recoverable in 1 tap via "ดูคู่อื่น", so Low. Done when a settle gate exists and a test pins it. ⚠ `pick-loser.ts:93`'s `phase` gate is same-button re-entrancy, NOT a shifted-target gate — don't copy it. Double-tap in pick-loser/daily-fortune unsettled: depends on pixel positions, static reading can't decide
- [ ] browser proof covered only the **numbered-players** path (`start-numbered`) at 320px — the name-entry path was never driven. Done when M1–M3 pass on it too · via `docs/agents/browser-verification.md`
- [ ] `GameNav` (`GameLayout.astro:49`) navigates away from a live round with no prompt — label matches effect so not #25-class, but it is the last unprompted exit. Done when owner rules it in or out
- [ ] `PlayerSetup.astro:281` `saveGroup([...selected])` is NOT gated by `clearsSession` — a tool page may write the group prefill though it may not wipe it (intended per #15, reads as a contradiction). Done when the asymmetry is either commented at the line or removed
- [ ] two-tab `roster.add` residual race (read-read-write-write) still loses a name — union can't express a deletion, `remove`/`clear` would need tombstones. Never reproduced in a browser, only reasoned. Done when 2 real tabs confirm or refute it

inflight: measured at save — tree clean · 0/0 with `origin/main` · **open PRs: checked, none** · CI green on `5c36883` (run 95278882033, Deploy step `skipped` = no deploy) · open issues 12 · branches: `main` only · GitHub writes: gh#29 body edited (round-trip verified) · this save is committed direct to main, no PR

spent: queue 5→6 · closed 0, filed 0 · batches 2 · ctx 29% at save · ended early: no

meta: master SH/RH re-read at this save — **master converged to this repo's layout**: its § State home now declares `SESSION-HANDOFF.md` the ONE state home and RH gives it precedence, so `.claude/commands/save-session.md` §1 was a stale fork claiming master said the opposite (fixed here). Still genuinely repo-specific: **h3 `### S` headers** (master expects `## S`, so `roll-state-window.sh` always ABORTs → manual sed roll + 3 asserts, ran that way this save) · the repo-wide budget sweep whose leading `!` is load-bearing · 12KB ceiling for every `docs/**` and `.claude/**` doc

### S2026-08-16#4

done: **5 commits, `37bcd33`→`012db0e`, pushed, CI green on both pushes.** `d1949f9` `GameNav.astro:15` `aria-label={heading}` — the desync was LIVE on 9 of 10 navs; it hid because `tool/number.astro:41` overrides `heading` with the exact string that was hardcoded · `a872e88` both budget FAILs cleared: `site-owner-checklist.md` 17651B→8665B split at the deploy seam (§3/§4 state their own dependency) into NEW `docs/post-launch-checklist.md` 10730B, moved H2s stubbed so §3/§4/§5 citations still resolve in 1 hop · `adr/0004` 15081B→8287B by **translation alone, no split** · `save-session.md` budget table now defers to `check-budgets.sh` + carries a repo-wide sweep · `75322a9` NEW `scripts/thai-comments.mjs`, parser-backed (typescript + @astrojs/compiler, no new dep), selftest calibrated BOTH ways, reproduces #36's table 236 lines/35 of 52 files · `7970c3d` **#36 migrated by 4 parallel workers on disjoint sets, then CLOSED** with an evidence comment · `012db0e` `CONTEXT.md` 8011B→5716B, prose EN / terms Thai · `runbook.md` new trap "A comment-only change still moves `dist/`" · #24 `wayfinder:grilling` removed. Open issues 13→12

dec: **`วง` renders "group", NOT "circle"** — REFUTE said circle by majority; overridden on primary evidence, `session.ts:1` was already English pre-migration and says "this group" about the same `GameSession` (its count included code identifiers like `GROUP_KEY`) · `adr/0004` NOT split — ADR-0012: the addenda guard the same decision, a split greens the byte gate while RAISING per-route ingest · doc budget gate does NOT cover `docs/verification/**` · `sessions-archive.md` · `.scratch/**` (owner call) · a comment needing Thai text uses `\uXXXX` escapes — ASCII so the gate stays 0, and the concrete example survives instead of decaying into a general claim · **#36's "0 Thai comments" metric CONFLICTS with CLAUDE.md's keep-domain-terms-verbatim rule** — the detector counts any Thai char in a comment; resolved by romanize/translate in comments only

next:
- [ ] **owner-run, unchanged:** wizard §2 Azure token · #9 domain · #29 AdSense pub-ID (**#29 closes gh#15–18 in one stroke**, then epic gh#14). ⚠ the moment `gh secret list` is non-empty every push to main IS a deploy (`ci.yml:13-14`) — every push pre-auth void, re-gate it. Done when `gh secret list` non-empty
- [ ] **`วง` rendering is split** — "group" in `src/shell/**`, "circle" in `src/games/**`; 4 workers each resolved my contradictory brief differently. Done when one term is used repo-wide. ⚠ needs the ORIGINAL Thai per line (`git show 75322a9:<file>`) to tell which rendered `วง` vs `รอบ` — they are different terms and a blind rename corrupts both
- [ ] **`adr/0008:139` cites `runbook.md` by a Thai heading name** — resolves today, breaks the moment the runbook converts to English. Same defect class that broke `adr/0007` this session. Done when it cites a durable anchor
- [ ] **checkpoint/session write path never edge-walked** (ADR-0010 · #24) — deferred at the drain gate, not because it was cleared. Done when the money/state-mutating path has a coverage report
- [ ] `scripts/thai-comments.mjs` gaps, both marked in source: a comment inside an `.astro` `{expression}` is an unmodelled channel (would UNDER-report, 0 such today) · `site-owner-wizard.sh` is outside the grammar, 0 Thai today, skip warned on stderr only

inflight: measured at save — tree clean · 0/0 with `origin/main` · open PRs checked, none · CI green on `012db0e` (run 31955132825) · open issues 12 · branches: `main` only · GitHub writes: #36 commented + closed, #24 label removed

spent: queue 5→5 · closed 3, filed 3 · batches 3 · ctx 33% at save · ended early: no

A resume never reads this file — it reads the live entry in `SESSION-HANDOFF.md`. This exists so the
live window stays at one entry without losing history.

Window: **N=1** (one live entry in `SESSION-HANDOFF.md`; older entries roll here at the first save of a new session).

---


<!-- Keep entry ids out of this prose. Roll verification asserts the archive holds exactly one
     copy of a rolled header, and a stray mention here would make that assert lie. -->

### S2026-08-16#3

done: **`ac52311` pushed, CI green, deploy skipped** — `gh secret list` proved empty *in the same shell command as the push*, so the condition could not go stale between check and act. New `docs/agents/capture-freshness.md`; `browser-verification.md` 15270B→11579B PASS; `adr/0009:93` repointed; the moved H2 stays behind as a stub so that citation still resolves in one hop. **#36 filed** — Thai-comment migration scope, body readback-verified, 35-row table intact. #12·#9·#24·#29 relabelled → **all 13 open issues now carry a triage label**; #20 got a doc-move pointer comment. GameNav audit **no regressions**: the 3 former inline copies are md5-identical to the component after class-name normalisation, `-next` selectors survive by construction, 0 self-links, ADR-0005 clean. ponytail debt: 12 markers, 10 with ceilings, **0 outstanding**.

dec: **ADR-0012** — a doc split follows the *task seam*, not section size; overturned S#2's queued "split traps out", which would have raised per-route ingest while greening the byte gate · Thai-comment migration = **file an issue naming the whole set** (owner call: not convert-now, not scope-the-rule-to-new-code) → #36 · #24 got `ready-for-human` + `wayfinder:grilling`; the second is **agent's call, Unconfirmed** — owner asked for "the missing label", singular, and ADR-0010 already decided #24, so `grilling` may overstate it. Revert = one `gh issue edit 24 --remove-label`. Real gap: **no label in the set means "dormant until a trigger fires"**, which is what #24 is

next:
- [ ] **`src/layouts/GameLayout.astro:44-46` ponytail comment guards the wrong file** — it warns about a `<style>` block landing *in GameLayout*; the real threat is `src/styles/tokens.css`, global via `Base.astro:2`, reaching every page (verified: 8 direct + `game/[id].astro` through GameLayout wrapping `<Base>`). Conclusion still true, stated mechanism is not. Done when the comment names tokens.css
- [ ] **2 budget FAILs, measured this session, not caused by `ac52311`** — `docs/site-owner-checklist.md` 17651B · `docs/adr/0004-*.md` 15081B (also still Thai → converts on touch). Root cause they went unseen: `check-budgets.sh` gates ONE doc per call, there is no repo-wide invocation. Done when both PASS
- [ ] #36 Thai-comment migration — 236 lines across 35 of 52 files, `ready-for-agent`. ⚠ several of those files also hold Thai **strings** that must survive; the DoD carries the calibration check
- [ ] **wizard §2 Azure token** — owner-run, unblocks #13's real-phone pass. Done when `gh secret list` non-empty. ⚠ from that moment `git push` to main IS a production deploy (`ci.yml:13-14`) — every push pre-auth void, re-gate it
- [ ] #9 domain · #29 AdSense pub-ID — owner-run, **#29 closes gh#15–18 in one stroke**, then epic gh#14 · `GameNav.astro:15-16` `aria-label` hardcoded while `heading` is a prop — silently desyncs on the next override · row 4 locked till rows 6/7 · row 5 locked (ADR-0011) · #24 dormant (ADR-0010)

inflight: measured at save — tree clean before this commit, 0/0 with `origin/main` · open PRs checked, none · CI green on `ac52311` · open issues 13 · branches: `main` only · GitHub writes: #36 created, #12/#9/#24/#29 relabelled, #20 commented

spent: queue 6→5 · batches 3 · ctx 17% at save · ended early: no

### S2026-08-16#2

done: **3 commits, CI green each, deploy `skipped` (0 secrets re-verified in-shell at push)** — `10d09e7` new `src/components/GameNav.astro` replaces 3 already-drifted inline copies, 5 call sites, game pages gain sibling nav (12+/21− in page files) · `1679a69` `/tool/number/` nav · `0bdce86` trap 7 in `browser-verification.md`. **#35 CLOSED 9/9** — per-box evidence and 2 self-corrections live in its closing comment. Branch `worktree-agent-a3373c30e64ce69da` deleted (was `c62f438`). #14–#18 audited: **nothing closeable** — gh#14 epic has no DoD section, gh#15–18 each have exactly ONE unchecked box and it is the same ad-slot box, all gated on #29. 122 tests · 320px re-proven on 10 pages, detector calibrated both ways.

dec: rationale lives in #35's closing comment — cite it, never restate · class names `wheel-next`/`draw-next`/`team-next` pass as **props and survive verbatim in served HTML** (gh#15–18 committed evidence cites those selectors; renaming silently voids it) · commit split by **copy decision, not by file**: `heading="เล่นเกมต่อ"` lands only in `1679a69`, so #35's own diff ships no new visible Thai · that heading IS newly-visible — the aria-label was never user-visible; owner chose it knowing that · GameNav sits inside `<main>` on tool pages (34rem column), outside on game pages — safe only while `GameLayout` has no `<style>` block, ceiling marked in a `ponytail:` comment there

next:
- [ ] **Thai code-comment migration — owner scope call, blocks nothing else.** Real set **213 Thai comment lines across 34 of 50 files** in `src/`+`scripts/`; the English rule is dated 2026-08-14 and postdates them. Converting a subset = half-converted at repo scale. Done when an issue names the file set, or the rule is scoped to new code only
- [ ] **`docs/agents/browser-verification.md` over budget 15270B > 12288B** — already over at 14096B before trap 7 added 1174B; earlier budget sweeps never covered this file. Heaviest: traps 6190B · stale-capture 4087B. Done when `check-budgets.sh` passes; fix is structural (split traps out), not prose-squeezing
- [ ] **wizard §2 Azure token** — owner-run, unblocks #13's real-phone pass. Done when `gh secret list` non-empty. ⚠ from that moment `git push` to `main` IS a production deploy (`ci.yml:13-14`) — every push pre-auth void, re-gate it
- [ ] #9 register `watduang.com` — owner-run, payment · #29 AdSense pub-ID — owner-run, **closes gh#15–18 in one stroke** (identical single box), then epic gh#14
- [ ] row 4 locked till rows 6/7 show results · row 5 locked (ADR-0011) · #24 dormant (ADR-0010) · #12 relabel-only

inflight: measured at save — tree clean, 0 ahead of `origin/main` · open PRs checked, none · CI green on `0bdce86` · open issues 12 · branches: `main` only · GitHub writes: #35 body edited ×2, commented, closed

spent: queue 8→6 · batches 4 · ctx 21% at save · ended early: no

### S2026-08-16#1

done: **5 commits, CI green on each, deploy `skipped` every time (0 secrets)** — `acbf966` home page links all 6 games + 4 tools, iterating `src/games/manifest.ts` (+ new `src/tools/manifest.ts`) + never-tick convention recorded in `issue-tracker.md` · `ae8d605` corrected a false blocker claim · `104dc15` `CDP_STAGE2` usable without experimenting · `8d84b19` site-wide brand footer in `Base.astro` — nothing linked home before · `4462686` trap 6. Closed #33 #34 (owner confirmed the 53+31 read → ADR-0011 owner gate discharged). Filed #35 crawl-sink, `bug`+`ready-for-agent`. 122 tests. 320px re-proven post-footer on `/` and `/game/timebomb/`, detector calibrated 908/320.

dec: home enumerates games by **iterating the manifest, never hardcoding** — the roster grows (ADR-0002, ADR-0011 row 4) · names+links only, **never per-game `seo.description`** on home — that is where duplication with `/games/` starts · `src/tools/manifest.ts` is display data only, **not** ADR-0004's anticipated tools manifest; CI baseline slugs stay in `ci.yml:130,:173`, frozen at 4 by #11 · site-wide link is a **footer not a header**: `GameLayout` wraps `Base`, so it reaches game pages, and a game page is a phone mid-round · link-free game pages ruled a **bug, not intent** (owner) → #35

next:
- [ ] **wizard §2 Azure token** — owner-run; unblocks #13's real-phone pass (checklist §3 runs on `azurestaticapps.net`, needs no domain). Done when `gh secret list` non-empty. ⚠ from that moment `git push` to `main` IS a production deploy (`ci.yml:13-14`) — every push pre-auth void, re-gate it
- [ ] #9 register `watduang.com` — owner-run, payment. whois free 2026-08-16. Independent of §2, either order
- [ ] #29 AdSense account + pub-ID — owner-run. Done when the `ca-pub-` ID is handed over, then #29 closes
- [ ] #35 game pages are crawl sinks — `ready-for-agent`, but carries an owner-owned box (ADR-0009)
- [ ] #15-#18 ad-slot box only — needs #29. #14 has no DoD boxes. #13 needs §2, not #29
- [ ] row 4 locked until rows 6/7 show results · row 5 locked (ADR-0011)
- [ ] #24 dormant until a 2nd checkpoint writer exists (ADR-0010) · #12 relabel-only if ever touched

inflight: measured at save — tree clean, 0 ahead · open PRs: checked, none · CI green on `4462686` · open issues 13 · branch `worktree-agent-a3373c30e64ce69da` fully merged into main, deletable · GitHub writes: 1 filed, 2 closed

spent: queue 8→7 · batches 3 · ctx 26% at save · ended early: no — every agent-doable item Done, rest owner-gated

### S2026-08-15#7

done: **5 commits, CI green on each, deploy step `skipped` every time (0 secrets)** — `90b3364` game 3 จับไม้สั้น `short-stick` · `0e9271b` timebomb pulse guarded for reduced-motion + ADR-0011 + 2 doc fixes · `bba2b11` whois guard · `b06db57` game 4 วัดดวงวันนี้ `daily-fortune` (53 คำทำนาย) · `f7538e7` game 5 ดวงความรัก `love-match` (31 lines / 5 bands) + SARA AM unified in the shared `normalizeName`. **6 games live**; #5's v1 table complete except locked rows 4/5. Filed #30 #31 #32 #33 #34; closed #30 #31 #32. 122 tests. Browser evidence `docs/verification/evidence/{30,31,33,34}/`. `issue-tracker.md` state table **deleted** (wrong in both directions inside one session) → `gh` is the only state source. Session crossed Bangkok midnight; entry keeps the 08-15 stamp because 5 commits + 3 issue comments already cite `S2026-08-15#7`.

dec: **ADR-0011 (new)** = content library unlocks per game by risk class, not wholesale · rows 6+7 unlocked, row 5 dare-library locked (the one account-termination risk), **row 4 explicitly undecided — not swept in** · its advice-register rule was reworded mid-session: the first wording carried 2 clauses of different width and 3 items in row 6's own pool fell between them · determinism IS what separates `daily-fortune` from เซียมซี (ADR-0002), not styling — random-per-tap would be a re-skin · none of the 3 new games writes a checkpoint → ADR-0010 unfired, เซียมซี still sole writer · #12 **not closable** — ADR-0003:23 forbids it and the body disclaimer it demanded already exists · manual-review rule kept universal, not dare-library-only

next:
- [ ] **owner reads 53 items (#33) + 31 lines (#34)** — last box on each, gates ADR-0011, no agent may tick (ADR-0009). Done when the owner confirms both sets read, then both issues close
- [ ] row 4 locked until rows 6/7 show results · row 5 locked (ADR-0011)
- [ ] #29 AdSense account + pub-ID — owner-run (Google identity + payment; an agent must never enter them). Done when the owner confirms the account shows Ready and hands over the `ca-pub-` ID, then #29 closes
- [ ] deploy chain `bash scripts/site-owner-wizard.sh` §1/§2/§4 — owner-run. Done when `gh secret list` non-empty. ⚠ from that moment `git push` to `main` IS a production deploy (`ci.yml:209`) — every push pre-auth void, re-gate it
- [ ] #15-#18 blocked on the ad-slot box alone — needs #29. #14 has **no DoD boxes at all**. #13 is **not** ad-blocked: its one open box is the real-phone pass (wake lock + iOS audio unlock), which needs wizard §2/deploy only — not the domain, not #29 (`docs/site-owner-checklist.md` §3 says it runs on the `azurestaticapps.net` URL). Verified 2026-08-16 by reading every open box. No agent work closes any of them
- [ ] #24 dormant until a 2nd checkpoint writer exists (ADR-0010)
- [ ] home page links `/games/` but names no game — 6 game keywords get no internal link from the highest-authority page, while the tools line names all 4. Owner copy call
- [ ] #12 relabel-only if ever touched

inflight: measured at save — tree: this save only · `f7538e7` pushed, 0 ahead · open PRs: checked, none · CI green on `f7538e7` (`31899402100`) · open issues: 14 · GitHub writes this session: 5 filed, 3 closed, #1 body annotated (1 line, round-trip verified)

spent: queue 10→8 — **7 of RH's 10 resolved · 3 carried · 5 new surfaced** (churn, not shrink) · batches 5 · ctx 41% at save · ended early: no — every agent-doable item Done, rest owner-blocked

### S2026-08-15#6

done: **`c72ff15` pushed · 4 stale red-green verdicts annotated · kill-tests calibrated both ways · owner checklist made owner-runnable** — 6 files +16/−6, CI `31891059300` green. `docs/verification/tools-15-18/{15,16,17,18}.md` each got a dated annotation — pure insertion, `--numstat` 2/0, verdict lines untouched (they record a walk). Calibration: reverted each clamp singly, ran only that tool's suite — wheel/draw/number each red in **exactly** the named test, team 1/10, all green on restore → "gap closed" is measured, not cited. `ci.yml:16,18` actions→v5, both `success` in CI; deploy step `skipped` (secrets total_count=0 → that push was NOT a prod deploy). `site-owner-checklist.md` 5 drift fixes, load-bearing = add-secret consequence warning. #1 commented (`issuecomment-5302760777`). 96/96.

dec: **games 2–7 pause SUPERSEDED — no gate, no owner left** — ADR-0003 (`a4eda47`) replaced #12's go/no-go with #19's Search-Console-clicks gate; #12's own body disclaims itself, worksheet never existed. Traps: ~230-item content library is **NOT** re-authorized (ADR-0003:13,19 = risk ordering, not a gate) · pause clause hyperlinks `issues/12` directly so **ticket=NN+1 does NOT apply there** (3 numbering schemes in that one comment) · #19 gates the `/en/` pivot not the build, blocked by #9 · the 2 verification docs never contradicted — different questions (non-vacuity of the Aug-14 suite vs red-green provenance), so the annotation frames gap-found→gap-closed, not supersession · `site-owner-checklist.md:33` = **job** level (`ci.yml:13-14`), not workflow level

next:
- [ ] games 2–7 unblocked — pick the next game per ADR-0004 ordering + #5's list. Done when its page + tests ship, CI green
- [ ] #29 AdSense account + pub-ID — owner-run (Google identity + payment details; an agent must never enter them). Done when #29 boxes 1-2 tick
- [ ] deploy chain `bash scripts/site-owner-wizard.sh` §1/§2/§4 — owner-run. Done when `gh secret list` non-empty. ⚠ from that moment `git push` to `main` IS a production deploy (`ci.yml:209`) — every push pre-auth void, re-gate it
- [ ] #28 aged-record 6h — owner accepts or changes; if changed, `MAX_AGE_MS` (`session.ts:5`) + `session.test.mjs:413`'s 7h fixture move together
- [ ] #12 no longer a gate (own body says so) — close or relabel; GitHub write, needs owner go
- [ ] #1 body ~L81 still reads "pause live" — commented, not edited; body edit needs owner go
- [ ] `scripts/site-owner-wizard.sh:159-160` (`gh secret list` — owner may lack gh) + `:198` (`dig NS`, no `nslookup` fallback) — found, not fixed
- [ ] #24 dormant until a 2nd checkpoint writer exists (ADR-0010)

inflight: measured at save — tree: `SESSION-HANDOFF.md` + `docs/sessions-archive.md` modified (this save only) · `c72ff15` pushed, no ahead-count · open PRs: checked, none · CI green on `c72ff15` · open issues: 13 · GitHub writes this session: #1 comment only

spent: queue 7→8 · batches 1 · ended early: no — every agent-doable item Done, rest owner-blocked

### S2026-08-15#5

done: **`e0c4479` pushed · #20 CLOSED · capture-staleness bounded · AdSense gap filed** — `c5461e7` (+150/−1) + `a5806df` (+9/−2) pushed, CI green on both. New § in `docs/agents/browser-verification.md` bounding when a committed capture goes stale; REFUTE round 1 ruled draft 1 **unsafe** (seam list missed the two `.astro` files the unit suite cites by line but never executes; over-generalised to visual checks) — both fixed, `a5806df` pinned visual verdicts. `pick-loser` proved at `e0c4479` → `docs/verification/evidence/pick-loser/01`: 320px PROVEN · reduced-motion N/A (`getAnimations()`=0 both runs) · refresh-clean PROVEN · collision-guard PROVEN (siamsi checkpoint byte-identical through a full pick-loser round + refresh, still resumed). #10 · #24 · #28(+amend) · #29 · `site-owner-checklist.md` §5 + `:47` · ADR-0009 § Outcome scored. 96/96 · tree clean.

dec: **capture staleness = point-in-time + decidable re-trigger** — rule in `docs/agents/browser-verification.md`, reasoning scored in ADR-0009 § Outcome; reason is that a per-commit seam test **terminates**, NOT that future commits are "unowned" (that misreads ADR-0009 — do not re-derive it) · seam list is illustrative, not exhaustive · **visual captures sit outside the rule** — pinned to their commit, re-triggered by ANY shared CSS/layout/script-loading change · #20 needed no third capture; "fresh at HEAD" would have made the box permanently unclosable · **deploy chain alone does NOT unblock the 4 ad-slot boxes** — prior state claim wrong: no AdSense account, no pub-ID, no `ca-pub` in `src/` → #29 · aged-record silence is by design → #28, no code · agent claim REFUTED: CI's sitemap gate already loops all 4 tools (`ci.yml:130`)

next:
- [ ] #29 AdSense account + pub-ID — owner-run (Google identity + payment details; an agent must never enter them). Done when #29 boxes 1-2 tick
- [ ] deploy chain `bash scripts/site-owner-wizard.sh` §1/§2/§4 — owner-run. Done when `gh secret list` lists `AZURE_STATIC_WEB_APPS_API_TOKEN`. ⚠ **consequence: from that moment `git push` to `main` IS a production deploy** (`ci.yml:208` flips) — every push pre-auth void, re-gate it
- [ ] #28 aged-record 6h bound — owner accepts or changes it; no code. If changed, `MAX_AGE_MS` (`session.ts:5`) + `session.test.mjs:413`'s 7h fixture move together
- [ ] #12 keyword measurement — owner-run (Google Ads login)
- [ ] `docs/verification/tools-15-18/15.md:135-137` calls #15-14 UNPROVABLE against the **old** box text — **annotate, never rewrite**: it records a walk
- [ ] CI actions on deprecated Node 20 (`checkout@v4`, `setup-node@v4` forced onto 24) — informational, not failing. Done when both bumped and CI green
- [ ] #24 dormant until a 2nd checkpoint writer exists (ADR-0010)

inflight: measured at save — tree clean · `a5806df` pushed, no ahead-count · open PRs: checked, none · CI green on `c5461e7` + `a5806df` · GitHub writes: #10 · #24 · #28(+amend) · #20 closed · #29 (body repaired after a shell-quoting truncation — re-verified full) · 4 subagents returned, 1 claim refuted, 0 verify failures

spent: queue 6→7 · batches 1 · ended early: no — every Required/High item Done or owner-Blocked

### S2026-08-15#4

done: **game 3 `pick-loser` shipped · F1's two orderings closed by identity CAS — `9c9a080`** (8 files, +608/−221). `write()` moved inside `loadSession()` as an identity-CAS chokepoint; `mayCreate` + existence check DELETED, not layered; identity commits only after a successful `setItem` (a swallowed quota error can no longer make the guard a permanent silent no-op); legacy no-id records still match. Guard enumerates captured-id vs stored-id, both minted by `session.ts` → owned set, converges (ADR-0009). `pick-loser` = 0-content, writes no checkpoint → ADR-0010's second-writer condition NOT triggered (scored in that ADR). ADR-0010 15678B→8344B: both Finding bodies moved byte-identical (shasum `2b26337`) to `docs/verification/adr-0010-findings.md` + § Supersession. 96/96 (was 87) · tsc 0 · build 0 · every guard non-vacuous by its own mutant (M1→5/9/10/13 · M2→11 · M3→12 · M4→13 · M5→14 · aging→15) · pos control recalibrated vs the NEW mechanism: pass 11/fail 4 of 15. #27 commented + closed. REFUTE round 1 → 5 CONFIRMED, all dispositioned.

dec: **§32/1 keyword `ใครแพ้หมดแก้ว` DROPPED from `pick-loser`** — ticket 09 (#10) round-2 approval was reversed the same day by an unresolved lawyer-review note; owner took ticket 09 option ข · S2026-08-15#3's "leave the orderings open as a trip-wire" **REVERSED** — its premise (no new caller) expired when game 3 landed in the same session · aged-record refusal KEPT: `read()` already reported empty, so the old `write()` disagreeing was the bug (pinned, test 15) · findings moved byte-identical + annotated, never rewritten — the calibration record is what the verdict rests on

next:
- [ ] `git push` — `9c9a080` is local only, `main` ahead of `origin/main`. Done when `git status -sb` shows no ahead-count
- [ ] ticket 09 (#10) — record there that the keyword angle was dropped for `pick-loser`, else it gets re-proposed for game 4. The §32/1 gate itself stays OPEN: lawyer review before any page using that angle launches
- [ ] `pick-loser` browser proof unrun — 320px · reduced-motion · refresh-and-resume · via `docs/agents/browser-verification.md`
- [ ] aged-record refusal is silent — no user-facing signal, though `siamsi.ts:207` already has a failed-resume string. Decide surface-or-leave
- [ ] deploy chain — `bash scripts/site-owner-wizard.sh` §1/§2/§4, owner-run · unblocks 4 ad-slot boxes (#15-#18) + #13's real-device box
- [ ] #12 seeds verified ready S#4; measurement itself owner-run (Google Ads login)

inflight: measured at save — `9c9a080` committed, **NOT pushed** · open PRs: checked, none · GitHub writes: #27 commented + closed · 8 subagents returned, 0 escalations, 0 verify failures

spent: queue 6→6 · batches 3 · ended early: no — all 4 selected directions delivered

### S2026-08-15#3

done: **F1's resurrection window bounded at the seam, not measured in the browser — `68e4a03` · `a5b2ffd`** (5 files, +227/−16). Planned CDP probe DROPPED at the fork: the interleaving set is owned by the browser scheduler + HTML nav queue → sampling it never converges; and "prove it unreachable" targets a false statement (`session.ts:41` already records `location.reload()` is a macrotask away → the race is spec-**permitted**). Replaced by ordering enumeration at the `loadSession()` seam, `session.test.mjs` +4 (83→87). **Result is NOT the expected negative: 2 of 4 orderings are unguarded**, and the new tests pin the HOLE, not the guard — (a) stale closure whose first `setPlayers` is unspent; (b) `write()`'s check is existence-based, not identity-based, so a stale snapshot overwrites a new round (same class covers `markPlayed`/`saveCheckpoint`). Both unreachable in production today by call-site accident, not by construction. Calibrated both ways: pos control red 9/2 at `session.test.mjs:260`; each pin separately proven non-vacuous by a hole-closing mutant. REFUTE round 1 clean over 6 attacks. Also: `evidence/20/01-*` re-captured vs HEAD (ADR-0009 provenance gap closed) · `triage-labels.md` synced to `gh` 18/18 · 87/87 · tsc 0 · build 0 · ADR-0010 § Finding S2026-08-15#3 · #27 filed

dec: **an exit criterion over a set you do NOT own is unfalsifiable** — enumerate a set you own instead (ADR-0010) · the 2 holes were deliberately NOT closed: unreachable today, closing them is speculative → tracked as a trip-wire (#27), not a fix task · **#26 was the wrong home** for the finding (CLOSED 04:10Z, verified via `gh`) → new issue, never a comment on a closed one · #2's stale CDP DoD retired in-place before the roll so RH cannot re-enter the dead end · prior save's manual roll had glued `### S2026-08-15#1` onto a `-->` line (not line-start, would not render) — fixed this save

next:
- [ ] deploy chain — `bash scripts/site-owner-wizard.sh` §1/§2/§4, owner-run · unblocks 4 ad-slot boxes (#15-#18) + #13's real-device box · `--check` exits 0 (verified S#2)
- [ ] ADR-0010 is now 15.4KB (>12KB doc budget) — move its oldest finding sections to the archive at next touch · done when `check-budgets.sh` passes on it
- [ ] owner glance: Thai failed-resume string on `siamsi.ts` (compliant, unreviewed)
- [ ] #12 seeds ready; the measurement itself is owner-run (Google Ads login)

inflight: measured at save — `68e4a03` + `a5b2ffd` pushed to `main`; tree clean before this save commit · open PRs: checked, none · GitHub writes: #27 created (labels `bug` + `needs-triage`) · 6 subagents returned, 0 escalations, 0 verify failures

spent: queue 5→4 · batches 1 · ended early: 1 required pending (deploy chain — owner-run, blocked all session)

### S2026-08-15#2

done: **F1 fixed, `4b14565`** — a late `setPlayers` could resurrect a discarded record. `65d3d3c` closed that window for `#ss-draw`/`#ss-pass`; the resume path (`siamsi.ts:344`, split from its closure by `await load()` at `[id].astro:56`) was the sibling caller it missed. Guard = per-closure `mayCreate` in `loadSession()`: only the first `setPlayers` creates, later ones inherit `write()`'s existence refusal. `siamsi.ts` untouched. **Mechanism = call ordinality within one closure** — the flag refuses nothing itself and does NOT detect `clear()`; safety rests on `[id].astro:50-51` being the first `setPlayers` on every closure a game gets. Proof: F1 ordering red→green · anti-over-fix control (#20's refresh-resume must still update) · positive control vs `65d3d3c^`. 83/83 · tsc 0 · build 0 · #26 (closed) · ADR-0010 · **`ab52d9d`** — ADR-0010's clobber claim scored REFUTED at claim scope only; 2 REFUTE rounds each killed a real defect (R1: stated mechanism false — `setPlayers` writes the load-time snapshot `session.ts:67,70`, only existence re-read `:53`; R2: adjacency is not universal → became F1) · ADR-0010 Context citations re-verified, **8 of 13 had drifted** when `65d3d3c` reshaped `siamsi.ts` · `player-select.ts` Thai comments → English, Thai string literals byte-identical · #20 DoD box ticked w/ `evidence/20/01-*` (1/1) · #24 comment posted · shellcheck clean on `site-owner-wizard.sh`

dec: **`65d3d3c`'s browser harness is NOT in the tree** — it lived under `.claude/worktrees/`, gitignored by that same commit; runnable descendant = the ADR-0008 block in `session.test.mjs`. Evidence kept outside the repo does not survive its session · did NOT spot-fix `session.ts` when R1 surfaced it — those semantics were stabilized by a 12/12 repro; fixed only once chosen, with the positive control mandatory · #26 filed AND closed same session (fix shipped; left open it would read as pending at RH) · ADR-0010's decision (defer per-game keying) untouched and standing

next:
- [x] F1's browser race window — **superseded. Do NOT run the CDP probe.** The old DoD ("a CDP run shows the interleaving or proves it unreachable") was unreachable on both branches: the interleaving set is owned by the browser scheduler + HTML navigation queue, so sampling it never converges, and "prove it unreachable" targets a false statement — `session.ts:41` already records that `location.reload()` is a macrotask away, i.e. the race is spec-**permitted**. Replaced by ordering enumeration at the `loadSession()` seam (`session.test.mjs` +4, 83→87): 2 of 4 orderings are unguarded and now pinned by tests, both unreachable in production today by call-site accident, not by construction. Full record + the facts that would invert it: ADR-0010 § Finding S2026-08-15#3. `evidence/20/01-*` re-captured against HEAD — ADR-0009 provenance gap closed.
- [ ] deploy chain — `bash scripts/site-owner-wizard.sh` §1/§2/§4, owner-run · unblocks 4 ad-slot boxes (#15-#18) + #13's real-device box · `--check` exits 0 (verified this session)
- [ ] `docs/agents/triage-labels.md` is stale — claims the labels don't exist and "no repo exists"; both false, `gh label list` returns all 10 · done when it matches `gh`
- [ ] owner glance: Thai failed-resume string on `siamsi.ts` (compliant, unreviewed)
- [ ] #12 seeds ready; the measurement itself is owner-run (Google Ads login)

inflight: measured at save — `ab52d9d` · `4b14565` · this save commit, all on `main`; push runs immediately after this commit · open PRs: checked, none · GitHub writes: #20 body edit, #24 comment, #26 create+close · 8 subagents returned, 0 escalations

spent: queue 7→5 · batches 3

### S2026-08-15#1

done: **stale-closure checkpoint bug found + fixed, `65d3d3c`** (13 files, +607/−85) — a discarded round could come back: `loadSession()` hands out independent closures over one key, so a `#ss-draw`/`#ss-pass` click between `clear()`'s `removeItem` and `location.reload()` re-wrote the checkpoint via the game's stale `ctx.session`; after reload เริ่มรอบ offered กลับไปเล่นรอบที่ค้าง for the round just discarded. **Reproduced 12/12**, 3 write paths, positive+negative controls → **0/12 after**. Fix = `session.ts` `write(stored, create=false)`, never create only update; `setPlayers` is sole creator and always runs first (`[id].astro:50-51`, `siamsi.ts:344`). Regression detector is **raw record presence, NOT the checkpoint field** — one variant revives the record with `checkpoint:null`, indistinguishable from absent through `loadSession()` · **#16-08 ticked → 37 of 41** (`evidence/16/08-*`; identity by unique TEXT match + all-other-boxes-identical, asserted before AND after) · **#20's last DoD box proven** (`evidence/20/01-*`; mid-round state identical across refresh — plain reload does NOT auto-resume, เริ่มรอบ raises `#resume-choice`, both correct per ADR-0008) · `siamsi.ts` +holder-vs-`results.length` invariant +non-silent failed resume · `_template.ts` +shared-slot warning · `site-owner-wizard.sh` 16 owner steps · `keyword-planner-seeds.md` 11 items ×2 Thai seeds, zero invented volumes · Thai→English in 5 files · verified 79/79 · tsc 0 · build 0

dec: **#24 deferred — ADR-0010** (design recorded there, not built) · **ADR-0008's flip-fact re-checked against code: NOT met** — siamsi is still the sole checkpoint writer, so `planClear`'s game-agnostic predicate stays correct; an earlier claim this session that the trigger had fired was wrong, corrected in ADR-0008 · REFUTE round 1 → 6 findings, 5 fixed (wizard EOF infinite loop reproduced then cured · untracked worktree · Thai residue · TSV snapshot unlabeled · template omitted the create-guard), no round 2, all spot-fixable · `box-verdict-map.tsv` state column deliberately NOT flipped — it is a frozen snapshot (35 rows still read `unticked` while ticked); col7 renamed `live_state_at_2026_08_14_mapping_proof` instead

next:
- [ ] post the `#24` analysis comment — drafted this session, NOT posted (never authorized); rationale is safe in ADR-0010 · done when `gh issue view 24 --comments` shows it
- [ ] owner glance: new Thai string on `siamsi.ts` failed-resume path — `กู้รอบที่ค้างไม่ได้ — ข้อมูลรอบเดิมเสียหาย เริ่มรอบใหม่ได้เลย` (compliant, unreviewed)
- [ ] deploy chain — `bash scripts/site-owner-wizard.sh` walks checklist §1/§2/§4, unblocks 4 ad-slot boxes + #13 DoD4 · `--check` exits 0 today
- [ ] `[id].astro:52` — game B's start clobbers shared `session.players`; found by the ADR-0010 design pass, NOT fixed
- [ ] `player-select.ts` legacy Thai comments — file untouched this session so converge-on-touch never fired
- [ ] #12 seeds ready; the measurement itself is owner-run (Google Ads login)

inflight: measured at save — `65d3d3c` + this save commit on `main`, pushed · open PRs: checked, none · agent worktree removed and `.claude/worktrees/` now gitignored · 11 subagents returned · GitHub writes this session: 1 body edit + 1 comment, both on #16

### S2026-08-14#8

done: **#15–#18 DoD closed out, `e8d4183`** (10 files, +302/−76) — **36 of 41 boxes ticked live**, 5 withheld: #16-08 (PROVEN but pressable-path half has no committed artifact) + ad-slot #15-09 #16-10 **#17-11** #18-09 (externally owned) · box-ID→checkbox mapping **proven, was the open unknown**: report `## #<n>-<NN>` ID set == unticked-index set on all 4 issues (59 boxes/18 ticked/41 unticked) + text match + adversarial re-check → `box-verdict-map.tsv` (41 rows, each carrying BOTH texts so a fabricated match is detectable) + `dod-closeout-15-18.md` · 4 red-green boxes **reworded + old→new comment on each issue** (body edit alone buries the change in edit history) · 3 UNDECIDED **annotated N/A, ticked on the proven readability half**, ADR-0009 deliberately NOT cited (it governs sets we don't own; this one is owned and empty) · **4th clamp test added — all 4 tools now measured per set member**; reverting `team.ts:28` had left its suite fully green · `site-owner-checklist.md` §4 domain-join added, no-ALIAS fallback = nameserver migration not registrar forwarding (which breaks the apex canonical, `astro.config.mjs:5`) · `ci.yml` + `save-session.md` Thai→English, non-comment bytes unchanged · verified: 77/77 · build 0 · tsc 0 · impl files byte-identical to `abf1167`

dec: **`belowMin` is NOT a dead guard — #7's `dec:` and ADR-0007 were false; ADR-0007 amended, result REFUTED.** `CONTEXT.md:18-19` already had the correct narrower wording the same day and the ADR cited that entry while asserting the opposite — Unreachable only from the zero-selected *branch*; fires from `startBtn` whenever fewer names than `min` are ticked (`PlayerSetup.astro:225` → `player-select.ts:79`, caught firing in `tools-15-18/15.md:34`). Owner **declined the issue**; a test pins the branch-local fact instead · red-green boxes: the old wording quantified over **immutable git history** (owned by nobody, never converges) — reworded onto a re-checkable artifact property · ticking 4 red-green boxes was **my inference from the reword, not in any option the owner read** (they approved 29 + the 3 motion) — disclosed, untick on request

next:
- [ ] #16-08 needs a committed pressable-path artifact to become tickable (#15-07/#17-09 make the same claim and already have one) — 1 box, cheapest remaining tick
- [ ] `docs/runbook.md:45-46,73-74` — Thai still in its own `Do:` blocks; agent-facing, owes English
- [ ] 4 ad-slot boxes (#15-09 #16-10 #17-11 #18-09) unblock **only** on a deploy + AdSense — checklist §2, then §4 for the domain
- [ ] #13 DoD4 real phone needs **§2 only** (a deploy) · #9 domain · Azure token (**only real CSP/AdSense proof**) — owner-gated, checklist §1/§2/§4
- [ ] [#24] one checkpoint slot site-wide — dormant until a 2nd game writes one (ADR-0008 flip-fact)
- [ ] ⚠ fork, REFUTE **and** my own doc all said `#17-13` for #17's ad-slot box; the TSV says **#17-11**. The artifact-derived write was right, the prose wrong — derive, never recall

inflight: measured at save — 3 commits on `main` (`e8d4183` work · save · this delta+ADR-0007) and **pushed** (authorized this turn) · open PRs: none · 8 subagents returned · GitHub writes: 4 issue bodies + 4 comments, executed with set-equality asserted before AND after each write (a count of 36 would have passed while ticking the wrong 36) · orchestrate ledger: session scratchpad, NOT committed — durable facts are in this entry + `dod-closeout-15-18.md`

### S2026-08-14#7

done: **all 41 unticked boxes on #15–#18 re-walked, record COMMITTED** `f1d67fa` (32 files, +1619/−20) → `docs/verification/` (4 reports · 21 text artifacts · README · red-green-non-vacuity) · tally **30 PROVEN · 0 FAILED · 8 UNPROVABLE · 3 UNDECIDED = 41**, counted from the files not from agent self-reports · lost "31" explained + png-drop + red-green-wording-false: **ADR-0009** · red-green proof: **3 NON-VACUOUS, 1 VACUOUS** · `package.json` +`test` = `ci.yml:40` verbatim · 2 merged branches deleted · `CONTEXT.md` +`คนที่ N` · `PlayerSetup.astro` +comment · `site-owner-checklist.md` §1/§2 unattended-runnable · `browser-verification.md` trap 3→4 (+the wipe trap, +per-set-member calibration) · **REFUTE ×1 → 6 CONFIRMED defects, all fixed**

dec: **ADR-0009** (new) · **ADR-0007** scored twice-over (its own scratchpad warning came true; belowMin now *provably unreachable*) · rewording the 4 red-green boxes is legitimate **only if visible + owner-approved**

next:
- [ ] ⚠ **SUPERSEDED — every item below was executed or retired by the next session** (`e8d4183`): 36 of 41 boxes ticked, 4 red-green boxes reworded with visible old→new comments, 3 UNDECIDED annotated N/A, checklist domain-join step added, `ci.yml` + `save-session.md` converted to English.
- [ ] ⚠ **AND the `dec:` above is FALSE where it says belowMin is "provably unreachable".** It is unreachable only from the zero-selected *branch*; it fires from `startBtn` whenever fewer names than `min` are ticked (`PlayerSetup.astro:225` → `player-select.ts:79`, observed firing in `tools-15-18/15.md:34`). The guard is load-bearing. The "dead guard → own issue" item was **retired, not done** — filing it would have invited deleting a live guard.
- [ ] tick **29 of 30** PROVEN on #15–#18 — **withhold #16-08** (pressable-path half has no committed artifact) · verify: ticked count == report PROVEN − 1 · **re-count the 41 against live issues first** — box-ID→checkbox-line mapping is unverified
- [ ] reword the 4 red-green boxes (#15-14 #16-13 #17-14 #18-12) to the non-vacuity invariant, visibly · **#15-14 stays un-tickable until 3 `() => 1` clamp tests exist** (wheel/draw/number) — that also closes the one VACUOUS finding
- [ ] owner call: 3 UNDECIDED (#16-11 #17-12 #18-10) are all "respects reduced motion" on tools with **no motion to suppress** — only the wheel animates, the four DoD lists were templated · mark N/A, or decide those tools were meant to animate
- [ ] `docs/site-owner-checklist.md` has **no step connecting `watduang.com` to the Static Web App** — owner can buy the domain + deploy and never join them
- [ ] `belowMin` unreachable = dead guard → own issue · **no test pins the `startBtn`/0-selected DOM branch** (only `numberedPlayers`/`resolveStart` unit-tested)
- [ ] `.github/workflows/ci.yml` — 22 Thai comment lines owed English; they carry the CSP-gate reasoning, convert carefully · `.claude/commands/save-session.md` still Thai
- [ ] #13 DoD4 real phone — now needs **§2 only** (a deploy), not the domain · #9 domain · Azure token (**only real CSP/AdSense proof**) — owner-gated, checklist §1/§2
- [ ] [#24] one checkpoint slot site-wide — dormant until a 2nd game writes one (ADR-0008 flip-fact)

inflight: measured at save — this save commits on `main` and **pushes** (authorized this turn) · open PRs: none (checked `gh pr list`) · no background tasks · all 5 ports released, verified `lsof -ti:4321,9222,9223,9224,9225` empty with a negative control · worktree removed, `git worktree list` = 1 · orchestrate ledger: session scratchpad, NOT committed (deliberate — its durable facts are in this entry + ADR-0009)

### S2026-08-14#6

done: **[#25] shipped `322423d`** (5 files, +321/−79, **63 → 72 tests**) — `ล้างกลุ่มนี้` asks before discarding a live round; new `planClear(checkpoint, confirmed)` takes **no `gameId` by design** (`clear()` is site-wide, so a game-matched test lets one game's page kill another's round) · **REFUTE ×2 caught 4 defects pre-commit**, all silent-loss family: stale armed question survived start/resume · focus sat on the destructive button (click fires on Enter *keydown*) · its own detector matched `session.clear()` inside a comment · the corrected comment+ADR then **overshot** ("the one door" — `เล่นอีกรอบ` mounts directly, `siamsi.ts:253`/`timebomb.ts:147`) · **docs `9ef6ec2`** — `runbook.md` Thai→English + per-set-member rule, 3 shell traps each reproduced live · `scripts/driver.mjs` promoted out of volatile tmp, `browser-verification.md` now matches what ships · **#15–#18 walked in a real browser: 23 PROVEN · 8 UNPROVEN · 0 FAILED** — evidence in scratchpad only, **GitHub untouched, ticking is the owner's**

dec: #25 = ADR-0008 pattern, condition `checkpoint !== null` **not** game-matched — ADR-0008 amended, both halves settled + new flip-fact · REFUTE cap 2 rounds held, no fork-return: every finding was a bug *in* the mechanism, never the mechanism

next:
- [ ] ⚠ **SUPERSEDED — do not act on the "23 PROVEN" figure above.** The G3 report it cited died with its scratchpad. All **41** unticked boxes on #15–#18 were re-walked in S2026-08-14#7; the record now lives **committed** at `docs/verification/tools-15-18/{15,16,17,18}.md` + `docs/verification/README.md`, evidence at `docs/verification/evidence/`. Real tally: **30 PROVEN · 0 FAILED · 8 UNPROVABLE · 3 UNDECIDED = 41**. The old "31 walked" is explained — #16+#17+#18 unticked = 11+11+9 = 31, so the prior session never walked #15; re-walking those same 31 yields **22** PROVEN, not 23. Ticking is still the owner's, and REFUTE withheld #16-08 (evidence gap) and requires a #22 scope note on #15-02/#16-06/#17-07
- [ ] `package.json` has **no `test` script** — every session re-derives `node --test 'src/**/*.test.mjs'` (glob **quoted**; `node --test <dir>` misreads dir as module path on node 22 → `ci.yml:38`) · 1 line, flagged twice
- [ ] `0 selected names` silently takes the numbered-mode fallback (#22) instead of the below-min refusal gate — found in browser, **not a bug**, nothing documents it
- [ ] `.claude/commands/save-session.md` is Thai and agent-facing → owed English at next touch (`docs/sessions-archive.md` never converts)
- [ ] #13 DoD4 real phone + #20 → steps in `docs/site-owner-checklist.md` · **closing DoD4 closes #13**
- [ ] #9 domain · Azure token (**only real CSP/AdSense proof**) — both owner-gated, checklist §1/§2
- [ ] [#24] one checkpoint slot site-wide — dormant until a 2nd game writes one; that is also ADR-0008's new flip-fact

inflight: measured at save — `9ef6ec2` on `fix/25-clear-guard`, this save commits on top, then merge → `main` + push both this turn · open PRs: none (checked `gh pr list`) · no background tasks · headless Chrome + `serve dist` torn down, verified via `lsof -ti:4321,9222` (empty) · G3 evidence + orchestrate ledger: session scratchpad, not committed

### S2026-08-14#5

done: **[#23] shipped `5aec128`** (12 files, +214/−47, **57 → 63 tests**) — the checkpoint now owns its roster, element-wise name gate gone; per-line mechanism in the commit body, DoD evidence in the [#23] comment · ADR-0008 two-button resume prompt · **REFUTE caught 1 real defect** — `#player-count` had no listener, so a stale roster started a 4-player round; fixed, proved both ways · `ci.yml` sitemap gate checked **1 of 4** tools, now all four calibrated per page · **[#22] closed** 5/5 · [#23] 6/6 ticked, **held open** on Thai copy · #15–#18 **13 of 59** ticked (31 UNPROVEN · 7 DEFER · 3 NEEDS-VIEWPORT) · new `docs/site-owner-checklist.md` · filed [#24] [#25]

dec: ADR-0008 (**scoped to round-start**; `ล้างกลุ่มนี้` mid-round = [#25]) · ADR-0007 scored — still untested, `.astro` wiring has no coverage and CI passes either way · #23 DoD box 3 unconstructible as written, body unedited + annotated

next:
- [ ] **Thai copy sign-off** — `ยังมีรอบที่เล่นค้างอยู่ จะกลับไปเล่นต่อ หรือเริ่มรอบใหม่กับวงที่เลือกไว้?` → then `gh issue close 23`; asked, unanswered
- [ ] [#25] `ล้างกลุ่มนี้` mid-round discards a live round, label names only the group — **live round-loss path**, 3 options in the ticket, owner picks
- [ ] [#24] one checkpoint slot site-wide — dormant until a 2nd game writes one; `game` tags, doesn't select
- [ ] #15–#18 **31 UNPROVEN** boxes — evidence-or-leave rule held, don't tick on inference
- [ ] #13 DoD4 real phone + #20 → steps in `docs/site-owner-checklist.md` · **closing DoD4 closes #13**
- [ ] #9 domain · Azure token (**only real CSP/AdSense proof**) — both owner-gated, checklist §1/§2
- [ ] promote scratchpad `driver.mjs` → `scripts/` — `scripts/cdp.mjs` can't do cross-page nav or console listeners, so `docs/agents/browser-verification.md` overstates the shipped instrument
- [ ] `docs/runbook.md` § "ตรวจงานให้เหมือน CI" — "calibrate both ways" is **insufficient**: a gate covering a SET needs calibrating per member (sitemap gate passed both ways on `wheel`, blind to 3 pages) · + 3 new zsh traps (unquoted flag glob · BSD `grep -E` has no PCRE lookahead · heredoc in `bash -c`) · **deferred:** file is Thai, convert-on-touch makes it a full-file conversion

inflight: measured at save — `5aec128` on `fix/23-checkpoint-identity`, this save commits on top, then merge → `main` + push both this turn · open PRs: none (checked `gh pr list`) · no background tasks · headless Chrome + `serve dist` torn down, verified stopped via `pgrep`+`lsof` (ports 4321/9222 free) · orchestrate ledger: session scratchpad, not committed

### S2026-08-14#4

done: **[#21][#22] + 2 unfiled data-loss paths shipped `697b131`** — `src/shell/player-select.ts` (new, pure `resolveStart`/`numberedPlayers`) + `player-select.test.mjs` · `PlayerSetup.astro` · 57 tests, build green · #21 over-max warns naming who sits out, **stored group stays the full ticked set** · #22 button `เริ่มแบบ "คนที่ 1, 2, 3…"` visible on first paint with group pre-ticked, never touches selected/group/session · **data-loss 1** `saveGroup([])` moved inside the `clearsSession` gate · **data-loss 2** untick-all path wiped the group — copy reworded + write guarded by `selected.size > 0` · `#start-numbered` hidden while a checkpoint exists on `setPlayers` pages (one tap orphaned a live siamsi round — reproduced, then fixed) · checkpoint-slot audit: **no collision possible**, all 4 tool modules are pure fns · filed [#23] · #15–#18 got 5 DoD ticks + evidence comments, **none closed** · new `scripts/cdp.mjs` + `docs/agents/browser-verification.md`

dec: ADR-0007 (ADR-0004's party-size rule constrains the SET a guard enumerates, not where it lives — extraction to a testable module is legal · ADR-0004 prediction scored: confirmed in substance, refuted in wording) · browser instrument = CDP device emulation, **never `--window-size`** → `docs/agents/browser-verification.md`

next:
- [ ] [#23] checkpoint identity — 4 symptoms, 1 cause (numbered rounds unresumable · hide-condition game-agnostic · re-ticking reorders the Set · "ล้างกลุ่มนี้" no-op on tool pages) · **do not spot-fix one** · first 2 DoD boxes reproduce headlessly via `scripts/cdp.mjs`
- [ ] #13 DoD item 4, real phone (site owner) — **closing it closes #13** · same pass: #20 siamsi mid-round → refresh → must restore
- [ ] #15–#18 still **5/59** DoD ticked — most of the rest are logic assertions CI likely already satisfies but nobody has confirmed
- [ ] #9 register `watduang.com` (site owner) · #19 blocked by it
- [ ] Azure SWA phase 2 — site owner sets `AZURE_STATIC_WEB_APPS_API_TOKEN` · done = Deploy no longer `skipped` · **the only thing that can prove CSP/AdSense for real**

inflight: measured at save — `697b131` committed, this save commits on top, both pushed this turn · working tree otherwise clean · open PRs: none (checked `gh pr list`) · no background tasks · headless Chrome + `serve dist` torn down and verified stopped

### S2026-08-14#3

done: **[#16][#17][#18] tools 2-4 shipped `94505f6`** — `/tool/draw/` `/tool/team/` `/tool/number/` · `src/tools/{draw,team,number}.ts` + tests · 47 tests · `EXPECTED_TOOL_SLUGS`=`"wheel draw team number"`, **calibrated both ways** (fires on a removed page, passes on a restored one) · `/tools/` lists all 4, "กำลังทำ" section deleted · **CI green `31774307651`, every gate incl. the 3 added in #15** (Deploy still skipped — no secret) · pre-merge REFUTE caught 2 blockers, both fixed before commit · comments → English per § Language · filed [#21][#22] as sub-issues of #14 · PartyPick confirmed

dec: ADR-0006 (PartyPick confirmed — closed, not merely unexamined) · ADR-0004 §เพิ่มตอนทำ#16-#18 (a party-size guard belongs to the page, not the logic module — it was enforced against the *remaining* pool and stranded the last name · `pickNumber` range now capped) · `docs/runbook.md` § ตรวจงานให้เหมือน CI (agent shell is zsh, CI is bash — wrap verification in `bash -c`)

next:
- [ ] #13 DoD item 4, real phone (site owner) — **closing it closes #13** · same pass: #20 siamsi mid-round → refresh → must restore · **and the 3 new tool pages — reduced-motion + 320px were asserted from markup, never seen in a browser**
- [ ] [#21][#22] `ready-for-agent`, sub-issues of #14 — `max`-side silent drop · discoverability of the "คนที่ 1, 2, 3…" mode · #21 carries the *rejected* fix (storing the clamped group) so nobody re-proposes it
- [ ] #9 register `watduang.com` (site owner) — `whois` free (checked 2026-08-14) · #19 blocked by it
- [ ] Azure SWA phase 2 — site owner sets `AZURE_STATIC_WEB_APPS_API_TOKEN` · done = Deploy no longer `skipped` in `gh run view` · **the only thing that can prove CSP/AdSense for real**

inflight: measured at save — working tree clean after this commit · open PRs: none (checked `gh pr list`) · no background tasks · `94505f6` pushed, this save commits on top

### S2026-08-14#2

done: **[#15] tool 1 shipped `24fe2c8`** — `/tool/wheel/` · `/tools/` · `src/tools/wheel.ts` + mutation-proven tests · shell shared with games · **fixed the CSP defect that silently blocked page JS, + 3 new gates in `ci.yml`** · 20 tests · `/tools/` no longer orphaned `0a485ee` · docs → pointers `bb9c1dc` · tracker: opened #19 #20 · #12 is no longer a gate · linked #14 #19 #20 under #1 · dep #19←#9 · **pushed, and CI went green on GitHub with all 3 new gates on their first real run** (`31763743017`, Deploy still skipped — no secret yet) · state moved out of `CLAUDE.md` into this file `2143101` · language policy `d3279d4` · `CLAUDE.md` converted to English this save

dec: ADR-0005 (page JS must never inline) · ADR-0004 §added-during-#15 (indirect session access · remembered group · absence baseline) · **the real gate is now ticket #19, not #12** (ADR-0003) · state home = this file, which **overrides master save-session** — reason recorded in `.claude/commands/save-session.md`, do not move it back without reading that · language = write English, ship Thai (`CLAUDE.md` § Language); Thai docs convert on touch, `docs/sessions-archive.md` never

next:
- [ ] **[#16][#17][#18] can run in parallel now** — frame is reusable per ADR-0004 · add the slug to `EXPECTED_TOOL_SLUGS` in `ci.yml` · done = build + `node --test` green, and the absence gate goes red when the page is `mv`d away
- [ ] #13 DoD item 4, real phone (site owner) — **closing it closes #13** · same session, also check #20: siamsi mid-round → refresh → must restore the round
- [ ] #9 register `watduang.com` (site owner) — `whois` still free (checked 2026-08-14) · #19 is blocked by it
- [ ] Azure SWA phase 2 — site owner sets secret `AZURE_STATIC_WEB_APPS_API_TOKEN` · done = Deploy no longer shows skipped in `gh run view` · **the only thing that can prove CSP/AdSense for real**
- [ ] 2 REFUTE findings still unfiled (awaiting permission) — both written up in ADR-0004 §added-during-#15: silent drop on the `max` side · discoverability of the "คนที่ 1..N" mode
- [ ] confirm or change PartyPick

inflight: tree clean · no open PRs (checked) · no background tasks · pushed this round


### S2026-08-13#7

done: **เกม 2 `siamsi` ลง CI เขียว 11 step** `aa5a251` · การ์ดแชร์ `/` `/games/` `/404` `d254a8d` · siamsi กู้รอบค้างตอนรีเฟรช `e3fd74f` · 14 tests · **grilling รอบใหญ่ → `CONTEXT.md` + ADR 0001-0004 + spec [#14] แตกเป็นตั๋ว [#15] → [#16][#17][#18]**

dec: why อยู่ใน `docs/adr/` — 0001 หมวด · 0002 siamsi=เกม 8 · 0004 เครื่องมือ 4 ตัว `/tool/<slug>` ต้องใช้ roster ร่วม · **0003 คือเกณฑ์ที่ยังมีชีวิต: organic clicks <300/เดือน ที่เดือน 6 นับจาก tool+3 เกมขึ้น prod → ไม่ถึง = ดัน `/en/`**

⚠ ก่อนสร้างรูป OG · รัน build · หรือยื่นตัวเลือกให้เจ้าของเว็บตัดสิน → อ่าน `docs/runbook.md` ก่อน

next:
- [ ] **[#15] วงล้อสุ่ม + โครงหน้าเครื่องมือ — เริ่มได้เลย** จบแล้วปลด [#16][#17][#18] ทำขนานได้
- [ ] DoD #13 ข้อ 4 มือถือจริง (เจ้าของเว็บ) — **ปิดข้อนี้ = ปิดใบ #13** · เช็คสายไฟ checkpoint ของ siamsi ไปด้วย (เทสคลุมไม่ถึง)
- [ ] #9 จด `watduang.com` (เจ้าของเว็บ) — `whois` ยังว่าง
- [ ] Azure SWA เฟส 2 — เจ้าของเว็บตั้ง secret `AZURE_STATIC_WEB_APPS_API_TOKEN` · Deploy ต้องไม่ขึ้น skipped ใน `gh run view` · **ด่านเดียวที่พิสูจน์ CSP/AdSense**
- [ ] GitHub ค้างรออนุญาต: ผูก #14 เข้า #1 · แก้ #12 ให้เลิกอ้างเป็น gate (ADR-0003) · เปิดใบ gate ใหม่ · เปิดใบให้ `siamsi`
- [ ] ยืนยัน/เปลี่ยน PartyPick

inflight: tree สะอาด · push ครบถึง `origin/main` · ไม่มี PR เปิด (เช็คแล้ว) · ไม่มี bg task

### S2026-08-13#5

done: scaffold #13 → `02708ed` push แล้ว · **CI เขียวครบรอบแรก** deploy skip ถูกเพราะยังไม่มี secret · **DoD #13 ข้อ 1-3 ปิด เหลือข้อ 4** · REFUTE 1 รอบ 6 findings แก้ครบ · map #1 ลิงก์ตาย 14 → 0 · **ผลรันจริง + แก้มติ 9 ข้อ + ของที่รู้แต่ยังไม่แก้ →** [#13 comment](https://github.com/warischa/watduang/issues/13#issuecomment-5278598792)

dec: why ทุกข้ออยู่ในคอมเมนต์นั้น — `build.format=directory` + `trailingSlash=always` · manifest static import ตอน build ส่วน island รับ `id` ผ่าน `data-game-id` แล้ว `import.meta.glob` · CSP header-only และไฟล์ต้องอยู่ `public/staticwebapp.config.json` (ที่รากไม่ถึง prod) · pin wildcard Google ไม่ไล่ exact host · `script-src` ไม่มี `unsafe-inline` → snippet AdSense ต้อง external · `ads===false` บังคับ · field ใหม่ `tagline` · ไม่อัป astro แม้ audit เตือน

⚠ รูป OG อย่าใช้ Pillow — เครื่องนี้ไม่มี libraqm สระไทยกลายเป็นวงกลมจุดทั้งที่ draw สำเร็จ → `node scripts/make-og.mjs <id>` แล้วเปิดดูด้วยตา

next:
- [ ] DoD #13 ข้อ 4 มือถือจริง (เจ้าของเว็บ) — จอไม่ดับ + เสียงออก iOS · **ปิดข้อนี้ = ปิดใบ #13**
- [ ] #12 Keyword Planner **= gate เกม 2–7** (เจ้าของเว็บ)
- [ ] #9 จด `watduang.com` (เจ้าของเว็บ) — `whois` ขึ้นเจ้าของ
- [ ] ยืนยัน/เปลี่ยน PartyPick — ตัด "รอยืนยัน" ออก
- [ ] Azure SWA เฟส 2 deploy จริง (**ยืนยันก่อน**) — หลัง CI เขียว

inflight: tree สะอาด · push ครบถึง `origin/main` · ไม่มี PR เปิด (เช็คแล้ว) · ไม่มี bg task

### S2026-08-13#3

done: สำเนา `.scratch/` issues+map ลบแล้ว (sync body #8 ขึ้น GitHub ก่อน — answer เดิมอยู่แค่ใน comment) · docs repoint → GitHub · adversarial review = Codex `gpt-5.6-sol` xhigh 12 findings + reconcile → บันทึกครบใน comment: [#1](https://github.com/warischa/watduang/issues/1#issuecomment-5277741890) (full+verdict) #6 #8 #10 #12 + map Decisions-so-far · scaffold spec เต็ม → [#13](https://github.com/warischa/watduang/issues/13) (ticket 12 · sub-issue ของ #1 · ready-for-agent · DoD 4 ข้อ)

dec: **Pause เกม 2–7 + เนื้อหา ~230 ข้อ จนกว่า #12 ตอบ go/no-go** · scaffold+เกม 1 เดินได้ทุกกรณี · ads แก้มติ (แทน "sticky ปิด 2 จังหวะ"): **ห้ามโฆษณาบนจอเล่นทั้งหมด** inventory=hub/กติกา/post-game · จอง slot กัน CLS · สมัคร AdSense หลังมี prose · PDPA เริ่ม NPA → #8 · state แก้มติ (แทน "roster เท่านั้น"): roster (persistent) + session (transient มี expiry) · lifecycle contract · content stable ID · CI validate ต่อเกม · ระเบิดเวลา physics · OG field → #6 · 32/1 ยังไม่ปิด → #10

next:
- [ ] #12 Keyword Planner **= gate** (เจ้าของเว็บ ต้อง Google Ads) — worksheet ตามสเปกใน comment มี volume จริง
- [ ] #9 จด `watduang.com` (เจ้าของเว็บ) — `whois` ขึ้นเจ้าของ
- [ ] scaffold ตามสเปกเต็มใน [#13](https://github.com/warischa/watduang/issues/13) (โครง+contract+CI+เกม 1 — ครบ ไม่ต้องรื้อ) — DoD 4 ข้อในใบนั้น
- [ ] ตัดสิน #10: ทนายรีวิวหน้า "ใครแพ้หมดแก้ว" vs ตัด angle ทิ้ง (เจ้าของเว็บ)
- [ ] ยืนยัน/เปลี่ยน PartyPick — ตัด "รอยืนยัน" ออกจากบรรทัดแบรนด์
- [ ] map #1 Decisions-so-far ลิงก์ relative ชี้ `issues/*.md` ที่ลบแล้ว — กวาดเป็นเลข issue

inflight: tree สะอาด · push ครบถึง origin/main (เช็คแล้ว) · ไม่มี PR เปิด (เช็คแล้ว) · ไม่มี bg task (Codex jobs จบแล้ว)

### S2026-08-13#1

done: `.scratch/free-game/` +map +11 ใบ +research 3 ฉบับ +prototype ของทิ้ง · `CLAUDE.md` `docs/agents/` +สร้าง · repo `warischa/watduang` +init +private +push · GitHub +map#1 +sub-issue 11 +label 10 +native deps · ปิดไป 9/11

dec: เหตุผล → issues #2–#12 · สรุปย่อ → #1 Decisions-so-far · ที่เหลืออยู่นอกไฟล์นี้: domain=`watduang.com` **ยังไม่จด** · en=PartyPick *รอยืนยัน* · roster=localStorage เท่านั้น ไม่มีคะแนนข้ามเกม · Azure sub=`edad4930-c46c-4c78-9362-c75e71a91a35` region=`southeastasia` plan=**Standard** · เกม 7 ตัว เรียงตามสิ่งที่แต่ละตัวพิสูจน์ ตัวแรก=ระเบิดเวลา · ads=วางเองล้วน **ไม่ใช้ Auto ads** · sticky ปิดบนหน้าส่งมือถือและจังหวะเฉลย

next:
- [ ] scaffold Astro + เกม 1 ระเบิดเวลา — `npx serve dist/` เสิร์ฟ `/game/timebomb` เป็น HTML ของตัวเอง
- [ ] [#9](https://github.com/warischa/watduang/issues/9) จด `watduang.com` — `whois` ขึ้นเจ้าของ
- [ ] [#12](https://github.com/warischa/watduang/issues/12) Keyword Planner — `research/keyword-planner.md` มี volume จริง
- [ ] ยืนยันหรือเปลี่ยน PartyPick — บรรทัดแบรนด์ข้างบนตัดคำว่า "รอยืนยัน" ออก

inflight: working tree สะอาด · ไม่มี PR เปิด (เช็คแล้ว) · ไม่มี bg task (เช็คแล้ว) · GitHub เปิดค้าง #9 #12
