# Tool name-entry panel — the three strings gh#109 still owes (UNREVIEWED)

> **⚠ UNREVIEWED — agent-drafted candidate copy. Nothing here has owner sign-off.**
> Candidates for boxes 1, 2 and 3 of [gh#109](https://github.com/warischa/watduang/issues/109), all drafted
> 2026-09-23 (box 3 was added to the ticket that day). Owner ruling 2026-09-23 (popup, in the session that drafted this file): the 2026-09-16 ruling recorded on
> [gh#101](https://github.com/warischa/watduang/issues/101) — an agent drafts Thai copy as candidates,
> the owner edits them — now covers gh#109 too. That reverses the line in gh#109's 2026-08-28 comment,
> "Both are Thai copy, so neither was invented by an agent". None of this may reach `src/**` or
> `design/**` until the owner has edited it here and said so.

## What the panel actually does

This is read off `ToolNameEntry.astro` and its script, not measured in a browser:

- One textarea, one name per line. Every keystroke saves the parsed lines to `localStorage` under that
  tool's own key (`saveToolNames` in `src/tools/name-list.ts`). On load, `loadToolNames` puts them
  back. **A refresh keeps the names.** `name-list.ts` has no `removeItem` or `clear` path, so only the
  reader deleting lines removes a name.
- None of the panel, `name-list.ts` or the three tool pages makes a network call: a grep for `fetch(`,
  `sendBeacon`, `XMLHttpRequest` and `WebSocket` found none on 2026-09-23. So the names stay in that
  browser on that device, as far as those files go.
- On `/tool/wheel/` the panel sits **below** the wheel (ADR-0033). The reader can type more names
  there at any time and press `ใส่ชื่อลงวงล้อ` again.

## Box 1 — the persistence footnote

Today, five artboards under `design/` carry this line: `ToolNameEntry.dc.html`, `ToolWheel390.dc.html`,
`ToolWheelDesktop.dc.html`, `ToolDrawDesktop.dc.html` and `ToolTeamDesktop.dc.html`.

> `ชื่ออยู่ที่เครื่องนี้ชั่วคราว รีเฟรชแล้วหาย`

It is false: a refresh does not lose the names. The shipped panel shows no footnote at all. The box
asks that the artboard and the panel agree, and that the footnote copy exists in one of them. There
are two ways to close it:

- **(a) Keep a footnote.** Replace the line in all five artboards. Whether it also ships in the panel
  is a separate owner call.
- **(b) Drop the footnote.** Delete the line from all five artboards and record here that the panel
  deliberately carries none.

Candidates for (a):

1. `ชื่อจำไว้ในเครื่องนี้ รีเฟรชแล้วยังอยู่ อยากเอาออกก็ลบในช่องได้เลย`
2. `รีเฟรชแล้วชื่อยังอยู่ — เก็บไว้ในเครื่องนี้เครื่องเดียว`
3. `ชื่อเก็บไว้ในเครื่องนี้ ไม่ส่งไปไหน เปิดหน้านี้ใหม่ก็ยังอยู่`

⚠ Candidate 3 makes a privacy promise, `ไม่ส่งไปไหน`. It is true of the code today, but it would bind
every future change to the tool pages, analytics and ads included. Pick it only if you want that
promise on the page.

## Box 2 — the wheel's single-name note

This is the branch of the wheel's note that runs when a round starts with one name. Current text:

> `` วงล้อมีชื่อเดียว (${roster[0]}) ต้องมีอย่างน้อย 2 ชื่อถึงจะหมุนได้ — รีเฟรชหน้านี้แล้วเลือกชื่อใหม่ ``

The tail cannot work: a refresh restores the same single name from storage, and there is no picker to
choose from. The candidates keep the head byte-exact and replace only the tail after `—`:

1. `` วงล้อมีชื่อเดียว (${roster[0]}) ต้องมีอย่างน้อย 2 ชื่อถึงจะหมุนได้ — พิมพ์ชื่อเพิ่มในช่องด้านล่าง บรรทัดละชื่อ แล้วกด "ใส่ชื่อลงวงล้อ" อีกครั้ง ``
2. `` วงล้อมีชื่อเดียว (${roster[0]}) ต้องมีอย่างน้อย 2 ชื่อถึงจะหมุนได้ — เพิ่มชื่อในช่อง "ชื่อในวง" ด้านล่าง แล้วกด "ใส่ชื่อลงวงล้อ" ``

Both reuse labels that already ship on that page (`ชื่อในวง`, `ใส่ชื่อลงวงล้อ`), so they name controls
a reader can see.

## Landing, once signed off — not part of this draft

- Box 2 edits the wheel page's inline script. `scripts/bundle-freeze-check.mjs` pins that script's
  bundle, so the same commit needs the gate's re-baseline (gh#109's 2026-08-28 comment).
- Box 1 (a) or (b) edits the five artboards listed above.
- Box 3 edits one `<li>` of page markup on each of the three tool pages. Inferred, not measured:
  that is markup, not the inline script `bundle-freeze-check` pins. Run the gate at landing anyway.

## Box 3 — step 1 of `วิธีใช้` on the three tool pages

On 2026-09-23 the owner folded this into gh#109 by popup, and it became the ticket's third open box.
Today, step 1 reads as follows on each page, with only the button label changing:

> `เลือกชื่อจากกลุ่มเดิม หรือพิมพ์ชื่อใหม่เข้าไป แล้วกด "{CTA}"`

There is no group to pick from. The panel is a textarea only, and the tools keep no shared roster
(ADR-0039). Each page mounts the panel with its own heading and button label, and the candidates
reuse both, so every word names something the reader can see:

| page | panel heading `{HEADING}` | button `{CTA}` |
|---|---|---|
| `/tool/wheel/` | `ชื่อในวง` | `ใส่ชื่อลงวงล้อ` |
| `/tool/draw/` | `ชื่อในกล่อง` | `ใส่ชื่อลงกล่อง` |
| `/tool/team/` | `ชื่อในสนาม` | `ใส่ชื่อลงสนาม` |

Candidates, one sentence for all three pages, with the slots filled per page from the table:

1. `พิมพ์ชื่อลงในช่อง บรรทัดละ 1 ชื่อ แล้วกด "{CTA}"`
2. `พิมพ์ชื่อในช่อง "{HEADING}" บรรทัดละ 1 ชื่อ แล้วกด "{CTA}"`
3. `พิมพ์ชื่อลงในช่อง บรรทัดละ 1 ชื่อ ใส่กี่คนก็ได้ แล้วกด "{CTA}" — ชื่อที่ใส่ไว้ครั้งก่อนยังอยู่ในช่อง แก้หรือลบได้เลย`

Candidate 1 mirrors the textarea's own placeholder, `พิมพ์ชื่อ บรรทัดละ 1 ชื่อ`. Candidate 3 also
restates the panel hint `ใส่ได้กี่คนก็ได้` and the persistence fact from "What the panel actually
does". If box 1 keeps a footnote, candidate 3 says the same thing twice on one page. None of the
candidates says where the panel sits, because only the wheel page's position is recorded (ADR-0033).
