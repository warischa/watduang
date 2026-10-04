# gh#242 — direction C card art for the other 13 party games

2026-10-04. Render, grade and provenance: the `images/IMAGES.md` gh#242 section (`IMG_03_001`-`013`).
This file covers what is here and the browser readings.

## Files

- `as-sent-prompts.json`: every `image_gen` call per render, with Codex's rewritten prompt, its
  arguments and the output sha256. `picked` marks the call whose hash equals the saved master. It was
  extracted by `extract_as_sent.py`.
- `grade-ship.jsonl`: one line per game. It holds the black point, then for the shipped webp its size,
  bytes, the fraction of fully transparent pixels, haze outside the dilated mask, and corner alpha.
  `ship_all.py` produced it.
- `set-coral-1.png`, `set-coral-2.png`, `set-ink.png`: the set on the coral card ground and on ink, with
  croc-bite last on sheet 2.
- `set-grid-1280.png`: the built `/c/party/` grid at 1280px. These four sheets are what the owner judges
  "reads as one style" from. They are quantized to 256 colours to keep them small, so the shipped files
  in `public/art/` are the true pixels.
- `wiring/`: browser readings, described below.

The scripts resolve paths against the session scratch directory they ran from, so they are a record,
not a pipeline.

## Browser readings

Method:
- `npm run build` ran inside `scripts/run-workflow-gates.sh`. A copy of the build output was served with
  `npx serve@14 <copy> -l 4321`.
- Chrome 154.0.8037.93 was launched with `--headless --disable-gpu --no-sandbox
  --remote-debugging-port=9222`. One probe ran at a time, and `lsof -ti:4321,9222` was empty after.
- Instrument: `docs/verification/evidence/gh241/wiring/probe.mjs gh242 <dir>`, unchanged. Its readings
  are in `wiring/gh242.json`.

| width | innerWidth | scrollWidth | elements past clientWidth | detector calibrated | img.game-card-art |
|---|---|---|---|---|---|
| 320 | 320 | 320 | 0 | yes | 14 |
| 390 | 390 | 390 | 0 | yes | 14 |
| 1100 | 1100 | 1100 | 0 | yes | 14 |
| 1200 | 1200 | 1200 | 0 | yes | 14 |
| 1280 | 1280 | 1280 | 0 | yes | 14 |
| 1315 | 1315 | 1315 | 0 | yes | 14 |
| 1316 | 1316 | 1316 | 0 | yes | 14 |
| 1440 | 1440 | 1440 | 0 | yes | 14 |

- **Placement.** Every art img is its card's first child, above the h3, with `loading="lazy"` and no
  width/height attributes. At 320px the box is 236x160 with `object-fit: contain`.
- **Lazy load at 320px.** Before scrolling, 3 of the 14 art files had been requested. After the probe
  scrolled to the first card, 5 had been requested.
- **The whole grid, every image loaded.** `wiring/gridshot.mjs` scrolls each card into view, waits for
  every image, then clips the grid: 14/14 loaded at 1280px and at 320px.
- **Looked at.** The screenshots were opened and checked: every subject is whole, uncropped and not
  stretched. The empty band beside croc-bite at desktop width that gh#241 deferred is gone, because
  bangkok-drift now carries art too.

Not covered: real devices (the gh#141 walk) and the owner's style judgement.
