# PartyPick is the English brand — confirmed, stop re-opening it

The `/en/` brand name is **PartyPick**. It is settled as of 2026-08-14. No second domain: it lives
under `/en/` on `watduang.com` ([#6](https://github.com/warischa/watduang/issues/6)).

## Why this needed a decision at all

The name was proposed early and carried as *"proposed, unconfirmed"* ever since. "ยืนยัน/เปลี่ยน
PartyPick" then rode the next-queue across four consecutive sessions without ever being resolved —
visible in `docs/sessions-archive.md`, where the same unchecked line reappears each save.

That is the actual problem being fixed here. An item that survives four saves untouched is not
pending work, it is a decision nobody is willing to make because nothing forces it.

## What the choice actually rests on

The recorded rationale is thin and has not changed: **pick is the core mechanic of every game on the
site** — the wheel picks, จับฉลาก picks, แบ่งทีม picks, สุ่มเลข picks. The name describes the product.

Nothing else in the build depends on it. There is no `/en/` content, no second domain, no logo, no
registered mark. The name becomes load-bearing only if the [ADR-0003](0003-seo-gate-is-search-console-clicks.md)
gate trips — organic clicks under 300/month at month 6 — at which point the pre-registered response is
to push `/en/` as the primary market.

## The decision

Confirm the name as-is rather than re-litigate it. Confirming costs one line; carrying it costs a
next-queue slot every session, and re-opening it invites a fresh round of naming with no new
information to decide on.

**Deliberately NOT decided here:** whether `/en/` is worth building at all. That stays where it
already lives, gated by ADR-0003.

## What would change this

New information that the name is unusable rather than merely unexamined: a trademark conflict, a
squatted `.com` that matters once `/en/` is real, or keyword research showing the name actively
competes with the terms `/en/` would need to rank for. Absent one of those, this is closed —
a later session preferring a different name is not new information.
