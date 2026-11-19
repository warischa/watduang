# gh#323 — Thai-in-3D still (2026-11-19)

Criterion: Thai words with worst-case stacking render correctly when the browser paints them on a 2D canvas
and three.js uploads it as a `CanvasTexture`, in the site's real 3D path.

## How it was driven

- Build: `npm run build`, served from `dist/` with `npx serve`; one headless Chrome
  (`--headless=new --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`, no `--disable-gpu`),
  viewport 1280x720 at device scale factor 2 through `scripts/driver.mjs` (CDP).
- Route: the real prize-draw event, not the fixed-name demo (the demo's prize names are hard-coded). Setup page
  `/game/prize-draw/`: 32 Thai names (the worst-case words plus other stacked words), 5 prize names typed in,
  final game = envelopes (run 1) or ladder (run 2). Then `/game/prize-draw/play/`: four elimination rounds,
  place the 5 finalists in lanes, press the MC reveal button.
- Prize names typed: `น้ำ ที่นี่ กุ้ง` · `จันทร์ ผู้ใหญ่` · `ก๊วยเตี๋ยว เก้าอี้` · `ปั๊ม สถานีตำรวจ` · `ตลาด`
  (the last is the plain-word positive control, drawn the same way in the same screen).
- 3D confirmation (read in the page during the reveal): one `canvas` in `.pr-host`, 2560x1328 at DSF 2,
  WebGL2 context live, not lost; unmasked renderer reads ANGLE / SwiftShader (software GL, but WebGL2, so the
  three.js scene is the one drawing). At the result screen the host disposes the canvas and the 2D result
  takes over; every still here is from before that switch (screen state `objects` / `lanes`, canvas present).
  Console errors: none.

## Stills (cropped from the 2x frame)

| file | shows |
|---|---|
| `envelopes-3d-slots-and-plates.png` | envelopes: five opened slots (prize lines, finalist names) and the five name plates |
| `ladder-3d-slots-left.png`, `ladder-3d-slots-right.png` | ladder: the five prize slots, halves of one frame |
| `ladder-3d-plates.png` | ladder: the bottom name plates |
| `must-red-shaped-vs-split.png` | control: top row shaped `fillText`, bottom row the same words drawn one code point at a time |

## Judgment (opened each still)

Every word below has its vowel above/below and its tone mark on the base consonant; no U+25CC dotted circle;
nothing clipped at the top edge of a texture.

- น้ำ, ที่นี่, กุ้ง: tone mark over the upper vowel, nikhahit sara-am intact, lower vowel under the consonant.
- จันทร์, ศิลป์, ฟิล์ม: การันต์ (U+0E4C) visible on ท / ป / ล.
- ผู้ใหญ่: lower vowel + tone mark on ผ, ญ with its foot and tone mark.
- ก๊วยเตี๋ยว: tone mark (ไม้จัตวา) over ก, and over the ต+ี stack (tallest stack) both drawn, not clipped.
- เก้าอี้, ปั๊ม, สถานีตำรวจ, ตลาด (control), ธุรกิจ, ญี่ปุ่น: correct.

## Must-red

A broken shaping looks like marks floating off or colliding with their consonant, or dotted circles. Same words
drawn per code point (no cluster shaping): ที่นี่ and ก๊วยเตี๋ยว show the tone marks piled into the vowel as blobs
instead of stacked above it, and spacing splits each cluster. 28,878 pixels differ from the shaped row. The
shaped row and the 3D stills do not show this.

## Not covered

Software GL only (SwiftShader); no real GPU or iOS WebKit shaping. Screenshots are the browser composite, not a
direct texture readback. Words appear as prize lines or finalist names; the draw is random, so which finalist
name lands on a plate varies by run.
