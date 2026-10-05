// Builds the two daily-fortune mutants for scripts/no-nav-in-stage-probe.mjs from a built dist/.
// Each mutant is a full copy of dist/ with ONE edit, asserted to land exactly once, so a rebuild that
// changes the minified text fails here instead of producing an unmutated "mutant".
//
//   node docs/verification/evidence/no-nav-redraw-2026-10-05/mutants.mjs <dist> <outdir>
//     -> <outdir>/same-draw   two edits: drawFortune's default random source is constant 0, so #df-again
//                             re-draws the same lines, AND the shared arm gate re-enables controls
//                             after 1ms instead of 400ms. The second edit matters: inside the arm window
//                             a freshly rendered screen carries `disabled` attributes the old screen
//                             lacked, so markup differs anyway. With both, the tap is a REAL re-render
//                             whose markup is byte-identical to the screen it replaced.
//     -> <outdir>/noop-again  #df-again's click handler does nothing: a REAL no-op tap.
import fs from 'node:fs';
import path from 'node:path';

const [dist, out] = process.argv.slice(2);
if (!dist || !out) { console.error('usage: mutants.mjs <dist> <outdir>'); process.exit(2); }

function once(text, from, to, where) {
  const n = text.split(from).length - 1;
  if (n !== 1) { console.error(`${where}: expected exactly 1 match, found ${n}`); process.exit(1); }
  return text.replace(from, to);
}

function mutate(name, edits) {
  const dir = path.join(out, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(dist, dir, { recursive: true });
  const astro = path.join(dir, '_astro');
  for (const [prefix, from, to] of edits) {
    const chunk = fs.readdirSync(astro).filter((f) => f.startsWith(prefix) && f.endsWith('.js'));
    if (chunk.length !== 1) { console.error(`${name}: ${chunk.length} ${prefix} chunks`); process.exit(1); }
    const p = path.join(astro, chunk[0]);
    fs.writeFileSync(p, once(fs.readFileSync(p, 'utf8'), from, to, chunk[0]));
    console.log(`${name}: ${chunk[0]} patched`);
  }
}

mutate('same-draw', [
  ['daily-fortune.', 'function b(e=Math.random){', 'function b(e=()=>0){'],
  ['_arm-gate.', 'setTimeout(f,400)', 'setTimeout(f,1)'],
]);
mutate('noop-again', [['daily-fortune.', 'C(o,"click",()=>w())', 'C(o,"click",()=>{})']]);
