// Hash-normalised dist diff. Usage: node dist-diff.mjs <baseDist> <newDist>
// Astro names assets `_astro/<name>.<hash>.<ext>`; the hash is stripped from every filename and from
// every reference inside text files, then files are compared by normalised path and content.
import fs from 'node:fs';
import path from 'node:path';

const [base, next] = process.argv.slice(2);
const HASH = /\.[A-Za-z0-9_-]{8}\.(js|css|mjs|woff2?|svg|png|webp|jpg|json)\b/g;
const norm = (s) => s.replace(HASH, '.[hash].$1');
const TEXT = /\.(html|js|css|mjs|json|xml|txt|svg|webmanifest)$/;

function walk(root) {
  const out = new Map();
  (function rec(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else out.set(norm(path.relative(root, p)), p);
    }
  })(root);
  return out;
}

const a = walk(base), b = walk(next);
const changed = [], added = [], removed = [];
for (const k of b.keys()) if (!a.has(k)) added.push(k);
for (const k of a.keys()) if (!b.has(k)) removed.push(k);
for (const [k, p] of a) {
  if (!b.has(k)) continue;
  const q = b.get(k);
  if (TEXT.test(k)) {
    if (norm(fs.readFileSync(p, 'utf8')) !== norm(fs.readFileSync(q, 'utf8'))) changed.push(k);
  } else if (!fs.readFileSync(p).equals(fs.readFileSync(q))) changed.push(k);
}
console.log(`files base=${a.size} new=${b.size}`);
console.log(`added (${added.length}):`, added.sort());
console.log(`removed (${removed.length}):`, removed.sort());
console.log(`changed (${changed.length}):`);
for (const k of changed.sort()) console.log('  ' + k);
