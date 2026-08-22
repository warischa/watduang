# Interpreting a browser capture

Moved out of `browser-verification.md` to stay under the house doc budget. Read this once you already
have something in hand — a probe's JSON, a screenshot, a built HTML file — and are judging whether it
means what it looks like it means. For getting a probe to produce that output in the first place
(Chrome setup, `cdp.mjs`/`driver.mjs`, and the traps that fire while doing so), see
[browser-verification.md](./browser-verification.md).

## Traps that fire while interpreting what you captured

Each of these passed a plausible-looking check while measuring nothing.

**2. Calibrate the DETECTOR, not just the feature.** A probe using `#draw-go`'s visibility to mean
"the round started" was **true before a single name was typed** — always-true, measuring nothing, and
it nearly produced a false bug report against working code. Before trusting any boolean probe,
evaluate it at a moment when it MUST be false. On these pages the valid signal is
`!document.querySelector('#start-round')?.offsetParent` — the setup panel hides when a round starts.

When the claim covers a SET, calibrate per member. S2026-08-14#7 proved "refuses below the minimum"
against **1 ticked name** and called it done — but "fewer than 2" has another member, **0 ticked
names**, and that one does not refuse at all: it substitutes a generated `คนที่ N` set and starts —
see `CONTEXT.md`'s "numbered-players group" entry. One member passing is not the set passing, and a
pre-merge review caught it on three separate boxes.

**6. `elementFromPoint` only sees the viewport, not the document.** It resolves a point in client
coordinates against what is painted right now, so anything below `CDP_HEIGHT` returns `null` —
including the site-wide footer in `Base.astro`, which is below the fold on every page by design. A
reachability check written without a scroll reports `null` for a perfectly reachable link, and both
obvious readings of that `null` are wrong: it does not mean overlapped, and dropping the check
because it "doesn't work" removes the only thing proving the link is clickable. Call
`el.scrollIntoView()` first, then read the point. Hit on the `8d84b19` footer walk — `/game/timebomb/`'s
footer centre sat at y=595 in a 568px viewport. Note the asymmetry: `getBoundingClientRect()`'s
horizontal fields are scroll-independent, so a `right <= 320` overflow assertion stays valid without
scrolling; it is only the point-hit test that needs it. Generalises: a probe that reads *painted*
state is scoped to the viewport, one that reads *layout* state is not — never assume a failing
probe and a failing page are the same thing.

**7. `grep -c` counts matching *lines*, not matches.** `grep -c '<script'` on
`dist/game/timebomb/index.html` reports `1`. The page carries **3** `<script>` tags — they share a
line. An ADR-0005 check written that way therefore stays at `1` when a new inline script lands on an
existing line, which is exactly how a bundler emits one. Count matches and then filter to what
ADR-0005 actually gates: `grep -o '<script' | wc -l` for the true tag count, then keep only the
`src`-less tags (the JSON-LD block is exempt per `docs/adr/0005:27`). On `1679a69` that gives
tags=3, src-less=1 on a game page and tags=1, src-less=0 on `/tool/number/`. Hit on the #35
sibling-nav review, where the DoD box asked only that the count "has not grown" — it had not, and
the number was wrong the whole time, so the box would have passed either way. CI's CSP
inline-script gate is the real check; this grep is a convenience that reads like a proof.
Generalises: a detector that cannot distinguish "one match" from "several matches on one line" is
not measuring the thing its name claims, and a check whose pass condition is "unchanged" inherits
every blind spot of the thing it counts.
