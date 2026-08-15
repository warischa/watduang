# Keyword Planner seed list for #12

Feeds [#12](https://github.com/warischa/watduang/issues/12) (long-tail keyword research — optimize-only,
no longer a gate per [ADR-0003](../adr/0003-seo-gate-is-search-console-clicks.md)) and picks words for
`seo.title` / `seo.description` / `keywords` on the games and tools listed below. Categories follow
[ADR-0001](../adr/0001-category-means-search-intent.md): a seed is built around what the searcher wants,
not around the game's mechanic.

## Derived set

Source: `src/games/manifest.ts` + `src/tools/*.ts` for what is shipped; issue #5 (`04 — เลือกเกม v1`,
closed, "7 เกมใน v1" table) for the two unshipped games; issue #1 → #11 ("ส่งเครื่องมือครบ 4 ตัวใน v1")
for the tool count. This is the full v1 set, not just what has a file today — seeds for unshipped games
are the point of #12: knowing demand before writing ~230 content items.

7 games + 4 tools = **11 items**.

| # | Item (Thai name) | Type | Category | Status |
|---|---|---|---|---|
| 1 | ระเบิดเวลา | game | party | shipped (`timebomb`) |
| 2 | สุ่มคนโดน (หน้า "ใครแพ้หมดแก้ว") | game | party | planned |
| 3 | จับไม้สั้น | game | party | planned |
| 4 | ใครในวงนี้น่าจะ… | game | party | planned |
| 5 | ความจริงหรือท้า | game | party | planned |
| 6 | วัดดวงวันนี้ | game | fortune | shipped (`siamsi`) |
| 7 | ดวงความรัก / คู่ไหนเข้ากัน | game | fortune | planned |
| 8 | วงล้อสุ่มชื่อ | tool | — | shipped (`wheel`) |
| 9 | จับฉลาก | tool | — | shipped (`draw`) |
| 10 | แบ่งทีม | tool | — | shipped (`team`) |
| 11 | สุ่มเลข | tool | — | shipped (`number`) |

## Seed keywords

Extends the 7 head terms already named in #12's own checklist (`วงล้อสุ่ม` `สุ่มเลข` `สุ่มชื่อ` `วัดดวง`
`เกมกลุ่ม` `เกมลงโทษ` `สุ่มคนโดน`) rather than inventing a parallel list. Each row is one seed for one
item — run "ดูคีย์เวิร์ดที่เกี่ยวข้อง" (related keywords) on every row, not just the head terms; that
related-keyword expansion is #12's actual ask, not the head term volume alone.

Volume and competition columns are **empty on purpose** — the owner fills them in from Keyword Planner.
No number belongs in this file until then.

| # | Item | Seed keyword (Thai, verbatim) | Monthly volume | Competition |
|---|---|---|---|---|
| 1 | ระเบิดเวลา | เกมระเบิดเวลา | | |
| 1 | ระเบิดเวลา | เกมส่งมือถือวนกัน | | |
| 2 | สุ่มคนโดน | สุ่มคนโดน | | |
| 2 | สุ่มคนโดน | ใครแพ้หมดแก้ว | | |
| 3 | จับไม้สั้น | จับไม้สั้น | | |
| 3 | จับไม้สั้น | จับไม้สั้นออนไลน์ | | |
| 4 | ใครในวงนี้น่าจะ… | เกมทายใครในกลุ่ม | | |
| 4 | ใครในวงนี้น่าจะ… | เกมใครน่าจะเป็นคนทำ | | |
| 5 | ความจริงหรือท้า | ความจริงหรือท้า | | |
| 5 | ความจริงหรือท้า | คำถามความจริงหรือท้า | | |
| 6 | วัดดวงวันนี้ | วัดดวงวันนี้ | | |
| 6 | วัดดวงวันนี้ | เซียมซีออนไลน์ | | |
| 7 | ดวงความรัก / คู่ไหนเข้ากัน | ดูดวงความรัก | | |
| 7 | ดวงความรัก / คู่ไหนเข้ากัน | คู่ไหนเข้ากัน | | |
| 8 | วงล้อสุ่มชื่อ | วงล้อสุ่มชื่อ | | |
| 8 | วงล้อสุ่มชื่อ | วงล้อสุ่มชื่อออนไลน์ | | |
| 9 | จับฉลาก | จับฉลากออนไลน์ | | |
| 9 | จับฉลาก | จับฉลากชื่อ | | |
| 10 | แบ่งทีม | สุ่มแบ่งทีม | | |
| 10 | แบ่งทีม | แบ่งทีมออนไลน์ | | |
| 11 | สุ่มเลข | สุ่มเลขออนไลน์ | | |
| 11 | สุ่มเลข | สุ่มเลขไม่ซ้ำ | | |

Head terms from #12 not tied to one item (still worth running — they inform which item wins the SERP,
not `seo.*` on a single page): `เกมกลุ่ม`, `เกมลงโทษ`.

## Procedure — who runs it, what comes back

**Who:** the site owner. This step needs a Google Ads login — an agent cannot hold that account, so an
agent cannot run Keyword Planner. Everything above this line an agent can prepare; everything below, the
owner does by hand.

1. Open Google Ads → Keyword Planner (no campaign needs to run, no spend needed — an unfunded account
   just returns wider volume bands like 1K–10K instead of exact numbers; expected, not a bug).
2. Set geo = Thailand, language = Thai.
3. Paste each seed keyword from the table above one at a time (or as a batch — Keyword Planner accepts a
   list).
4. For each seed, open "ดูคีย์เวิร์ดที่เกี่ยวข้อง" (view related keywords) and note any related term that
   has volume > 0 and low competition — this is the long-tail #12 is actually after, not the head term's
   own volume.
5. Record results back into this file (or a copy of it) by filling in the two empty columns per row, and
   appending any related long-tail term found in step 4 as a new row with its own item number.
6. Commit the filled-in file to this repo at the same path. That filled table is the output — the "volume
   + competition per seed, plus any long-tail related term with volume > 0 and low competition" — which
   then feeds picking words for `seo.title` / `seo.description` / `keywords` on the matching item.

Reference: [#12](https://github.com/warischa/watduang/issues/12) for the original checklist this
procedure is built from; [ADR-0003](../adr/0003-seo-gate-is-search-console-clicks.md) for why this is
optimize-only and not a go/no-go gate.
