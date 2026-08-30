# ADR-0052 — popularity is measured off-site and baked in at build

Date: 2026-08-30 · Status: accepted · Owner decision · Relates: [ADR-0003](0003-seo-gate-is-search-console-clicks.md), [ADR-0034](0034-hub-copy-lives-in-the-manifest-not-the-page.md), [ADR-0010](0010-checkpoint-slot-stays-site-wide-until-a-second-writer-exists.md), gh#159, gh#160, gh#9

## Context

The owner wants a play count per game, to show a popular-games row and to decide which game to build next. Four facts about the site as it stands on 2026-08-30 shape what is possible.

**There is no measurement of any kind today.** `CLAUDE.md` lists Cloudflare Web Analytics in the stack; it is not running. The live home page serves zero external scripts and no beacon — verified by fetching it. The likely reason is that Cloudflare needs the domain proxied through it, and the domain is still unregistered (gh#9). So the premise "rank the games by their numbers" currently has no numbers at all, not even page views.

**The site is static by rule, not by accident.** The build must produce a pure `dist/`, everything Azure-specific must live in exactly two files, no Azure SDK may enter the build, and CI proves portability with `npx serve dist/`. A static site has no server, no datastore and no write path, so it cannot aggregate anything across visitors on its own.

**The CSP is closed.** `connect-src` and `script-src` allow `'self'` and the Google ad domains, nothing else, and a gate watches the allowlist. Anything that phones anywhere is a deliberate, gated change.

**The one existing play signal is not trustworthy.** `markPlayed` exists and seven game modules call it, but it writes to `sessionStorage`, which dies with the tab, and on play routes it is frequently a no-op — the shared page mounts it as an empty function, and a play route with no shell round record has its write refused silently. It was built to answer "has this round been played on", not "how many times has this game been played".

## Decision

**Popularity is measured off-site by analytics, and the resulting order is baked into the manifest at build time.** The site renders the row from that manifest value. Nothing counts at runtime, nothing is stored per visitor, and no request leaves the page for this feature.

Each game already has its own URL, so per-game page views need no per-game instrumentation.

**The row ships before the numbers exist.** Its order is the owner's pick until analytics is live, and it is labelled ยอดนิยม from the first day — the owner chose that wording knowing the order was a pick rather than a measurement (2026-08-30). gh#160 is where the label and the data are reconciled, and that reconciliation is an acceptance criterion there rather than an intention.

## What was rejected, and why it stays rejected

**A counter endpoint** — an edge function plus a key-value store, giving live counts and a real "round finished" event rather than an open. It was rejected on four independent grounds, any one of which is sufficient:

- it breaks the portability rule three ways at once (Azure code outside its two files, an SDK in the build, `npx serve dist/` no longer sufficient)
- it needs the CSP opened to a new host
- it records behaviour to a server the project owns, which is a different privacy posture from cookieless analytics, on a Thai site
- a public endpoint that increments a counter is trivially spammable, and a popular-games row driven by a spammable counter is worse than no row

**Waiting for data before shipping the row** was also rejected: the row's plumbing does not depend on the numbers, and the slot it replaces is a hardcoded game id in the page, which is drift against ADR-0034 that gets fixed either way.

## Risks accepted, with eyes open

**A page view is not a play.** A view counts someone who opened the game. A game with many opens and few finishes is a weak game that will rank high. This is an approximation and gh#160 requires the limitation to be recorded next to the number, so the row is not later read as a quality signal. ADR-0003 already sets the discipline that this project decides on real measured clicks rather than flattering numbers; the same scepticism applies here.

**A popularity row is a feedback loop.** Promoting what is already popular buries what is new, and a new game can never enter a list nobody sees it on. With six games this is a podium rather than a ranking. The mitigation is that the order stays owner-editable in one file rather than being computed automatically — a human can promote a new game deliberately.

**The sample is currently too small to trust.** No domain, no AdSense, little traffic. Ordering a roadmap on a handful of sessions is noise. The owner's taste has already outperformed what a counter would have said — สุ่มคนโดน was deleted for being too simple to be interesting, which no view count would have surfaced.

## Consequences

`markPlayed` remains what it is: a per-round, per-tab signal, not a metric. If a real play count is ever wanted, making that signal reliable on play routes is the prerequisite, and it is a separate piece of work from anything here.

The refresh is a ritual with an owner and a cadence, written down. A refresh with neither stops happening after the second time, and the row silently becomes a permanent snapshot of one afternoon.

## The fact that would reopen this

Traffic large enough that the difference between "opened" and "finished" changes which game you would build next. At that point the counter endpoint becomes worth its four costs, and it should be designed with abuse protection from the first line rather than added afterwards.
