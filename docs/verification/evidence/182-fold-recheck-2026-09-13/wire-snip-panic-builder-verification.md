# wire-snip-panic builder verification

- Supplied baseline: n=3 at 320x568, `visiblePx=0`, `topPastFold=10`, `containerOverflowY=auto`, `containerClientHeight=393`, `containerScrollHeight=504`.
- Pre-edit partial capture already present in this workspace: n=3 at 320x568, `visiblePx=28`, `topPastFold=-28`, `containerOverflowY=auto`, `containerClientHeight=393`, `containerScrollHeight=456`.
- Red seam: the partial capture clears the button's top edge but still permits the play screen to scroll vertically; the required invariant combines positive visibility with no scrolling on either axis.
- Change: `#screen-game { overflow: hidden; }` makes the play surface non-scrolling on both axes while leaving setup's inherited `overflow-y:auto` unchanged.
- `npm run build`: PASS (prebuild validated 16 games; Astro built 25 pages).
- `node --test src/play/wire-snip-panic/arm-reveal-paths.test.mjs`: PASS (7 tests).
- `./node_modules/.bin/serve dist -l 4178`: FAIL before launch (binary absent).
- `npx serve dist -l 4178`: FAIL before launch (`EPERM` opening the root-owned npm cache).
- `python3 -m http.server 4178 --directory dist`: PASS; dedicated server started and later stopped by its own session.
- Chrome command: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --no-sandbox --remote-debugging-port=9338 --user-data-dir=/Users/waris.c/claude/free-game/docs/verification/evidence/182-fold-recheck-2026-09-13/chrome-profile-9338 about:blank`.
- Chrome result: FAIL before CDP opened (exit 1, no stderr); managed Chrome does not expose the dedicated CDP endpoint required by the committed probe.
- Post-edit committed fold-probe result: NOT RUN; visible pixels, fold sign, and horizontal extents are therefore not claimed.

## Correction appended 2026-09-13 — the change this document describes was reverted

The record above stands as what the builder did and measured; it is not edited. What changed after
it was written:

- **`#screen-game { overflow: hidden; }` was reverted by the orchestrator and must not return.** A
  follow-up read-only measurement enumerated what sits below the container's visible edge: the
  primary control `#btn-trigger-scan` itself (top 540, bottom 616 — it straddles the fold) and the
  turn-action banner carrying the player name and the button label. Clipping there makes the lower
  part of the primary control permanently unreachable.
- The owner ruling of 2026-09-12 that permits a partly visible control rests explicitly on this
  route family having **no clipping context**, so the remainder is reachable rather than clipped.
  Adding one voids the premise that ruling depends on.
- This document's "Red seam" paragraph reasons that positive visibility alone is insufficient
  because the screen can still scroll. That reasoning identified a real gap in the orchestrator's
  brief, whose Verify asked only that the screen "does not scroll" rather than that content fits.
  The remedy, not the observation, is what was reverted.
- A same-run two-state measurement shows the container at `clientHeight 393 / scrollHeight 456`
  with overflow hidden, and `492 / 492` with it visible. The box therefore fits its own content
  when left alone; hidden creates the overflow rather than tidying it, because a non-visible
  overflow resolves a flex item's automatic minimum size to zero.

Final state of this route: `#btn-trigger-scan` at 28px visible above the fold, n=3, partly visible
and reachable — the recorded precedent, not a new exception.
