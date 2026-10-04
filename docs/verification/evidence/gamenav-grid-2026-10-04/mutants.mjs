// Builds the three calibration mutants for scripts/gamenav-again-grid-probe.mjs from a built dist/.
// Each mutant is a full copy of dist/ with ONE edit, asserted to land exactly once per file, so a
// rebuild that changes the minified text fails here instead of producing an unmutated "mutant".
//
//   node docs/verification/evidence/gamenav-grid-2026-10-04/mutants.mjs <dist> <outdir>
//     -> <outdir>/guard-unlatched   the leave-confirm no longer arms on the round-started event
//        <outdir>/nav-under-stage   GameNav moved from below the how-to section to directly under #stage
//        <outdir>/announce-dropped  announceRoundStarted() dispatches nothing
//
// guard-unlatched is the positive control ADR-0015 names (the build where the same tap navigates):
// the latch in the guard predicate returns false instead of true, so on a solo page, which has no
// #player-setup to fall back on, the guard never arms. Expected verdict: FAIL.
// nav-under-stage is the geometry mutant: it changes where the links sit, not what the guard does,
// so on siamsi (a round page) it should only add collisions the guard holds, and on the two pages
// that announce no round it should surface collisions as UNGUARDED. Expected verdict: UNGUARDED.
// announce-dropped tests the probe's own runtime read: a game that stops announcing its round leaves
// the shell's guard unarmed, and the probe must call that collision UNGUARDED rather than excuse it.
// Expected verdict: UNGUARDED, with siamsi's collision in the unguarded list.
import fs from 'node:fs';
import path from 'node:path';

const [dist, out] = process.argv.slice(2);
if (!dist || !out) { console.error('usage: mutants.mjs <dist> <outdir>'); process.exit(2); }

function once(text, from, to, where) {
  const n = text.split(from).length - 1;
  if (n !== 1) { console.error(`${where}: expected exactly 1 match, found ${n}`); process.exit(1); }
  return text.replace(from, to);
}

const copy = (name) => {
  const dir = path.join(out, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(dist, dir, { recursive: true });
  return dir;
};

{
  const dir = copy('guard-unlatched');
  const astro = path.join(dir, '_astro');
  const chunk = fs.readdirSync(astro).filter((f) => f.startsWith('LeaveConfirm.astro_') && f.endsWith('.js'));
  if (chunk.length !== 1) { console.error(`guard-unlatched: ${chunk.length} LeaveConfirm chunks`); process.exit(1); }
  const p = path.join(astro, chunk[0]);
  fs.writeFileSync(p, once(fs.readFileSync(p, 'utf8'), 'if(r)return!0;', 'if(r)return!1;', chunk[0]));
  console.log(`guard-unlatched: ${chunk[0]} latch now returns false`);
}

{
  const dir = copy('nav-under-stage');
  const pages = fs.readdirSync(path.join(dir, 'game')).filter((id) => {
    const f = path.join(dir, 'game', id, 'index.html');
    return fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes('id="stage"');
  });
  for (const id of pages) {
    const f = path.join(dir, 'game', id, 'index.html');
    let html = fs.readFileSync(f, 'utf8');
    const nav = html.match(/<nav class="game-next"[\s\S]*?<\/nav>/);
    if (!nav) { console.error(`nav-under-stage: ${id} has no nav.game-next`); process.exit(1); }
    html = once(html, nav[0], '', `${id} nav`);
    const stage = html.match(/<div id="stage"[^>]*><\/div>/);
    if (!stage) { console.error(`nav-under-stage: ${id} has no #stage`); process.exit(1); }
    html = once(html, stage[0], stage[0] + nav[0], `${id} stage`);
    fs.writeFileSync(f, html);
  }
  console.log(`nav-under-stage: moved GameNav under #stage on ${pages.join(', ')}`);
}

{
  const dir = copy('announce-dropped');
  const astro = path.join(dir, '_astro');
  const chunk = fs.readdirSync(astro).filter((f) => f.startsWith('_round-start.') && f.endsWith('.js'));
  if (chunk.length !== 1) { console.error(`announce-dropped: ${chunk.length} _round-start chunks`); process.exit(1); }
  const p = path.join(astro, chunk[0]);
  fs.writeFileSync(p, once(fs.readFileSync(p, 'utf8'), '{document.dispatchEvent(new CustomEvent(n))}', '{}', chunk[0]));
  console.log(`announce-dropped: ${chunk[0]} announces nothing`);
}
