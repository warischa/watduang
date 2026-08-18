# ADR-0018 — A static tripwire may stand in for a probe that never runs, if it names what it cannot prove

## Context

Nine browser probes in `scripts/` back shipped invariants — ADR-0014, ADR-0015, ADR-0016, ADR-0017 all
rest on probe output. CI runs none of them. They need `npm run build`, `npx serve dist/`, and a real
Chrome over CDP: minutes of runtime and a headless-browser dependency, against a static site whose other
gates finish in seconds. There is also a live trap: a verification step in this workflow once rebuilt
`dist/`, so deploy shipped an artifact the earlier gates had never inspected — the scar is the
commented-out `--selftest` beside `crawl-check-gamenav` in `ci.yml`.

So ADR-0014's invariant — no navigation target renders inside `#stage` — was proven once, by hand, and
guarded by nothing. A regression would be invisible until a player double-tapped out of a round.
Tracked as gh#43.

## Decision

Where an invariant has a cheap static shadow, ship the static check as a **regression tripwire**, and
write its ceiling at the top of the script. The tripwire never claims the probe's verdict.

`scripts/no-nav-in-stage-check.mjs` is the first: a source scan over the six game modules plus
`_template.ts`, wired into `ci.yml` before Build, static only — it reads files and exits, and touches
no build artifact.

## What this rests on

**The pattern set must be calibrated against the idiom this codebase actually writes, not a generic
list.** This is the whole load-bearing part, and the first pass got it wrong in a way that would have
shipped.

The games build DOM through a local helper, duplicated in each file:

```ts
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, style?: string)
```

It takes no attributes. So a link here has to be `el('a', …)` followed by `setAttribute('href', …)`.
The first pattern set matched `<a`, `href=`, and `createElement('a')`. It was calibrated by planting
`createElement('a')` in a real game module, and it went red — a clean, convincing both-ways
calibration on a construct **no game file contains**. Both halves of the real form were unmatched:
`el('a',` is not `<a`, and `setAttribute('href',` has a comma where the pattern wants `=`.

A gate that goes red on a planted violation has proven its plumbing, not its coverage. The planted
violation has to look like the regression that would actually happen here.

## Consequences

- A green run means "no obvious anchor literal in the game modules". It never means "no navigation
  target reaches the DOM". `scripts/no-nav-in-stage-probe.mjs` remains the only thing that proves the
  rendered DOM, and it still runs only by hand.
- The ceiling belongs in the script's own `ponytail:` header, where the next reader is standing — not
  only here. A future reader must not mistake the tripwire for the proof.
- `_template.ts` is in scope: it is the copy-paste seed for every new game, so an anchor literal planted
  there propagates into every game that follows.
- This pattern is a candidate for the rest of gh#43, but it does not generalise automatically.
  `leave-confirm` and `arm-gate` both depend on timing and real touch behaviour, which no static scan
  approximates. Each probe still needs its own decision.

## The fact that would change this

A game module starting to build DOM from variables — `innerHTML` from a template, or a tag name
assembled by concatenation. Today every game goes through `el()` with a literal tag, which is why a
literal scan tracks the invariant at all. The moment that stops being true, the scan's blind spot
becomes the normal path, and the tripwire silently stops tracking the thing it is named after.
