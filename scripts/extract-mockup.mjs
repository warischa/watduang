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
// Usage: node scripts/extract-mockup.mjs <mockup-dir> <game-id>
//   e.g. node scripts/extract-mockup.mjs ~/claude/mockup-games/cannon-flag cannon-flag
import fs from 'node:fs';
import path from 'node:path';
import { applyLabels } from './play-aria-labels.mjs';

const [, , srcDir, id] = process.argv;
if (!srcDir || !id) {
  console.error('usage: node scripts/extract-mockup.mjs <mockup-dir> <game-id>');
  process.exit(2);
}
if (!/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error(`::error::game id must be kebab-case: ${id}`);
  process.exit(2);
}

const htmlPath = path.join(srcDir.replace(/^~/, process.env.HOME ?? '~'), 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// One <style> and one <script> is what all three shipped mockups actually carry (measured 2026-08-29).
// More than one is not a failure — they are concatenated in document order, which is the order a
// browser would have applied them in anyway. Zero of either IS a failure: it means this file is not
// the shape this extractor was written for, and guessing past that is how a silent wrong port starts.
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
const scripts = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/);

const fail = (msg) => {
  console.error(`::error::${msg}`);
  process.exit(1);
};
if (!bodyMatch) fail(`${htmlPath}: no <body> found`);
if (styles.length === 0) fail(`${htmlPath}: no inline <style> found`);
if (scripts.length === 0) fail(`${htmlPath}: no inline <script> found`);

// An external resource would break the offline/CSP promise silently — the page would render and one
// asset would just never arrive. All three mockups measured zero of these; a fourth that has one must
// be looked at by a human, not auto-ported.
const external = [...html.matchAll(/(?:src|href)="((?:https?:)?\/\/[^"]+)"/g)].map((m) => m[1]);
if (external.length) fail(`${htmlPath}: ${external.length} external resource(s), refusing: ${external.slice(0, 3).join(' ')}`);

// Inline event handlers are blocked by the same CSP as an inline <script>, and unlike the <script>
// they cannot be lifted mechanically — each one needs a real addEventListener with the right target.
// Reported as a COUNT to fix by hand, never rewritten here: a regex that rewrote them would be
// guessing at scope.
const inlineHandlers = [...bodyMatch[1].matchAll(/\son([a-z]+)=/g)].map((m) => m[1]);

const outDir = path.join('src/play', id);
fs.mkdirSync(outDir, { recursive: true });
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
const write = (name, content) => {
  const p = path.join(outDir, name);
  const cleaned = content.replace(/^\n+/, '').replace(/\s+$/, '') + '\n';
  const { text, changed } = applyLabels(cleaned, id);
  labelled += changed;
  fs.writeFileSync(p, text, 'utf8');
  return `${p} ${fs.statSync(p).size}B`;
};

const out = [
  write('markup.html', stripLifted(bodyMatch[1])),
  write('style.css', styles.join('\n')),
  write('main.js', scripts.join('\n;\n')),
];

console.log(`extract-mockup: ${id}`);
for (const line of out) console.log(`  ${line}`);
console.log(`  title: ${titleMatch ? titleMatch[1].trim() : '(none)'}`);
console.log(`  <style> blocks: ${styles.length} · inline <script> blocks: ${scripts.length} · external resources: 0`);
console.log(`  Thai aria-labels re-applied from src/play/_aria-labels.json: ${labelled}`);
if (inlineHandlers.length) {
  console.log(`  INLINE HANDLERS TO REWRITE BY HAND: ${inlineHandlers.length} (${[...new Set(inlineHandlers)].join(', ')}) — CSP blocks every one`);
} else {
  console.log('  inline handlers: 0 — nothing to rewrite');
}
