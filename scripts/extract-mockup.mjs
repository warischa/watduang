// Splits a standalone mockup index.html into the three files a play route needs. Deterministic and
// byte-preserving BY DESIGN: the measured failure of hand-porting was paraphrase — freeze-tap's first
// port invented ~15 Thai strings and cost two rework rounds, while the spec-first port hit 55/55
// byte-exact (docs/agents/porting-a-mockup-game.md). A script cannot paraphrase, so the copy question
// stops being a review problem.
//
// WHY THE SCRIPT IS EXTRACTED AT ALL, rather than left inline: this site serves
// `script-src 'self'` with no 'unsafe-inline' (ADR-0005, and the CSP in public/staticwebapp.config.json).
// A mockup's inline <script> — 50-73KB of it — executes zero lines under that header. Emitting it as a
// module the bundler owns is what makes the page run at all, not a style preference.
//
// RE-EXTRACTING AN EXISTING ROUTE IS DESTRUCTIVE, not a refresh: every lifted route's markup.html has
// been hand-edited since it was lifted, and the mockups were deliberately NOT reconciled back (gh#212,
// owner ruling 2026-09-05 — the mockups stay the original design record). So nothing is written until
// preWriteRefusal has judged what this run WOULD write, on the two layers described in
// scripts/mockup-divergence-check.mjs: any file already on disk whose bytes would change, and any
// deliberate divergence recorded in src/play/_divergences.json that would be deleted. Keying the
// first one on the FILE rather than on a hand-listed fragment is what closes the hole the registry
// alone left — it only ever recorded markup.html, so hand-added main.js code was unprotected.
//
// THE WAY THROUGH is `--force <owner>`, because a guard with no legitimate path gets routed around and
// that is worse than no guard. It releases the file layer for one run only, it will not parse without
// an owner token, and it does NOT release a recorded divergence — that one is released by editing the
// committed registry, so the record of who owns a divergence and why survives every force.
//
// Usage: node scripts/extract-mockup.mjs <mockup-dir> <game-id> [--dry-run] [--force <owner>]
//   e.g. node scripts/extract-mockup.mjs ~/claude/mockup-games/cannon-flag cannon-flag
//        node scripts/extract-mockup.mjs ~/claude/mockup-games/cannon-flag cannon-flag --dry-run
//        node scripts/extract-mockup.mjs ~/claude/mockup-games/cannon-flag cannon-flag --force gh#212
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyLabels } from './play-aria-labels.mjs';
import { EXTRACTED_FILES, destructiveWrites, loadRegistry, preWriteRefusal } from './mockup-divergence-check.mjs';

/**
 * The whole extraction as a pure function: mockup HTML in, the exact bytes each of the three files
 * would receive out. Everything that decides content lives here so the divergence gate can ask what
 * a re-extraction would produce without running one. Throws on a mockup this extractor was not
 * written for — guessing past that shape is how a silent wrong port starts.
 */
