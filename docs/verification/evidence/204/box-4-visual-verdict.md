# gh#204 box 4 — visual verdict on the บางกอกดริฟต์ mockup art

Box 4 reads: "The car is a red sports car with no badge, name or logo; the horizon carries a Bangkok
skyline silhouette; sliding shows skid feedback". This is a look-and-record box, so the record is a
stated verdict against named artifacts, not a measurement.

Judged 2026-09-08 by opening both screenshots directly. The screenshots live in the owner's mockup
directory outside this repo and are not tracked here; they are named below so a later reader can
re-open the same two files.

## Freshness — checked first, because a verdict on stale art is worthless

`stat` on the owner's mockup directory:

| file | modified |
|---|---|
| `index.html` | 2026-09-06 10:49 |
| `screenshots/drive-four-kinds.png` | 2026-09-06 10:51 |
| `screenshots/drive-skid.png` | 2026-09-06 10:51 |

Both captures are two minutes **newer** than the mockup source they depict, so they show the current
art. Nothing has touched `index.html` since.

## Verdict per clause

**Red sports car with no badge, name or logo — SATISFIED.** Both frames show a low, wide red car
drawn from behind. There is no badge, no marque text, no wordmark and no brand cue of any kind on the
body, and no logo anywhere else in either frame. This clause is also the site's no-brands content
rule, so it was checked as a rule and not only as an aesthetic.

**Bangkok skyline silhouette on the horizon — SATISFIED.** Both frames carry a dense skyline drawn as
a flat dark silhouette against a night sky, sitting on the horizon line above the road. A teal-green
haze band separates the skyline from the road surface, which is the distance fog the owner's visual
scope asks for.

**Sliding shows skid feedback — SATISFIED.** `drive-skid.png` shows the car visibly rotated out of
axis, and a dark streak trailing away from it across the road surface. Both cues are present in the
same frame: the tilt and the mark. The owner's visual scope allows either, and this frame has both.

Supporting HUD detail, unasked but worth recording: both frames render Thai UI text
("ผู้เล่น 1", "ม.", "กม./ชม.", "แตะซ้าย", "แตะขวา") with no mojibake and no dotted-circle breakage.

## A residual this box does not own, but that the record should carry

`drive-four-kinds.png` is named for four obstacle kinds and shows **one** legible obstacle — a single
orange cone in the near lane — plus one small indistinct dark shape near the horizon. So that
screenshot does not visually demonstrate four distinct sprites.

Box 2 asks that "four obstacle kinds appear on a generated road, each drawn distinctly". That box is
satisfied at the code level and was verified as such: the mockup's obstacle table declares `rock`,
`cone`, `puddle` and `banana`, and its `SPRITES` map binds each id to its own draw function, so four
distinct drawing routines exist. What is missing is a capture that actually shows all four at once.

Recorded as a residual rather than a failure, because box 2's own wording was met by the code and no
box asks for a four-sprite capture. A future pass that wants the visual half should generate a frame
with one obstacle of each kind on screen together.

## Checked in passing: the shipped route has not drifted from the mockup on this table

The obstacle table in `src/play/bangkok-drift/main.js` matches the mockup's entry for entry — same
four ids, same Thai labels, same `lethal`, `kick`, `slide` and `drift` values, and the same
explanatory comment. So the art and rules the verdict above describes are the ones that ship.

## What this does not cover

- Motion. Both artifacts are still frames; nothing here speaks to frame rate, animation smoothness,
  or how the skid reads while actually sliding. gh#204 box 7 owns the frame rate and needs the
  owner's phone.
- The four-sprite visual, per the residual above.
- Readability outdoors or at arm's length, which gh#141 reserves for a real hand.
- Colour accuracy on real hardware. These were judged as rendered PNGs on a desktop display.
