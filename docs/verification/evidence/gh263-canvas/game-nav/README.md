# gh#263 item 1: the GameNav link list on the number boards, drawn with a 44px hit area

Status: **pending render approval** (owner ruling 2026-10-06 by popup: draw a board with 44px links, approve before code; ADR-0033).

Captured 2026-10-06 from `file://` with headless Chrome 154 over raw CDP (port 9362, own profile, killed by pid
afterwards, port confirmed free with `lsof`). Same method as `../how-to/`: `mobile:false`, deviceScaleFactor 1,
reduced motion, animations off, `document.fonts.ready` awaited, JPEG q70; the desktop full board was over 150KB and
was sliced in half with `magick -crop 100%x50%`. Script: `capture.mjs`. Output: `capture-result.json` (per link:
label, box height from `getBoundingClientRect`, computed font). Every image was opened and read by eye: Thai renders
as glyphs, no dotted circles, nothing clipped.

## What is drawn

- The dashed placeholder under "เล่นเกมต่อ" on `design/ToolNumber390.dc.html` and `design/ToolNumberDesktop.dc.html`
  is replaced by the real list: the 14 `party` games' `names.th`, in manifest order, which is what the tool page's
  `GameNav` (category `party`) renders. Labels were read from `src/games/manifest.ts` at runtime and compared with
  the drawn labels in the capture: identical. Invented Thai: 0.
- Link rule on the board: `display: inline-flex; align-items: center; min-height: 44px` (no vertical padding).
  The hit area is invisible, as on the site (no background, no border), so the render shows only the extra row
  spacing it costs.
- List: `flex-wrap`, gap 8px row / 16px column (the component's `--space-sm` / `--space-md`). Ink `#14142b`, no
  underline, from the board's own `a` rule (canvas D, ADR-0069).
- Text size is unchanged: GameNav, the number page and `Base.astro` set no font-size or line-height on these links,
  so they inherit the UA default, 16px, weight 400, `line-height: normal`. The board draws 16px / 400 / normal.
- Why `min-height` and not padding: the box height under padding depends on the font's content area. Today's rule
  (`padding-block: 2px`) measures 25px on the site (Sarabun) but 28px on the board (Noto Sans Thai) — the same rule
  gives a different number per face. `min-height` gives 44px in both. It also makes the box real layout, so rows
  cannot overlap; an inline anchor padded to 44px would bleed into the neighbouring rows across an 8px gap.

## Numbers (from `capture-result.json` and a run on pre-edit copies of the boards)

| Board | Width | Links | Rows | Link height | List height before (placeholder) | List height after | Section (h2 + list) before / after |
|---|---|---|---|---|---|---|---|
| ToolNumber390 | 390 | 14 | 4 | 44px each | 58.78px | 200px | 96.78px / 238px |
| ToolNumberDesktop | 1440 (940px column) | 14 | 2 | 44px each | 48.8px | 96px | 91.8px / 139px |

Red before green: the same capture with today's rule drawn (`padding-block: 2px`) measured every link at 28px on
both boards (list 120px at 390, 56px on desktop) and failed the every-link-at-least-44 check.
`scrollWidth == clientWidth` on both boards.

## Images

| Board | Section crop | Full board |
|---|---|---|
| `design/ToolNumber390.dc.html` | `ToolNumber390-gamenav.jpg` | `ToolNumber390.jpg` |
| `design/ToolNumberDesktop.dc.html` | `ToolNumberDesktop-gamenav.jpg` | `ToolNumberDesktop-part0.jpg`, `-part1.jpg` |

## Owner approval

APPROVED 2026-10-06 by owner popup on these renders: each GameNav link takes `display: inline-flex; align-items: center; min-height: 44px`, text unchanged (16px), 8px row gap, 16px between links. Code follows in a later src batch (ADR-0033).
