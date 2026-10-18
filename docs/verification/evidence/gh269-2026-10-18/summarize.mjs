// gh269: per-cell summary of the harness JSON. Usage: node summarize.mjs <run.json>...
import fs from 'node:fs';
for (const f of process.argv.slice(2)) {
  const o = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log(f.split('/').pop(), o.browser, 'error=', o.error ?? 'none', 'runs=', o.runs.length);
  const cells = {};
  for (const r of o.runs) {
    const k = `${r.order}/${r.mech}`;
    const c = (cells[k] ??= { n: 0, ok: 0, gl: new Set(), painted: 0, paintBeforeTask: 0, green: 0, hole: 0, mut: null, entriesMissing: 0, iw: new Set(), vis: new Set(), hold: new Set(), framesBetween: [] });
    c.n++; if (r.ok) c.ok++; c.gl.add(r.gl?.webgl); if (r.paintedBeforeOpen) c.painted++; if (r.leafPaintBeforeOpenTask) c.paintBeforeTask++;
    if (r.samplerGreen) c.green++; if (r.holeReached) c.hole++; if ('mutationsInWindow' in r) c.mut = (c.mut === 'n/a' ? 0 : c.mut) + r.mutationsInWindow; else c.mut = 'n/a';
    if (r.leafRender == null || r.openRender == null) c.entriesMissing++;
    c.iw.add(r.page?.innerWidth); c.vis.add(r.page?.visibility); if ('holdAtReveal' in r) c.hold.add(`${r.holdAtReveal}->${r.holdAtOpen}`); c.framesBetween.push(r.framesBetween);
  }
  for (const [k, c] of Object.entries(cells)) console.log(` ${k.padEnd(13)} n=${c.n} ok=${c.ok} gl=${[...c.gl]} painted=${c.painted}/${c.n} paint<openTask=${c.paintBeforeTask}/${c.n} samplerGreen=${c.green}/${c.n} hole=${c.hole}/${c.n} mutInWindow=${c.mut} entriesMissing=${c.entriesMissing} iw=${[...c.iw]} vis=${[...c.vis]} hold=${[...c.hold]} framesBetween=${c.framesBetween.join(',')}`);
}