export function extractFiles(html, id) {
  // One <style> and one <script> is what all three shipped mockups actually carry (measured 2026-08-29).
  // More than one is not a failure — they are concatenated in document order, which is the order a
  // browser would have applied them in anyway. Zero of either IS a failure.
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  const scripts = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/);

  if (!bodyMatch) throw new Error('no <body> found');
  if (styles.length === 0) throw new Error('no inline <style> found');
  if (scripts.length === 0) throw new Error('no inline <script> found');

  // An external resource would break the offline/CSP promise silently — the page would render and one
  // asset would just never arrive. All three mockups measured zero of these; a fourth that has one must
  // be looked at by a human, not auto-ported.
  const external = [...html.matchAll(/(?:src|href)="((?:https?:)?\/\/[^"]+)"/g)].map((m) => m[1]);
  if (external.length) {
    throw new Error(`${external.length} external resource(s), refusing: ${external.slice(0, 3).join(' ')}`);
  }

  // Inline event handlers are blocked by the same CSP as an inline <script>, and unlike the <script>
  // they cannot be lifted mechanically — each one needs a real addEventListener with the right target.
  // Reported as a COUNT to fix by hand, never rewritten here: a regex that rewrote them would be
  // guessing at scope.
  const inlineHandlers = [...bodyMatch[1].matchAll(/\son([a-z]+)=/g)].map((m) => m[1]);

  // The <body> still CONTAINS the inline <script> and <style> this extractor just lifted out. Leaving
  // them in markup.html re-embeds the very block the extraction exists to remove, and the page ships an
  // inline script again — caught by csp-inline-check on the first build, exactly as ADR-0005 intends.
  const stripLifted = (body) =>
    body
      .replace(/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/g, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');

  // Thai accessible names are re-applied to every file this script writes, from
  // src/play/_aria-labels.json — a file this script does NOT own. Without this, an aria-label typed
  // into markup.html or main.js is destroyed by the next extraction, which is exactly how ZERO_TRIGGER
  // shipped English names for three controls whose Thai titles were already correct: the mockup itself
  // carries the English, so re-extracting kept restoring it. This is the one place the output is not
  // byte-identical to the mockup body, and the deviation is bounded to adding or replacing one
  // attribute on a button the table names. It cannot reach a visible string, so the header's reason for
  // byte-preservation — a script cannot paraphrase the copy — still holds. scripts/play-icon-label-check.mjs
  // reds if a route ends up with an unnamed icon-only control either way.
  let labelled = 0;
  const render = (content) => {
    const cleaned = content.replace(/^\n+/, '').replace(/\s+$/, '') + '\n';
    const { text, changed } = applyLabels(cleaned, id);
    labelled += changed;
    return text;
  };

  const files = {
    'markup.html': render(stripLifted(bodyMatch[1])),
    'style.css': render(styles.join('\n')),
    'main.js': render(scripts.join('\n;\n')),
  };
  return {
    files,
    meta: {
      title: titleMatch ? titleMatch[1].trim() : '(none)',
      styles: styles.length,
      scripts: scripts.length,
      inlineHandlers,
      labelled,
    },
  };
}

/**
 * Which file in a mockup directory is its index, without guessing at an owner's naming habit: exact
 * `index.html` wins; else the SOLE `*.html` file present, because sole is the only property of a
 * directory that makes a guess unambiguous; else there is no index, and `reason` says why not. Pure
 * over a directory listing (not a path), so this is assertable with no disk I/O.
 */
export function resolveIndexFile(entries) {
  if (entries.includes('index.html')) return { file: 'index.html', reason: null };
  const htmlFiles = entries.filter((e) => e.endsWith('.html'));
  if (htmlFiles.length === 1) return { file: htmlFiles[0], reason: null };
  if (htmlFiles.length === 0) return { file: null, reason: 'no index.html and no other .html file' };
  return { file: null, reason: `no index.html and ${htmlFiles.length} .html files, ambiguous` };
}

export function readMockup(srcDir) {
  const dir = srcDir.replace(/^~/, process.env.HOME ?? '~');
  const { file, reason } = resolveIndexFile(fs.readdirSync(dir));
  if (!file) throw new Error(`${dir}: ${reason}`);
  return fs.readFileSync(path.join(dir, file), 'utf8');
}

