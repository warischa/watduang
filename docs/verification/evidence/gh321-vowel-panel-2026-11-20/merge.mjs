#!/usr/bin/env node
// Merges the two vowel-panel reviews (gh#321).
//
//   node merge.mjs <key.json> <gpt.tsv> <claude.tsv> [--input input-th.tsv] [--out <dir>]
//
// Reviewer files: no header, 5 tab-separated columns `id, vowels, stored, proposed, reason`; a line that
// starts with `#` is a comment (the coverage line) and is echoed. The input defaults to input-th.tsv
// beside this script (the file the reviewers were given, planted cells included); --out defaults to this
// script's directory.
//
// Prints calibration per reviewer per class, then writes agreed-vowels.tsv and
// owner-disagreements-vowels.tsv. Any malformed line is reported and the exit code is 1 with NO output file
// written: a bad line is never dropped silently.
//   caught   = the reviewer proposed a cell that differs from the planted one for a planted row
//   restored = the proposed cell equals the true cell
// An empty cell is a legal stored value and a legal proposal; in the written files it reads `-`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOWEL_FORMS } from '../../../../src/prize-words/schema.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLASSES = ['wrong-form', 'omission', 'decomposition', 'extra'];

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const [, v] = args.splice(i, 2);
  return v;
};
const inputPath = resolve(flag('--input') ?? join(HERE, 'input-th.tsv'));
const outDir = resolve(flag('--out') ?? HERE);
if (args.length !== 3) {
  console.error('usage: merge.mjs <key.json> <gpt.tsv> <claude.tsv> [--input input-th.tsv] [--out <dir>]');
  process.exit(2);
}
const [keyPath, gptPath, claudePath] = args.map((p) => resolve(p));

const errors = [];
const bad = (where, msg) => errors.push(`malformed: ${where}: ${msg}`);

// Input: id -> { word, stored }. The line is split on tabs and never trimmed: a trailing empty cell is a value.
const inputRows = new Map();
for (const line of readFileSync(inputPath, 'utf8').split('\n').slice(1)) {
  if (line === '') continue;
  const [id, , word, stored = ''] = line.split('\t');
  inputRows.set(id, { word, stored });
}

const key = JSON.parse(readFileSync(keyPath, 'utf8'));
for (const p of key.plants) {
  const r = inputRows.get(p.id);
  if (r === undefined) bad('key', `planted id ${p.id} is not in the input`);
  else if (r.stored !== p.planted) bad('key', `${p.id}: the input cell is not the planted cell, so the key belongs to another input`);
  if (!CLASSES.includes(p.class)) bad('key', `${p.id}: unknown class ${p.class}`);
}
const plantOf = new Map(key.plants.map((p) => [p.id, p]));

function readReview(name, path) {
  const out = new Map();
  const comments = [];
  readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
    const where = `${name} line ${i + 1}`;
    if (line === '') return;
    if (line.startsWith('#')) { comments.push(line); return; }
    const cols = line.replace(/\r$/, '').split('\t');
    if (cols.length !== 5) return bad(where, `${cols.length} columns, expected 5`);
    const [id, column, , proposed, reason] = cols;
    if (!inputRows.has(id)) return bad(where, `unknown id ${JSON.stringify(id)}`);
    if (column !== 'vowels') return bad(where, `column is ${JSON.stringify(column)}, expected "vowels"`);
    if (out.has(id)) return bad(where, `a second line for ${id}`);
    const forms = proposed === '' ? [] : proposed.split('|');
    const unknown = forms.filter((f) => !VOWEL_FORMS.includes(f));
    if (unknown.length > 0) return bad(where, `${id}: proposed form not in VOWEL_FORMS: ${unknown.join(' ')}`);
    if (new Set(forms).size !== forms.length) return bad(where, `${id}: a form is proposed twice`);
    if (proposed === inputRows.get(id).stored) return bad(where, `${id}: proposed equals the stored cell, not a disagreement`);
    out.set(id, { proposed, reason });
  });
  return { rows: out, comments };
}
const reviews = { gpt: readReview('gpt', gptPath), claude: readReview('claude', claudePath) };

if (errors.length > 0) {
  for (const e of errors) console.error(e);
  console.error(`${errors.length} malformed item(s): nothing written`);
  process.exit(1);
}

// Calibration.
for (const [name, { rows, comments }] of Object.entries(reviews)) {
  for (const c of comments) console.log(`${name} ${c}`);
  for (const cls of CLASSES) {
    const mine = key.plants.filter((p) => p.class === cls);
    const caught = mine.filter((p) => rows.has(p.id) && rows.get(p.id).proposed !== p.planted);
    const restored = mine.filter((p) => rows.has(p.id) && rows.get(p.id).proposed === p.true);
    console.log(`calibration ${name} ${cls} planted=${mine.length} caught=${caught.length} restored=${restored.length}`);
    const missed = mine.filter((p) => !rows.has(p.id)).map((p) => p.id);
    if (missed.length > 0) console.log(`missed ${name} ${cls}: ${missed.join(' ')}`);
  }
  const falsePositives = [...rows.keys()].filter((id) => !plantOf.has(id)).length;
  console.log(`${name} flagged ${rows.size} rows, ${falsePositives} of them not planted`);
}

// Non-plant rows.
const dash = (cell) => (cell === '' ? '-' : cell);
const ids = [...new Set([...reviews.gpt.rows.keys(), ...reviews.claude.rows.keys()])].filter((id) => !plantOf.has(id)).sort();
const agreed = ['id\tword\tstored\tproposed'];
const owner = ['lang\tid\tcolumn\tstored\tgpt (codex)\tclaude'];
for (const id of ids) {
  const g = reviews.gpt.rows.get(id);
  const c = reviews.claude.rows.get(id);
  const { word, stored } = inputRows.get(id);
  if (g !== undefined && c !== undefined && g.proposed === c.proposed) {
    agreed.push([id, word, dash(stored), dash(g.proposed)].join('\t'));
  } else {
    const cell = (r) => (r === undefined ? '' : `${dash(r.proposed)} — ${r.reason}`);
    owner.push(['th', id, 'vowels', dash(stored), cell(g), cell(c)].join('\t'));
  }
}
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'agreed-vowels.tsv'), `${agreed.join('\n')}\n`);
writeFileSync(join(outDir, 'owner-disagreements-vowels.tsv'), `${owner.join('\n')}\n`);
console.log(`agreed ${agreed.length - 1} · owner list ${owner.length - 1}`);
