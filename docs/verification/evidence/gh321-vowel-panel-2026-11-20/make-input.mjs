#!/usr/bin/env node
// Builds the blind reviewer input for the Thai vowel-cell panel (gh#321).
//
//   node make-input.mjs <key-path> [salt]
//
// Writes input-th.tsv next to this script: every unretired Thai word, sorted by id, columns
// id, pool, word, vowels (the stored array joined with `|`). Exactly 20 cells are then replaced by a
// wrong-but-plausible cell, 5 per class, and the key (id, class, true cell, planted cell) goes ONLY to
// <key-path>, which must sit outside the repository: reviewers can read the repo, never the key.
//
// The first run needs a salt (it picks the plants); the salt is stored in the key file and read back
// from it on later runs, so a second run with only the key path reproduces the same bytes. No
// clock and no random source is read.
//
// Oracle: every plant must still pass the bank oracle's vowel check, or it calibrates nothing. The check
// is not copied: it is sliced out of the oracle test at run time (the test file cannot be imported, it
// would run its whole suite), each anchor must occur exactly once, and the slice is evaluated with the
// real TONE_MARKS and VOWEL_FORMS. A moved anchor fails loudly instead of testing a stale copy.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANK_TH } from '../../../../src/prize-words/bank-th.ts';
import { POOLS, TONE_MARKS, VOWEL_FORMS } from '../../../../src/prize-words/schema.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const ORACLE = join(ROOT, 'src/prize-words/bank-oracle.test.mjs');
const INSTRUCTIONS = join(HERE, 'instructions-th.md');
const OUT = join(HERE, 'input-th.tsv');

const CLASSES = ['wrong-form', 'omission', 'decomposition', 'extra'];
const PER_CLASS = 5;
// The four forms the schema gained for this panel. A word whose text places any of them is left out of
// the plants (its stored cell predates the forms and may be stale), and no plant uses one.
const NEW_FORMS = ['-ือ', '-ว', 'เ-ย', '-รร'];
// A compound form split into smaller listed forms. The SARA UA form (vowel sign plus WO WAEN) is left out:
// WO WAEN alone is not a listed form, so splitting it would drop a letter rather than split a form. The SARA E
// plus O ANG form is left out: the oracle refuses a bare O ANG right after SARA E.
const SPLITS = {
  'เ-ือ': ['เ-', '-ื'], 'เ-ีย': ['เ-', '-ี'], 'เ-า': ['เ-', '-า'], 'เ-ิ': ['เ-', '-ิ'],
  'เ-าะ': ['เ-', '-า', '-ะ'], 'เ-ียะ': ['เ-', '-ี', '-ะ'], 'เ-ือะ': ['เ-', '-ื', '-ะ'],
  'เ-ะ': ['เ-', '-ะ'], 'แ-ะ': ['แ-', '-ะ'], 'โ-ะ': ['โ-', '-ะ'],
};

const die = (msg) => { console.error(`make-input: ${msg}`); process.exit(1); };
const sha = (s) => createHash('sha256').update(s).digest('hex');

// ---- The oracle's own vowel check, sliced from its source ---------------------------------------
function slice(src, from, to) {
  for (const a of [from, to]) {
    const n = src.split(a).length - 1;
    if (n !== 1) die(`oracle anchor ${JSON.stringify(a)} occurs ${n} times in the oracle test (need exactly 1)`);
  }
  const i = src.indexOf(from);
  const j = src.indexOf(to);
  if (j <= i) die(`oracle anchors out of order: ${JSON.stringify(from)} / ${JSON.stringify(to)}`);
  return src.slice(i, j);
}
const oracleSrc = readFileSync(ORACLE, 'utf8');
const tables = slice(oracleSrc, 'const CONSONANT_CLASSES', '// ---- Derivation');
const vowelCheck = slice(oracleSrc, '// Where a vowel form may sit', 'const show =');
const { checkVowels, placement } = new Function(
  'TONE_MARKS', 'VOWEL_FORMS',
  `${tables}\n${vowelCheck}\nreturn { checkVowels, placement };`,
)(TONE_MARKS, VOWEL_FORMS);
const oraclePasses = (text, vowels) => {
  let rejected = false;
  checkVowels({ id: 'probe', text, vowels }, () => { rejected = true; });
  return !rejected;
};

// ---- Key path, salt ----------------------------------------------------------------------------
const keyArg = process.argv[2];
if (!keyArg) die('usage: make-input.mjs <key-path> [salt]');
const keyPath = resolve(keyArg);
if (keyPath === ROOT || keyPath.startsWith(ROOT + sep)) die('the key path must be outside the repository');
let salt = process.argv[3];
if (existsSync(keyPath)) {
  const stored = JSON.parse(readFileSync(keyPath, 'utf8')).salt;
  if (typeof stored !== 'string' || stored === '') die('the existing key file carries no salt');
  if (salt !== undefined && salt !== stored) die('the salt argument differs from the one in the existing key file');
  salt = stored;
}
if (typeof salt !== 'string' || salt === '') die('no key file yet: pass a salt as the second argument');

// ---- The rows ------------------------------------------------------------------------------------
const rows = [];
for (const pool of POOLS) for (const w of BANK_TH[pool]) if (w.retired !== true) rows.push({ id: w.id, pool, text: w.text, vowels: [...w.vowels] });
rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
if (new Set(rows.map((r) => r.id)).size !== rows.length) die('duplicate ids in the unretired bank');
const baseBad = rows.filter((r) => !oraclePasses(r.text, r.vowels));
if (baseBad.length > 0) die(`stored cells already rejected by the oracle: ${baseBad.map((r) => r.id).join(' ')}`);

