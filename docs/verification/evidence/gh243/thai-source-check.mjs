// Every Thai text run in a canvas must occur verbatim in one of the named copy sources.
import fs from 'node:fs';
const WT = process.cwd(); // run from the repo root
const srcFiles = ['src/pages/index.astro', 'src/games/categories.ts', 'src/tools/manifest.ts', 'src/components/PageChrome.astro', 'src/components/landing/Section.astro'];
const m = await import(WT + '/src/games/manifest.ts');
let corpus = srcFiles.map((f) => fs.readFileSync(`${WT}/${f}`, 'utf8')).join('\n');
for (const g of m.games) corpus += '\n' + g.names.th + '\n' + g.tagline;
corpus += '\n' + m.popularGroup.heading;
const files = process.argv.slice(2);
let bad = 0;
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8').split('DESIGN NOTES - mockup only')[0].replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  // text between tags, <br> joins nothing (each side checked on its own)
  const runs = html.split(/<[^>]+>/).map((s) => s.replace(/&lt;|&gt;|&amp;/g, ' ').trim()).filter((s) => /[\u0E00-\u0E7F]/.test(s));
  const missing = [...new Set(runs)].filter((r) => !corpus.includes(r));
  bad += missing.length;
  console.log(f.split('/').pop(), 'thaiRuns=' + new Set(runs).size, 'notInSources=' + missing.length, missing.slice(0, 8).join(' | '));
}
process.exit(bad ? 1 : 0);
