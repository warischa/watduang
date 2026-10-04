// gh#250 — reads dpr<DPR>-<label>-<W>.json (written by dpr-probe.mjs) and prints, per page and slot,
// whether each image's FILE pixel width covers DPR x its width. Two readings, both printed:
//   box     file width >= DPR x the img box width   (the ticket's reading, the stricter one)
//   painted file width >= DPR x the width actually painted, where object-fit: contain letterboxes the
//           image inside its box (a 160 px-tall category card box paints a 283x320 file 141.5 px wide)
// Run from the repo root: node docs/verification/evidence/gh250/summarize.mjs <label> <dpr> [verbose]
import fs from 'node:fs';

const [label, dpr, verbose] = process.argv.slice(2);
const dir = new URL('./', import.meta.url).pathname;
let failBox = 0;
let failPainted = 0;
let n = 0;
for (const w of [320, 1440]) {
  const j = JSON.parse(fs.readFileSync(`${dir}dpr${dpr}-${label}-${w}.json`, 'utf8'));
  for (const [page, p] of Object.entries(j.pages)) {
    if (p.error) { console.log(w, page, 'ERROR', p.error); continue; }
    const bySlot = {};
    for (const r of p.rows) {
      const fileW = Number((r.fileSize ?? r.natural).split('x')[0]);
      const boxW = Number(r.renderedBox.split('x')[0]);
      const row = { ...r, fileW, boxW, okBox: fileW >= dpr * boxW - 0.001, okPainted: fileW >= dpr * r.paintedW - 0.001 };
      (bySlot[r.slot] ||= []).push(row);
      n += 1;
      if (!row.okBox) failBox += 1;
      if (!row.okPainted) failPainted += 1;
    }
    console.log(`W=${w} dpr=${p.dpr} ${page} requests=${p.requests} weight=${p.weight} B`);
    for (const [slot, rows] of Object.entries(bySlot)) {
      const minBox = Math.min(...rows.map((r) => r.fileW / r.boxW)).toFixed(3);
      const minPainted = Math.min(...rows.map((r) => r.fileW / r.paintedW)).toFixed(3);
      console.log(`  ${slot}: n=${rows.length} boxW<=${Math.max(...rows.map((r) => r.boxW))} min file/box=${minBox} (fail ${rows.filter((r) => !r.okBox).length}) min file/painted=${minPainted} (fail ${rows.filter((r) => !r.okPainted).length})`);
      if (verbose) {
        for (const r of rows) console.log(`     ${r.src} -> ${r.currentSrc} file=${r.fileSize ?? r.natural} box=${r.renderedBox} painted=${r.paintedW} box:${r.okBox ? 'ok' : 'FAIL'} painted:${r.okPainted ? 'ok' : 'FAIL'}`);
      }
    }
  }
}
console.log(`TOTAL images judged=${n}  fail(box)=${failBox}  fail(painted)=${failPainted}`);
