# Proposed ticket criteria — awaiting the owner's wording (UNREVIEWED)

> **⚠ UNREVIEWED — agent-drafted candidate wording. Nothing here has owner sign-off, and nothing
> here has been posted to any ticket.** Each item names the owner ruling that set its direction and
> the artifact that proves its premise. Edit in place; this file is deleted once the wordings land
> on their tickets.

Drafted 2026-09-18 on the owner's instruction to draft-then-show. Applying any of these means
editing an issue body, which sits outside the SH pre-authorisation.

---

## 1. gh#181 box 2 — restate against the 2026-09-10 rule

**Direction** — owner chose "restate against the 2026-09-10 rule" over striking it, 2026-09-18.
**Premise** — gh#181's last comment (2026-09-17) measured both routes and found the criterion
superseded: `cursed-number` 75.6% and `zero-trigger` 87% width-fill at 320x568, both pinned in
`KNOWN_OVERFLOW` by owner rulings of 2026-09-01 and 2026-09-15, and the binding requirement is
reachability, not fit. The rule is recorded in
`docs/verification/evidence/182-320-fold-fix/README.md`.

**Current**

> - [ ] `zero-trigger` and `cursed-number` also fill the width at 320px

**Proposed**

> - [ ] `zero-trigger` and `cursed-number` meet the 2026-09-10 rule at 320px — the primary control
>   is reachable above the fold — which replaces this box's original width-fill wording. Both
>   routes' 320px overflow is accepted by owner ruling and pinned in `KNOWN_OVERFLOW`, so filling
>   the width is not what is owed here. Rule recorded in
>   `docs/verification/evidence/182-320-fold-fix/README.md`; the 2026-09-17 readings are in
>   `docs/verification/evidence/181-320px-2026-09-17/measurement.txt`.

---

## 2. gh#181 box 7 — cite what a clone can open, and settle the route count

**Direction** — owner ruling 2026-09-17: *a verdict row must cite what a clone can open; an image is
illustration, never the artifact.* Only the wording was left open.

**⚠ This box has a second defect the ticket did not ask about, and a reword that fixes only the
screenshots clause would ship a criterion a tracked doc already calls wrong.**
`docs/verification/evidence/181/README.md` § "Route set" says so in its own words: *"the restated box 7
still says 'all four routes', carried over from the ticket's title. The 2026-09-05 ruling says eight.
Eight were measured. The owner is asked to state 'eight' once."* That request has been sitting
unanswered since 2026-09-08.

**The two sets are not the same four-of-eight — they overlap by two.** Verified by reading both
artifacts directly:

| set | routes | source |
|---|---|---|
| the title's four | `how-close-is-near`, `zero-trigger`, `cursed-number`, `cannon-flag` | gh#181 body, the 2026-08-31 table |
| the measured eight | `cannon-flag`, `dice-loser`, `freeze-tap`, `pinocchio-luck`, `power-meter`, `short-stick`, `timebomb`, `zero-trigger` | `frame-screen-readings.json`, eight `route` keys |

So `how-close-is-near` and `cursed-number` are in the title's four and were **never** measured by
this instrument, and six of the eight are outside the title.

**The "2026-09-05 ruling" is cited here from `evidence/181/README.md`, an agent-written doc — it has
not been read back from the owner's own comment.** So the draft below is written as eight on that
unverified premise, and confirming the premise is part of the decision, not settled before it. If
the answer is four, the readings file covers only two of them and box 7 cannot close on it.

**Current**

> - [ ] Screenshots at 1440×900 exist for all four routes, and each carries a per-route agent
>   verdict against the standard recorded in `docs/agents/desktop-sizing-decisions.md`, per the
>   2026-09-06 delegation

**Proposed**

> - [ ] Each of the eight routes named in `docs/verification/evidence/181/README.md` § Route set —
>   the set the 2026-09-05 ruling covers and the instrument measured — carries a per-route agent
>   verdict at 1440×900 against the standard in `docs/agents/desktop-sizing-decisions.md`, per the
>   2026-09-06 delegation. Each verdict cites artifacts a fresh clone can open:
>   `frame-screen-readings.json` for the frame and screen reads, with `README.md`,
>   `refresh-2026-09-15.md` and `disclosures.md` alongside, all under
>   `docs/verification/evidence/181/`. The 1440×900 PNGs are excluded by `.gitignore:12` by design
>   and are illustration, not the artifact (owner ruling 2026-09-17); they remain the working
>   material for box 8's own look.

Box 8 is untouched by this and stays ticked — the owner's 2026-09-16 look was made on those images,
and nothing here re-opens it.

---

## 3. gh#101 criterion 2 — by construction, never a threshold

**Direction** — owner ruling 2026-09-18, recorded on gh#101: the restatement must say "above the
reader's own age by construction", never name a threshold.
**Premise** — the current wording is undefined at the exact case it nominates as its proof. It says
"above the top of the age band the reader chose — proven at the oldest band", and the oldest band is
`50 ขึ้นไป`, which is open and has no top for a band-based rule to reference. Same ruling fixed the
open band's answer to the relative form `อีกประมาณ N ปีจากนี้`.

**Current**

> - [ ] The meeting age is always above the top of the age band the reader chose — proven at the
>   oldest band, where a naive draw would predict the past

**Proposed**

> - [ ] The meeting age is above the reader's own age **by construction** — the draw cannot produce
>   a lower one, rather than a threshold the code checks afterwards — and this is proven at
>   `50 ขึ้นไป`, the open band that has no top for a band-based rule to use, where the answer takes
>   the relative form `อีกประมาณ N ปีจากนี้`

---

## What is still owed after these land

- The "eight, not four" statement on gh#181 — asked for on 2026-09-08, still unanswered; item 2
  above is the first draft that states it outright.
- Whether gh#181's title and § What to build are restated too, since both still say four.
