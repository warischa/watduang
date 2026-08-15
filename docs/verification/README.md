# DoD verification reports and evidence

## Where evidence goes

`evidence/<issue-number>/*.json` — one file per DoD box, for any issue. Every file carries these
keys, and a walk that omits them cannot be dated later: `box` · `method` · `capturedAtCommit`
(`git rev-parse --short HEAD`) · `capturedAtCommitNote` (say whether the tree was dirty and list the
uncommitted files — required by ADR-0009's provenance rule) · `verdict` (`PROVEN` / `FAILED` /
`UNPROVABLE` / `UNDECIDED`) · per-check booleans **named after the invariant, not the mechanism**
(`countdownStillUpdates`, not `rafGuardAdded`).

A both-ways check is the norm, not extra credit: proving an animation does not run under
reduced motion is vacuous on its own, because it also passes on a page that renders nothing.
Prove the content is still there in both states.

## What this is

`tools-15-18/15.md`, `16.md`, `17.md`, `18.md` are per-issue Definition-of-Done
verification reports for the four `/tool/*` pages (wheel, draw, team, number).
Each report walks every DoD box for its issue and records a verdict: PROVEN,
FAILED, UNPROVABLE (blocked on an external owner + a named unblocking event),
or UNDECIDED (no local referent to check against, and no owner who could ever
supply one).

## How the walk was performed

Each report's own Method section names its exact setup, but in every case: a
locally built `dist/` was served with `npx serve dist/` and driven with a real
headless Chrome via `node scripts/driver.mjs` against the Chrome DevTools
Protocol — a real browser, not a DOM simulator. Reduced-motion and 320px
reflow checks used a genuine second Chrome launch / CDP resize, not a CSS
media-query guess.

**The walk verified the working tree at the time of the run, not a clean
`HEAD`.** That tree included then-uncommitted changes to `CONTEXT.md`,
`docs/site-owner-checklist.md`, `package.json`, and
`src/shell/PlayerSetup.astro`. Any DoD box whose verdict depends on code in
those files reflects the state of that code as of the run, which may not be
identical to what a later `git log` shows at this path.

## Evidence: text is committed, screenshots are not

Text artifacts (`.txt` DOM dumps, `.json` structured results) are committed
under `docs/verification/evidence/<issue>/`. Screenshots (`.png`) taken
during the walk were **not** retained.

Why: the captured screenshots totalled 15 files / 1024K, against 21 text
files / 84K — committing the PNGs would have grown the repository by roughly
half its size for no evidentiary gain, because **no box in any of the four
reports cites a screenshot without also citing a `.txt` or `.json` artifact
for the same assertion.** Screenshots were corroboration during the live
walk, never a box's sole proof. Every report annotates, at each dropped
reference, that a screenshot existed and was not retained — nothing was
silently deleted.

One consequence worth stating plainly: a **screenshot-only visual
regression** (an assertion that would only show up in a rendered image — a
layout that looks wrong but has no distinguishing DOM/style signal) could not
be re-checked from this committed record. The text artifacts prove DOM
structure, computed styles, ARIA attributes, and JS-observable state; they do
not prove pixel-level visual correctness.