async function main(argv) {
  const [srcDir, id, ...flags] = argv;
  const dryRun = flags.includes('--dry-run');
  // --force is deliberately two tokens: an owner has to be typed, so the hatch cannot be reached by
  // tab-completing a flag, and the run's output names who took the decision.
  const forceAt = flags.indexOf('--force');
  const forcedBy = forceAt === -1 ? null : flags[forceAt + 1];
  if (forceAt !== -1 && (!forcedBy || forcedBy.startsWith('--'))) {
    console.error('::error::--force needs an owner: --force gh#212 (who is taking responsibility for overwriting hand-added code)');
    return 2;
  }
  if (!srcDir || !id) {
    console.error('usage: node scripts/extract-mockup.mjs <mockup-dir> <game-id> [--dry-run]');
    return 2;
  }
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error(`::error::game id must be kebab-case: ${id}`);
    return 2;
  }

  let extracted;
  try {
    extracted = extractFiles(readMockup(srcDir), id);
  } catch (err) {
    console.error(`::error::${srcDir}: ${err.message}`);
    return 1;
  }
  const { files, meta } = extracted;

  // The guard runs BEFORE any write: a refusal that fired after the first fs.writeFileSync would
  // already have destroyed what it exists to protect. A --dry-run refuses too — the refusal message
  // names every file and fragment at stake, so it IS the inspection a dry run was there to give.
  const outDir = path.join('src/play', id);
  const registry = loadRegistry();
  const shipped = Object.fromEntries(
    EXTRACTED_FILES.map((name) => {
      const p = path.join(outDir, name);
      return [name, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null];
    }),
  );
  const { lost, destructive } = preWriteRefusal(registry, id, files, shipped, forcedBy);
  if (lost.length) {
    console.error(`::error::extract-mockup: refusing to re-extract ${id} — ${lost.length} recorded divergence(s) would be deleted`);
    for (const { name, entry } of lost) {
      console.error(`  ${id}/${name} would lose (owner ${entry.owner}): ${entry.fragment}`);
      console.error(`    why it is deliberate: ${entry.why}`);
    }
    console.error('  --force cannot release these. Re-apply the fragment by hand after extracting, or drop its entry from src/play/_divergences.json with a reason (gh#212).');
    return 1;
  }
  if (destructive.length) {
    console.error(`::error::extract-mockup: refusing to re-extract ${id} — ${destructive.length} file(s) this repo ships would be overwritten`);
    for (const name of destructive) {
      console.error(`  ${outDir}/${name}: ${Buffer.byteLength(shipped[name])}B on disk -> ${Buffer.byteLength(files[name])}B from the mockup`);
    }
    console.error('  Every one of these has been hand-edited since it was lifted, and the mockups are never reconciled back (gh#212).');
    console.error(`  Record what is deliberate in src/play/_divergences.json (fragment + owner + why), then re-run with: --force <owner>`);
    return 1;
  }
  const forcedOver = forcedBy ? destructiveWrites(files, shipped) : [];
  if (forcedOver.length) {
    console.log(`extract-mockup: FORCED by ${forcedBy} — overwriting ${forcedOver.join(', ')} in ${outDir}`);
  }

  const written = [];
  if (!dryRun) fs.mkdirSync(outDir, { recursive: true });
  for (const name of EXTRACTED_FILES) {
    const p = path.join(outDir, name);
    if (dryRun) {
      const same = fs.existsSync(p) && fs.readFileSync(p, 'utf8') === files[name];
      written.push(`${p} ${Buffer.byteLength(files[name])}B ${same ? 'identical' : 'WOULD CHANGE'}`);
      continue;
    }
    fs.writeFileSync(p, files[name], 'utf8');
    written.push(`${p} ${fs.statSync(p).size}B`);
  }

  console.log(`extract-mockup: ${id}${dryRun ? ' (dry run, nothing written)' : ''}`);
  for (const line of written) console.log(`  ${line}`);
  console.log(`  title: ${meta.title}`);
  console.log(`  <style> blocks: ${meta.styles} · inline <script> blocks: ${meta.scripts} · external resources: 0`);
  console.log(`  Thai aria-labels re-applied from src/play/_aria-labels.json: ${meta.labelled}`);
  console.log(`  recorded divergences that would survive: ${(registry[id] ? Object.values(registry[id]).flat() : []).length}`);
  if (meta.inlineHandlers.length) {
    console.log(`  INLINE HANDLERS TO REWRITE BY HAND: ${meta.inlineHandlers.length} (${[...new Set(meta.inlineHandlers)].join(', ')}) — CSP blocks every one`);
  } else {
    console.log('  inline handlers: 0 — nothing to rewrite');
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // .then rather than a top-level await, so that importing this file can never block on a pending
  // module body — the divergence gate imports it and a stalled body exits 13 having measured nothing.
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