// ---- Plants ----------------------------------------------------------------------------------------
const signsOf = (form) => [...form].filter((c) => c !== '-');
const subset = (a, b) => a.every((c) => b.includes(c));
const appearance = (text, form) => text.search(placement(form));
// Insert at the position of first appearance, so the plant carries one error and no ordering error.
function insertInOrder(text, list, form) {
  const at = appearance(text, form);
  let k = list.length;
  for (let i = 0; i < list.length; i++) if (appearance(text, list[i]) > at) { k = i; break; }
  return [...list.slice(0, k), form, ...list.slice(k)];
}
const usable = (form) => !NEW_FORMS.includes(form);

const candidatesFor = {
  'wrong-form': (r) => {
    const out = [];
    r.vowels.forEach((a, i) => {
      for (const b of VOWEL_FORMS) {
        if (!usable(b) || r.vowels.includes(b) || subset(signsOf(b), signsOf(a))) continue;
        out.push(r.vowels.map((f, j) => (j === i ? b : f)));
      }
    });
    return out;
  },
  omission: (r) => r.vowels.map((_, i) => r.vowels.filter((__, j) => j !== i)),
  decomposition: (r) => r.vowels.flatMap((a, i) => {
    const parts = SPLITS[a];
    if (parts === undefined || parts.some((p) => r.vowels.includes(p))) return [];
    return [[...r.vowels.slice(0, i), ...parts, ...r.vowels.slice(i + 1)]];
  }),
  extra: (r) => VOWEL_FORMS.filter((b) => usable(b) && !r.vowels.includes(b)).map((b) => insertInOrder(r.text, r.vowels, b)),
};

const stale = (r) => NEW_FORMS.some((f) => placement(f).test(r.text));
const used = new Set();
const plants = [];
for (const cls of CLASSES) {
  const ranked = rows
    .filter((r) => !used.has(r.id) && !stale(r))
    .map((r) => ({ r, h: sha(`${salt}:${cls}:${r.id}`) }))
    .sort((a, b) => (a.h < b.h ? -1 : 1));
  let taken = 0;
  for (const { r } of ranked) {
    if (taken === PER_CLASS) break;
    const ok = candidatesFor[cls](r)
      .filter((cell) => oraclePasses(r.text, cell) && cell.join('|') !== r.vowels.join('|'))
      .map((cell) => ({ cell, h: sha(`${salt}:${cls}:${r.id}:${cell.join('|')}`) }))
      .sort((a, b) => (a.h < b.h ? -1 : 1));
    if (ok.length === 0) continue;
    used.add(r.id);
    plants.push({ id: r.id, class: cls, true: r.vowels.join('|'), planted: ok[0].cell.join('|'), text: r.text });
    taken++;
  }
  if (taken !== PER_CLASS) die(`only ${taken} ${cls} plants found`);
}

// ---- Proof that the plants calibrate something ---------------------------------------------------
const rejected = plants.filter((p) => !oraclePasses(p.text, p.planted === '' ? [] : p.planted.split('|')));
if (plants.length !== CLASSES.length * PER_CLASS || new Set(plants.map((p) => p.id)).size !== plants.length) die('plant set is not 20 distinct ids');
if (rejected.length > 0) die(`plants the oracle rejects: ${rejected.map((p) => p.id).join(' ')}`);
console.log(`oracle: ${plants.length - rejected.length}/${plants.length} plants pass checkVowels; ${rows.length - baseBad.length}/${rows.length} stored cells pass`);
// Controls: the same check must reject a cell it is known to reject and accept one it is known to accept.
const rejectsKnownBad = !oraclePasses('เสือ', ['เ-', '-ือ']);
const acceptsKnownGood = oraclePasses('เสือ', ['เ-ือ']);
if (!rejectsKnownBad || !acceptsKnownGood) die('oracle controls failed: the check is not discriminating');
console.log('oracle controls: rejects the known-bad cell, accepts the known-good cell');

// ---- Write ----------------------------------------------------------------------------------------
const planted = new Map(plants.map((p) => [p.id, p.planted]));
const lines = ['id\tpool\tword\tvowels', ...rows.map((r) => `${r.id}\t${r.pool}\t${r.text}\t${planted.has(r.id) ? planted.get(r.id) : r.vowels.join('|')}`)];
writeFileSync(OUT, `${lines.join('\n')}\n`);
mkdirSync(dirname(keyPath), { recursive: true });
writeFileSync(keyPath, `${JSON.stringify({ salt, plants: plants.map(({ id, class: c, true: t, planted: p }) => ({ id, class: c, true: t, planted: p })) }, null, 1)}\n`);

// ---- The instructions embed the live form list --------------------------------------------------
const embedded = readFileSync(INSTRUCTIONS, 'utf8').split('\n').find((l) => l.startsWith('Forms: '));
if (embedded === undefined) die('instructions-th.md has no "Forms: " line');
const listed = embedded.slice('Forms: '.length).trim().split(/\s+/);
if (listed.join(' ') !== VOWEL_FORMS.join(' ')) die('the form list embedded in instructions-th.md differs from VOWEL_FORMS');

console.log(`wrote ${OUT.slice(HERE.length + 1)}: ${rows.length} data rows, sha256 ${sha(`${lines.join('\n')}\n`)}`);
console.log(`plants: ${CLASSES.map((c) => `${c} ${plants.filter((p) => p.class === c).length}`).join(' · ')}; key written to the given path`);
