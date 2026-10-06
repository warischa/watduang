# gh#263 item 1: every under-44 touch target on the audited page set

Measured 2026-10-06 on the built site at HEAD `b8d3bcc` (full `b8d3bccf06854fd47b7ac461ce26debad156ca69`).
The working tree carried uncommitted edits under `design/` and an untracked `docs/verification/evidence/gh263-canvas/`;
neither feeds the Astro build. `dist/` came from `npm run build` (26 pages, finished 2026-10-06 16:08:04 local).
Served with `npx serve dist/ -l 4461`; headless Chrome 154 over CDP port 9361 with its own user-data-dir.
320 is mobile emulation (`setWidth(320, 640, true)`), 1440 is desktop (`setWidth(1440, 900, false)`); never `--window-size`.

## Files

| file | what |
|---|---|
| `ui-under44-probe.mjs` | the probe: emits every under-44 row with raw and effective boxes |
| `under44-320.json`, `under44-1440.json` | raw probe output, one entry per page; the rows are `under44Rows` |
| `control.json` | per page x width comparison against the unmodified gh#262 probe, plus comparator must-red |
| `groups.md` | grouped table per width, with totals and a per-component roll-up |
| `derive.mjs` | builds `control.json` and `groups.md` from the two JSONs and the old probe's raw output (`OLD_DIR`) |

## Result

| width | rows | groups | underByEffective |
|---|---|---|---|
| 320 | 155 | 16 | 151 |
| 1440 | 123 | 14 | 119 |

Totals equal the sum of the per-page list lengths (printed under each table in `groups.md`; `derive.mjs` throws if the
groups do not partition the rows). 320 minus 1440 is 4 rows on each of the 8 chrome pages (the topbar pills and the brand
link are under 44 at 320 only); 0 on `/game/siamsi/`, `/game/daily-fortune/`, `/game/love-match/`.

## What the predicate selects (unchanged from the gh#262 probe)

`document.querySelectorAll('a, button, input, select, summary')`, kept when `visible`: bounding rect width and height
above 0, computed `visibility` not `hidden`, `display` not `none`, `opacity` above 0. A target is under 44 when its
rounded rect width OR height is below 44. Consequences, so a count is not read as more than it is:

- Only those five tags. `[role=button]`, `[tabindex]`, `label`, `[onclick]` elements that are not one of them are not counted.
- Opacity-0 or zero-size controls (a visually hidden native input behind a custom control) are not counted.
- No viewport filter: off-screen targets count. State is page load only; nothing is clicked, so modals, result panels and
  post-start screens are not measured.
- The probe measures the element's own box. It does not measure overlap or spacing between neighbours.

## Columns added by this probe

- `w`, `h`: raw rounded rect (the old probe's fields).
- `effW`, `effH`, `effVia`: effective box. For an `input`, the rect of `closest('label')` (`effVia` = `wrapping-label`),
  else of `el.labels[0]` (`label-for`). Every other tag: equal to `w`/`h`, `effVia` null. `effDisplay` is the label's display.
- `underByEffective`: `effW < 44 || effH < 44`. No row is dropped for its effective size; the owner decides.
- `display`: computed display of the target.
- `component`: the nearest ANCESTOR (never the target) that has an id or a non-astro class, written `tag#id` or
  `tag.firstclass`. Unclassed `li`/`ul`/`p` wrappers are skipped, so a bare `a` in a list resolves to its `nav.*-next` block.
  Astro scoping here is a `data-astro-cid-*` attribute, not a class, so it names nothing. Known artefact: the brand link
  resolves to `div.chrome-inner`, not the `header` above it, because the div is the nearer classed ancestor.
- `region`: the nearest `header, nav, main, footer, aside, section` ancestor, same naming.
- Group key in `groups.md`: viewport x component x target (tag + own classes) x raw h x effective h; w is a range.
  `button.sm-chip` and `button.sm-chip.sm-chip--on` are separate rows in the table, one component in the roll-up.

## Calibration

In the same Chrome session, on the same `dist/`, the unmodified gh#262 probe ran at both widths (by path, not edited;
sha256 prefix `441d4d4777945228`; `git status` on its directory is clean). For each of the 22 page x width cells
`control.json` requires all of: old `under44` equals the new list length; the new probe's own `under44` equals it;
old `under44Sample` deep-equals the first 8 new rows projected to `{el, w, h}`; and equals the new probe's own sample.
Result: 22 of 22 true. The comparator must-red, on `/tool/wheel/` at 320: dropping a row, adding 1 to a row's height,
and swapping two rows each turn the cell false, while the unmodified cell stays true.

## Not covered

The probe's default page list is 11 pages: `/`, `/tools/`, `/tool/wheel/`, `/tool/draw/`, `/tool/team/`,
`/tool/number/`, `/c/fortune/`, `/game/siamsi/`, `/game/daily-fortune/`, `/game/love-match/`, `/404.html`. Not measured:

- `/c/party/`
- the 14 play routes, `/game/<id>/play/` for bangkok-drift, cannon-flag, croc-bite, cursed-number, dice-loser,
  freeze-tap, how-close-is-near, one-bomb, pinocchio-luck, power-meter, short-stick, timebomb, wire-snip-panic, zero-trigger
- `/en/`: absent from `dist/` at this HEAD
- any state past page load (an open modal, a started round, a spun wheel)

## Regenerate

```
npm run build && npx serve dist/ -l 4461
BASE=http://localhost:4461 CDP_PORT=9361 W=320  node scripts/driver.mjs docs/verification/evidence/gh263-under44/ui-under44-probe.mjs
BASE=http://localhost:4461 CDP_PORT=9361 W=1440 node scripts/driver.mjs docs/verification/evidence/gh263-under44/ui-under44-probe.mjs
```

Same for the old probe, with its output saved as `old-320.json` and `old-1440.json` in a scratch directory, then
`OLD_DIR=<scratch> node docs/verification/evidence/gh263-under44/derive.mjs`.
