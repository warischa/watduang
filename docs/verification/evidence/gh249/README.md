# gh#249 evidence — fetchpriority="high" on the home hero art

Measured 2026-10-04 on this machine, against `npm run build` served by `npx serve dist/ -l 4341`,
headless Chrome on remote-debugging port 9341, one fresh `--user-data-dir` per width. Before tree: HEAD
`0380a26` unchanged. After tree: the same plus this batch's edits (gh#249 and gh#250 build into one tree).

## The change

`src/components/landing/FeaturedCard.astro`: the hero `<img>` gains `fetchpriority="high"`. Nothing
else on the page carries one.

## Gate: `scripts/landing-claims-check.mjs`, new `scanHeroPriority`

Owned expectation: across every tag in `dist/index.html`, exactly ONE carries a `fetchpriority`
attribute, it reads `high`, and that tag is an `<img>` whose `src` starts with `/art/`. The attribute is
matched on its own, so the `srcset` the same tag now carries (gh#250) cannot hide it or fake it.

Red before the fix: `node scripts/landing-claims-check.mjs` on the unfixed `dist/` (built at `0380a26`)
exited 1 with `19 landing-claims problem(s)`, which is the 18 srcset problems of the first version of the gh#250 scan (it judged every home art img; it
now judges the hero and popular row only) plus this one. I
tailed that output, so the line itself was read from the second run: the attribute stripped from a
scratch copy of the FIXED `dist/` (`sed` on the copy, `--dist <copy>`):

    dist/index.html: 0 tag(s) carry a fetchpriority attribute, exactly 1 required (the hero art, the page's LCP image)

Selftest (`node scripts/landing-claims-check.mjs --selftest`), each red the ONLY problem its scan reports:

| Planting | Kind |
|---|---|
| a second `fetchpriority` on another art img (planted second) | `hero-priority-count` (2 tags) |
| the hero's attribute removed (planted zero) | `hero-priority-count` (0 tags) |
| a `<link rel="preload" fetchpriority>` added | `hero-priority-count` (2 tags) |
| the one tag's `src` moved off `/art/` | `hero-priority-target` |
| the attribute moved to a non-img tag | `hero-priority-target` |
| value `low` | `hero-priority-value` |
| known-good: one attribute on an `/art/` img that also carries a `srcset` | green |

## Built page

`dist/index.html`: `grep -c fetchpriority` = 1 line, and it is the hero img
(`src="/art/croc-bite.webp" srcset="… 1x, … 2x" … fetchpriority="high"`).

## LCP, read with `ui-audit-probe.mjs` (`BASE=http://localhost:4341 CDP_PORT=9341 W=<w> PAGES=/`)

| Width | Before: LCP element / url / ms | After: LCP element / url / ms |
|---|---|---|
| 320 | `img` / `/art/croc-bite.webp` / 64 | `img` / `/art/croc-bite.webp` / 52 (2x file at DPR 1 is not fetched) |
| 1440 | `img` / `/art/croc-bite.webp` / 48 | `img` / `/art/croc-bite.webp` / 64 |

n=1 run each. The LCP time is a localhost, headless, DPR 1 reading with variance larger than the
difference; the claim is the element, not the milliseconds. Raw: `audit-before-*.json`,
`audit-after-*.json`.

## Home weight, DPR 1 (the 2x candidate is not requested), `run-weight.sh` copy on ports 4341/9341

Bytes the page requests (Resource Timing `encodedBodySize` plus the document), full scroll, 19 requests:

| Width | Before | After | Delta |
|---|---|---|---|
| 1440 | 335,787 | 335,874 | +87 |
| 320 | 335,787 | 335,874 | +87 |

The +87 B is the `fetchpriority` attribute and the hero and popular `srcset` attributes in the document
(gh#250 adds the srcsets; the shelf carries none).
`fetchpriority` itself is a priority hint, not a byte. The before number is this session's own
measurement at `0380a26`: gh#244's recorded 336,027 is from the earlier build `cb89973`, not a drift here.
Raw: `../gh250/weight-before-*.json`, `../gh250/weight-after-*.json`.

## Not covered

One viewport pair, one Chrome, one machine. The LCP element is read after a full scroll with a
`buffered: true` observer, as the audit did. No claim about field LCP.
