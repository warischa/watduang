// node --test — the word-bank oracle (gh#311). Every spelling-level attribute in the banks is stored
// data; this file re-derives each one from the written word and fails on any cell that disagrees,
// naming the word and the attribute. The derivation lives ONLY here: runtime modules under
// src/prize-words hold data and types, and a tripwire below keeps them that way. Judged attributes
// (syllables, live/dead, vowel forms, word type, pool, workplace-safe) cannot be derived; the oracle
// checks only their shape and the rules that tie them to eligibility. Definitions:
// docs/design/prize-words-spec.md. Invisible and combining characters are written as escapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { BANK_REVISION, POOLS, TONE_MARKS, VOWEL_FORMS, THAI_FAMILIES, ENGLISH_FAMILIES } from './schema.ts';
import { BANK_TH } from './bank-th.ts';
import { BANK_EN } from './bank-en.ts';

// ---- The fixed tables ---------------------------------------------------------------------------

// The 44 consonants by class. U+0E24 and U+0E26 sit inside the consonant block but are vowels here.
const CONSONANT_CLASSES = {
  high: 'ขฃฉฐถผฝศษสห',
  mid: 'กจฎฏดตบปอ',
  low: 'คฅฆงชซฌญฑฒณทธนพฟภมยรลวฬฮ',
};
const CLASS_OF = new Map(Object.entries(CONSONANT_CLASSES).flatMap(([cls, s]) => [...s].map((c) => [c, cls])));

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i));
// Vowel signs that may be written: U+0E30..U+0E39, the leading vowels U+0E40..U+0E44, and U+0E47.
const THAI_VOWEL_SIGNS = new Set([...range(0x0e30, 0x0e39), ...range(0x0e40, 0x0e44), '\u0E47']);
const KARAN = '\u0E4C';
const ALLOWED_TH = new Set([...CLASS_OF.keys(), ...THAI_VOWEL_SIGNS, ...TONE_MARKS, KARAN]);
const ALLOWED_EN = new Set(range(0x61, 0x7a));

// Gambling and alcohol words (CONTEXT.md _Avoid_ plus alcohol). Thai has no word boundaries, so a Thai
// entry matches as a substring; an English entry matches the whole word only.
const AVOID_TH = ['หวย', 'ลอตเตอรี่', 'เสี่ยงโชค', 'ไพ่ป๊อก', 'แทง', 'เดิมพัน', 'ไฮโล', 'พนัน', 'เหล้า', 'เบียร์', 'ไวน์'];
const AVOID_EN = new Set(['lottery', 'bet', 'gamble', 'gambling', 'casino', 'poker', 'beer', 'wine', 'whisky', 'vodka']);

const isMark = (c) => /\p{Mn}/u.test(c);
const byCodepoint = (a, b) => a.codePointAt(0) - b.codePointAt(0);

// ---- Derivation (test-only) ---------------------------------------------------------------------

const TH_SPELLING = ['firstChar', 'firstConsonant', 'lastChar', 'letters', 'toneMarks', 'karan', 'length', 'consonantClass'];
const EN_SPELLING = ['firstChar', 'lastChar', 'letters', 'length', 'doubleLetter'];

function deriveThai(text) {
  const cps = [...text];
  const firstConsonant = cps.find((c) => CLASS_OF.has(c)) ?? null;
  return {
    firstChar: cps[0],
    firstConsonant,
    lastChar: cps[cps.length - 1],
    letters: [...new Set(cps)].sort(byCodepoint),
    toneMarks: TONE_MARKS.filter((m) => cps.includes(m)),
    karan: cps.includes(KARAN),
    length: cps.length,
    consonantClass: firstConsonant === null ? null : CLASS_OF.get(firstConsonant),
  };
}

function deriveEnglish(text) {
  const cps = [...text];
  return {
    firstChar: cps[0],
    lastChar: cps[cps.length - 1],
    letters: [...new Set(cps)].sort(byCodepoint),
    length: cps.length,
    doubleLetter: cps.some((c, i) => i > 0 && c === cps[i - 1]),
  };
}

/** Spelling families a word must be eligible for: every one, except Thai `lastChar` when the word ends in a mark. */
function spellingEligibility(lang, text) {
  if (lang === 'en') return new Set(EN_SPELLING);
  const cps = [...text];
  return new Set(TH_SPELLING.filter((f) => f !== 'lastChar' || !isMark(cps[cps.length - 1])));
}

const LANG = {
  th: { derive: deriveThai, spelling: TH_SPELLING, families: THAI_FAMILIES, allowed: ALLOWED_TH },
  en: { derive: deriveEnglish, spelling: EN_SPELLING, families: ENGLISH_FAMILIES, allowed: ALLOWED_EN },
};

// ---- The oracle ---------------------------------------------------------------------------------

/** Every disagreement in a bank, as { id, attr, stored, derived }, plus how many spelling cells it compared. */
function checkBank(lang, bank) {
  const L = LANG[lang];
  const findings = [];
  const add = (id, attr, stored, derived) => findings.push({ id, attr, stored, derived });
  let compared = 0;
  const seenText = new Map();
  if (!isDeepStrictEqual(Object.keys(bank).sort(), [...POOLS].sort())) add('(bank)', 'pools', Object.keys(bank), POOLS);
  for (const pool of POOLS) {
    for (const [i, w] of (bank[pool] ?? []).entries()) {
      const id = w.id;
      const wantId = `${lang}-${pool}-${String(i + 1).padStart(3, '0')}`;
      if (id !== wantId) add(id, 'id', id, wantId);
      const text = w.text;
      if (typeof text !== 'string' || text.length === 0) {
        add(id, 'codepoints', text, 'a non-empty string');
        continue;
      }
      if (seenText.has(text)) add(id, 'text', text, `unique; also ${seenText.get(text)}`);
      seenText.set(text, id);
      const bad = [...text].filter((c) => !L.allowed.has(c));
      if (text !== text.normalize('NFC') || bad.length > 0) {
        add(id, 'codepoints', bad.map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`), 'allowed list, NFC');
      }

      const derived = L.derive(text);
      for (const attr of L.spelling) {
        compared += 1;
        if (!isDeepStrictEqual(w[attr], derived[attr])) add(id, attr, w[attr], derived[attr]);
      }

      // Eligibility: a known family list in canonical order; spelling families exactly as derived;
      // a judged family only where the judged value exists.
      const elig = Array.isArray(w.eligible) ? w.eligible : [];
      const canonical = L.families.filter((f) => elig.includes(f));
      if (!isDeepStrictEqual(elig, canonical)) add(id, 'eligible', elig, canonical);
      const mustSpell = spellingEligibility(lang, text);
      for (const f of L.spelling) {
        if (elig.includes(f) !== mustSpell.has(f)) add(id, 'eligible', `${f}:${elig.includes(f)}`, `${f}:${mustSpell.has(f)}`);
      }
      if (elig.includes('syllables') && w.syllables === null) add(id, 'eligible', 'syllables', 'syllables is null');
      if (elig.includes('liveDead') && w.liveDead === null) add(id, 'eligible', 'liveDead', 'liveDead is null');

      // Judged cells: shape and cross-rules only.
      if (!(w.syllables === null || (Number.isInteger(w.syllables) && w.syllables >= 1 && w.syllables <= 12))) {
        add(id, 'syllables', w.syllables, 'null or an integer 1..12');
      }
      if (lang === 'th') {
        if (!(w.liveDead === null || w.liveDead === 'live' || w.liveDead === 'dead')) add(id, 'liveDead', w.liveDead, 'live | dead | null');
        else if (w.liveDead !== null && w.syllables !== 1) add(id, 'liveDead', w.liveDead, 'null unless one syllable');
        checkVowels(w, add);
      } else if (!['noun', 'verb', 'adjective'].includes(w.wordType)) {
        add(id, 'wordType', w.wordType, 'noun | verb | adjective');
      }
      if (w.workplaceSafe !== true) add(id, 'workplaceSafe', w.workplaceSafe, true);
      const avoided = lang === 'th' ? AVOID_TH.find((a) => text.includes(a)) : AVOID_EN.has(text) ? text : undefined;
      if (avoided !== undefined) add(id, 'workplaceSafe', text, `contains avoided word ${avoided}`);
      if (w.review !== 'pending' && w.review !== 'reviewed') add(id, 'review', w.review, 'pending | reviewed');
      if (w.retired !== undefined && w.retired !== true) add(id, 'retired', w.retired, 'true or absent');
    }
  }
  return { findings, compared };
}

/** Vowel forms are judged; the oracle checks only that each is known, listed once, written in the word,
 *  and that every vowel sign written in the word belongs to some listed form. */
function checkVowels(w, add) {
  const v = Array.isArray(w.vowels) ? w.vowels : [];
  const signsOf = (form) => [...form].filter((c) => c !== '-');
  const known = v.every((f) => VOWEL_FORMS.includes(f)) && new Set(v).size === v.length;
  const written = v.every((f) => signsOf(f).every((c) => w.text.includes(c)));
  const covered = new Set(v.flatMap(signsOf));
  const uncovered = [...w.text].filter((c) => THAI_VOWEL_SIGNS.has(c) && !covered.has(c));
  if (!Array.isArray(w.vowels) || !known || !written || uncovered.length > 0) add(w.id, 'vowels', w.vowels, { uncovered });
}

const show = (f) => `${f.id} ${f.attr}: stored ${JSON.stringify(f.stored)} derived ${JSON.stringify(f.derived)}`;
const keys = (r) => r.findings.map((f) => `${f.id}:${f.attr}`);
const wordCount = (bank) => POOLS.reduce((n, p) => n + bank[p].length, 0);

// ---- The real banks -----------------------------------------------------------------------------

for (const [lang, bank] of [['th', BANK_TH], ['en', BANK_EN]]) {
  test(`${lang} bank: every stored cell agrees with the oracle`, () => {
    const r = checkBank(lang, bank);
    assert.deepEqual(r.findings.map(show), []);
    // A no-op oracle compares nothing: pin the number of cells it actually compared.
    assert.ok(wordCount(bank) > 0, 'empty bank');
    assert.equal(r.compared, wordCount(bank) * LANG[lang].spelling.length);
  });

  test(`${lang} bank: every pool holds words`, () => {
    for (const p of POOLS) assert.ok(bank[p].length > 0, `${lang} pool ${p} is empty`);
  });
}

// ---- The tables and the derivation, pinned by hand ----------------------------------------------

test('consonant table: 44 consonants, 11 high / 9 mid / 24 low, the consonant block minus U+0E24 and U+0E26', () => {
  const sizes = Object.fromEntries(Object.entries(CONSONANT_CLASSES).map(([k, s]) => [k, [...s].length]));
  assert.deepEqual(sizes, { high: 11, mid: 9, low: 24 });
  assert.equal(CLASS_OF.size, 44, 'a consonant listed in two classes');
  const block = range(0x0e01, 0x0e2e).filter((c) => c !== '\u0E24' && c !== '\u0E26');
  assert.deepEqual([...CLASS_OF.keys()].sort(byCodepoint), block);
});

test('golden: a leading vowel is the first character but never the first consonant', () => {
  const d = deriveThai('เก้าอี้');
  assert.equal(d.firstChar, '\u0E40');
  assert.equal(d.firstConsonant, 'ก');
  assert.equal(d.consonantClass, 'mid');
  assert.equal(d.lastChar, '\u0E49');
  assert.deepEqual(d.toneMarks, ['\u0E49'], 'the same mark twice is one entry');
  assert.equal(d.length, 7);
  assert.equal(spellingEligibility('th', 'เก้าอี้').has('lastChar'), false, 'ends in a mark');
});

test('golden: a leading high consonant gives the class of that written consonant', () => {
  const d = deriveThai('หมา');
  assert.equal(d.firstConsonant, 'ห');
  assert.equal(d.consonantClass, 'high');
});

test('golden: the karan mark, stacked marks and SARA AM', () => {
  const j = deriveThai('จันทร์');
  assert.equal(j.karan, true);
  assert.equal(j.lastChar, KARAN);
  assert.equal(spellingEligibility('th', 'จันทร์').has('lastChar'), false);
  const t = deriveThai('ที่');
  assert.equal(t.length, 3, 'codepoints, not the one grapheme cluster');
  assert.deepEqual(t.toneMarks, ['\u0E48']);
  assert.deepEqual(deriveThai('กุ้ง').letters, ['ก', 'ง', '\u0E38', '\u0E49']);
  const n = deriveThai('น้ำ');
  assert.equal(n.lastChar, '\u0E33');
  assert.equal(spellingEligibility('th', 'น้ำ').has('lastChar'), true, 'SARA AM is a spacing letter');
  assert.deepEqual(deriveThai('เป็ด').toneMarks, [], 'U+0E47 is not a tone mark');
  assert.equal(deriveThai('ฤดู').firstConsonant, 'ด', 'U+0E24 is not in the consonant table');
});

test('golden: English double letter and letter set', () => {
  assert.equal(deriveEnglish('coffee').doubleLetter, true);
  assert.deepEqual(deriveEnglish('coffee').letters, ['c', 'e', 'f', 'o']);
  assert.equal(deriveEnglish('banana').doubleLetter, false, 'repeated but never adjacent');
});

// ---- Must-red: one planted wrong cell per kind, caught by name ----------------------------------

const find = (bank, id) => POOLS.flatMap((p) => bank[p]).find((w) => w.id === id);
const idOf = (bank, text) => POOLS.flatMap((p) => bank[p]).find((w) => w.text === text)?.id;

/** A copy of the bank with one word patched. A patch may be a function of the original word. */
function plant(bank, text, patch) {
  const copy = structuredClone(bank);
  const w = POOLS.flatMap((p) => copy[p]).find((x) => x.text === text);
  assert.ok(w, `fixture word ${text} is not in the bank`);
  Object.assign(w, typeof patch === 'function' ? patch(w) : patch);
  return copy;
}

/** A patch that changes the text and keeps every spelling cell consistent with it, so only the
 *  check under test can see the plant. */
const consistent = (lang, text, extra = {}) => ({ text, ...LANG[lang].derive(text), ...extra });

const exactlyOne = [
  // [lang, word, patch, attribute that must be named]
  ['th', 'เก้าอี้', { firstChar: 'ก' }, 'firstChar'],
  ['th', 'เก้าอี้', { firstConsonant: '\u0E40' }, 'firstConsonant'],
  ['th', 'หมา', { firstConsonant: 'ม' }, 'firstConsonant'],
  ['th', 'จันทร์', { lastChar: 'ร' }, 'lastChar'],
  ['th', 'กุ้ง', (w) => ({ letters: w.letters.map((c) => (c === 'ง' ? 'น' : c)) }), 'letters'],
  ['th', 'กุ้ง', { toneMarks: ['\u0E48'] }, 'toneMarks'],
  ['th', 'จันทร์', { karan: false }, 'karan'],
  ['th', 'ที่', { length: 1 }, 'length'],
  ['th', 'หมา', { consonantClass: 'low' }, 'consonantClass'],
  ['th', 'น้ำ', consistent('th', 'น้\u0E4D\u0E32', { vowels: ['-\u0E32'] }), 'codepoints'],
  ['th', 'น้ำ', consistent('th', 'น้ำ\u200B'), 'codepoints'],
  ['th', 'จันทร์', (w) => ({ eligible: THAI_FAMILIES.filter((f) => w.eligible.includes(f) || f === 'lastChar') }), 'eligible'],
  ['th', 'หมา', consistent('th', 'หวย', { vowels: [] }), 'workplaceSafe'],
  ['th', 'ตลาด', { liveDead: 'dead' }, 'liveDead'],
  ['th', 'หมา', { vowels: ['-\u0E39'] }, 'vowels'],
  ['en', 'apple', { firstChar: 'b' }, 'firstChar'],
  ['en', 'apple', { lastChar: 'l' }, 'lastChar'],
  ['en', 'apple', { letters: ['a', 'e', 'l', 'q'] }, 'letters'],
  ['en', 'apple', { length: 6 }, 'length'],
  ['en', 'coffee', { doubleLetter: false }, 'doubleLetter'],
  ['en', 'zebra', { doubleLetter: true }, 'doubleLetter'],
  ['en', 'zebra', consistent('en', 'Zebra'), 'codepoints'],
  ['en', 'zebra', consistent('en', 'casino'), 'workplaceSafe'],
  ['en', 'eat', { wordType: 'adverb' }, 'wordType'],
];

for (const [lang, text, patch, attr] of exactlyOne) {
  test(`must-red ${lang} ${attr}: a wrong cell on ${JSON.stringify(text)} is named`, () => {
    const bank = lang === 'th' ? BANK_TH : BANK_EN;
    const id = idOf(bank, text);
    const r = checkBank(lang, plant(bank, text, patch));
    assert.deepEqual(keys(r), [`${id}:${attr}`], r.findings.map(show).join('\n'));
  });
}

test('must-red id: reordering a pool renames positions, so the append-only order is checked', () => {
  const copy = structuredClone(BANK_TH);
  copy.animal.reverse();
  const r = checkBank('th', copy);
  assert.ok(r.findings.length >= 2 && r.findings.every((f) => f.attr === 'id'), r.findings.map(show).join('\n'));
});

test('must-red text: the same word twice in one language is named', () => {
  const copy = structuredClone(BANK_EN);
  const dup = { ...copy.animal[0], id: `en-office-${String(copy.office.length + 1).padStart(3, '0')}` };
  copy.office.push(dup);
  // Pools are walked in POOLS order, so the animal original is the second sighting; the finding names both.
  const r = checkBank('en', copy);
  assert.deepEqual(keys(r), [`${copy.animal[0].id}:text`]);
  assert.match(r.findings[0].derived, new RegExp(dup.id));
});

test('the fixture words exist (a missing one would make its must-red vacuous)', () => {
  for (const [lang, text] of exactlyOne) assert.ok(idOf(lang === 'th' ? BANK_TH : BANK_EN, text), `${lang} ${text}`);
  assert.ok(find(BANK_TH, idOf(BANK_TH, 'ตลาด')).syllables > 1, 'the liveDead plant needs a multi-syllable word');
});

// ---- Runtime modules hold data and types only ---------------------------------------------------

// An allow-list over the TypeScript AST, not a pattern: every top-level statement must be a type or
// interface declaration, an `import type`, or a `const` whose initializer is a literal tree. A literal
// tree is an object, array, string, number, boolean or null, `as const`, a spread of a same-file
// literal const, or an identifier naming one. Anything else (calls, property or element reads,
// functions, classes, templates, a non-type import) is logic and is rejected.

/** Offending statements in one module's source, as "line: text" strings; empty means data and types only. */
function logicIn(src, name = 'module.ts') {
  const sf = ts.createSourceFile(name, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const bad = [];
  const literalConsts = new Set();
  const reject = (n) => bad.push(`${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: ${n.getText(sf).slice(0, 80)}`);
  const refToLiteral = (n) => ts.isIdentifier(n) && literalConsts.has(n.text);
  const exportOnly = (s) => (s.modifiers ?? []).every((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const literal = (n) => {
    if (ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return true;
    if ([ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(n.kind)) return true;
    if (ts.isPrefixUnaryExpression(n)) return n.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(n.operand);
    if (ts.isParenthesizedExpression(n)) return literal(n.expression);
    if (ts.isAsExpression(n)) return ts.isConstTypeReference(n.type) && literal(n.expression);
    if (ts.isIdentifier(n)) return refToLiteral(n);
    if (ts.isArrayLiteralExpression(n)) {
      return n.elements.every((e) => (ts.isSpreadElement(e) ? refToLiteral(e.expression) : literal(e)));
    }
    if (ts.isObjectLiteralExpression(n)) {
      return n.properties.every((p) => {
        // A `__proto__` key sets the prototype, so a field can be inherited and escape an own-key read.
        if (p.name !== undefined && !ts.isComputedPropertyName(p.name) && p.name.text === '__proto__') return false;
        if (ts.isPropertyAssignment(p)) return !ts.isComputedPropertyName(p.name) && literal(p.initializer);
        if (ts.isShorthandPropertyAssignment(p)) return !p.objectAssignmentInitializer && literalConsts.has(p.name.text);
        if (ts.isSpreadAssignment(p)) return refToLiteral(p.expression);
        return false;
      });
    }
    return false;
  };
  for (const s of sf.statements) {
    if ((ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) && exportOnly(s)) continue;
    if (ts.isImportDeclaration(s) && s.importClause?.isTypeOnly === true) continue;
    // Exactly `const`: `using` and `await using` share bits with Const, so compare the whole block-scope field.
    const plainConst = ts.isVariableStatement(s) && (s.declarationList.flags & ts.NodeFlags.BlockScoped) === ts.NodeFlags.Const;
    if (plainConst && exportOnly(s)) {
      for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer !== undefined && literal(d.initializer)) literalConsts.add(d.name.text);
        else reject(d);
      }
      continue;
    }
    reject(s);
  }
  return bad;
}

const MODULE_DIR = new URL('.', import.meta.url);
const RUNTIME_MODULES = ['bank-en.ts', 'bank-th.ts', 'schema.ts'];
const sourceOf = (f) => readFileSync(new URL(f, MODULE_DIR), 'utf8');

/** Every entry under `dir`, at any depth, that is not an allowed file: the three runtime modules, the two
 *  JSON pins, and top-level `*.test.mjs` files. A subdirectory is itself an offender. `.DS_Store` (macOS
 *  folder metadata, git-ignored, never imported) is the one name skipped. */
function strayFiles(dir) {
  const allowed = new Set([...RUNTIME_MODULES, 'ids-snapshot.json', 'revisions.json']);
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .map((e) => ({ rel: relative(fileURLToPath(dir), join(e.parentPath, e.name)), file: e.isFile() }))
    .filter(({ rel, file }) => {
      if (rel.split(sep).pop() === '.DS_Store') return false;
      if (!file || rel.includes(sep)) return true;
      return !allowed.has(rel) && !/^[\w-]+\.test\.mjs$/.test(rel);
    })
    .map(({ rel }) => rel)
    .sort();
}

test('src/prize-words holds only the allowed files, at any depth', () => {
  assert.deepEqual(strayFiles(MODULE_DIR), []);
});

test('runtime modules under src/prize-words carry data and types only', () => {
  for (const f of RUNTIME_MODULES) assert.deepEqual(logicIn(sourceOf(f), f), [], `${f} carries logic`);
});

test('must-red: a stray module beside the bank or in a subdirectory is named', () => {
  const root = mkdtempSync(join(tmpdir(), 'prize-words-scan-'));
  try {
    for (const f of [...RUNTIME_MODULES, 'ids-snapshot.json', 'revisions.json', 'bank-oracle.test.mjs']) writeFileSync(join(root, f), '');
    const url = pathToFileURL(`${root}${sep}`);
    assert.deepEqual(strayFiles(url), [], 'the allowed set alone must pass');
    writeFileSync(join(root, 'derive.mjs'), 'export const firstChar = (word) => word.text[0];\n');
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'sub', 'extra.ts'), 'export const X = 1;\n');
    writeFileSync(join(root, 'sub', 'nested.test.mjs'), '');
    assert.deepEqual(strayFiles(url), ['derive.mjs', 'sub', join('sub', 'extra.ts'), join('sub', 'nested.test.mjs')]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('must-red: the no-logic check rejects a property read, a call, an arrow and other logic planted in a copy', () => {
  const plants = [
    ['bank-en.ts', 'export const RUNTIME_FIRST_CHAR = BANK_EN.general[0].text[0];'],
    ['bank-en.ts', "export const NORMALISED = 'x'.normalize('NFC');"],
    ['schema.ts', 'export const firstOf = (s: string) => s[0];'],
    ['schema.ts', 'export function firstOf(s: string) { return s[0]; }'],
    ['schema.ts', 'export class Deriver {}'],
    ['schema.ts', 'export const T = `${POOLS[0]}`;'],
    ['schema.ts', 'export let MUTABLE = 1;'],
    ['schema.ts', "import { POOLS as P } from './schema.ts';"],
    ['bank-th.ts', 'export const SPREAD_READ = [...BANK_TH.general];'],
    ['bank-th.ts', 'export const BY_ID = { [S[0]]: 1 };'],
    ['bank-en.ts', 'export const PROTO = { __proto__: { retired: true }, id: 1 };'],
    ['bank-en.ts', "export const PROTO_STR = { '__proto__': { retired: true } };"],
    ['bank-en.ts', "export const PROTO_COMPUTED = { ['__proto__']: { retired: true } };"],
    ['schema.ts', 'await using RESOURCE = null;'],
    ['schema.ts', 'using RESOURCE = null;'],
  ];
  for (const [f, line] of plants) {
    const src = sourceOf(f);
    const bad = logicIn(`${src}\n${line}\n`, f);
    // Exactly one offender, and it is the planted statement (its line), not something already there.
    assert.equal(bad.length, 1, `${f} + ${line} -> ${JSON.stringify(bad)}`);
    assert.ok(bad[0].startsWith(`${src.split('\n').length + 1}: `), `${line} -> ${bad[0]}`);
  }
});

// ---- The shipped id-to-word mapping -------------------------------------------------------------

const readJson = (f) => JSON.parse(readFileSync(new URL(f, MODULE_DIR), 'utf8'));
const BANKS = { th: BANK_TH, en: BANK_EN };

/** Snapshot ids whose word moved or changed text; appended words are not in the snapshot and pass. */
function snapshotDrift(snapshot, banks) {
  const out = [];
  for (const [id, text] of Object.entries(snapshot)) {
    const m = /^(th|en)-([a-z]+)-(\d{3})$/.exec(id);
    const w = m ? banks[m[1]][m[2]]?.[Number(m[3]) - 1] : undefined;
    if (!w || w.id !== id || w.text !== text) {
      out.push(`${id}: snapshot ${JSON.stringify(text)}, bank has ${w ? `${w.id} ${JSON.stringify(w.text)}` : 'nothing'} at that position`);
    }
  }
  return out;
}

/** Ids in the bank but not the snapshot, and snapshot keys not in the bank: both must be empty. */
function snapshotCoverage(snapshot, banks) {
  const bankIds = new Set(['th', 'en'].flatMap((lang) => POOLS.flatMap((pool) => banks[lang][pool].map((w) => w.id))));
  const snapIds = new Set(Object.keys(snapshot));
  return {
    notInSnapshot: [...bankIds].filter((id) => !snapIds.has(id)),
    notInBank: [...snapIds].filter((id) => !bankIds.has(id)),
  };
}

test('ids-snapshot.json: every shipped id is at the same pool position with the same text', () => {
  const snap = readJson('ids-snapshot.json');
  assert.ok(Object.keys(snap).length > 0, 'empty snapshot pins nothing');
  assert.deepEqual(snapshotDrift(snap, BANKS), []);
});

test('ids-snapshot.json and the banks hold exactly the same ids (an append adds its id to the snapshot)', () => {
  assert.deepEqual(snapshotCoverage(readJson('ids-snapshot.json'), BANKS), { notInSnapshot: [], notInBank: [] });
});

test('must-red coverage: an appended word missing from the snapshot, and a snapshot key missing from the bank', () => {
  const snap = readJson('ids-snapshot.json');
  const appended = structuredClone(BANK_EN);
  const newId = `en-general-${String(appended.general.length + 1).padStart(3, '0')}`;
  appended.general.push({ ...appended.general[0], id: newId, text: 'zzz' });
  assert.deepEqual(snapshotCoverage(snap, { th: BANK_TH, en: appended }), { notInSnapshot: [newId], notInBank: [] });
  const ghost = { ...snap, 'th-animal-999': 'x' };
  assert.deepEqual(snapshotCoverage(ghost, BANKS), { notInSnapshot: [], notInBank: ['th-animal-999'] });
});

test('must-red snapshot: swapping two words and reassigning their ids is named; an append keeps positions', () => {
  const snap = readJson('ids-snapshot.json');
  const en = structuredClone(BANK_EN);
  const [a, b] = [en.general[0], en.general[1]];
  assert.deepEqual([a.text, b.text], ['happy', 'tiny'], 'fixture words moved');
  en.general[0] = { ...b, id: a.id };
  en.general[1] = { ...a, id: b.id };
  assert.deepEqual(checkBank('en', en).findings.map(show), [], 'the oracle alone cannot see this swap');
  assert.deepEqual(snapshotDrift(snap, { th: BANK_TH, en }).map((s) => s.split(':')[0]), [a.id, b.id]);
  const appended = structuredClone(BANK_EN);
  appended.general.push({ ...appended.general[0], id: `en-general-${String(appended.general.length + 1).padStart(3, '0')}`, text: 'zzz' });
  assert.deepEqual(snapshotDrift(snap, { th: BANK_TH, en: appended }), []);
});

// ---- Bank revision ------------------------------------------------------------------------------

// The canonical dealable content: per language and pool, in order, every word with every stored field
// except the free-text `note`, keys sorted. Any change to it is a new bank revision. Fields are read the
// way an engine reads them (`w.retired`), so a value inherited through a prototype is hashed too: the
// keys are every schema field plus every enumerable key, own or inherited. An absent field reads
// undefined and drops out of the JSON, so plain data hashes exactly as an own-key walk would.
const NOT_DEALT = new Set(['note']);
const SCHEMA_FIELDS = [
  'id', 'text', 'firstChar', 'firstConsonant', 'lastChar', 'letters', 'toneMarks', 'karan', 'length', 'consonantClass',
  'doubleLetter', 'syllables', 'liveDead', 'vowels', 'wordType', 'eligible', 'workplaceSafe', 'review', 'retired',
];
const fieldsOf = (v) => {
  const keys = new Set(SCHEMA_FIELDS);
  for (const k in v) keys.add(k);
  return [...keys].sort();
};
const sortKeys = (v) => {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(fieldsOf(v).filter((k) => !NOT_DEALT.has(k)).map((k) => [k, sortKeys(v[k])]));
  }
  return v;
};
function bankHash(banks) {
  const rows = ['th', 'en'].flatMap((lang) => POOLS.map((pool) => [lang, pool, sortKeys(banks[lang][pool])]));
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

test('revisions.json: an append-only registry whose latest entry is BANK_REVISION', () => {
  const reg = readJson('revisions.json');
  const nums = Object.keys(reg).map(Number);
  assert.deepEqual(nums, nums.map((_, i) => i + 1), 'revisions are 1, 2, 3, ... in order');
  assert.ok(Object.values(reg).every((h) => /^[0-9a-f]{64}$/.test(h)), 'every entry is a sha256 hex digest');
  assert.ok(Number.isInteger(BANK_REVISION) && BANK_REVISION >= 1);
  assert.equal(BANK_REVISION, nums.length, 'BANK_REVISION must be the latest registry entry');
});

test('the bank content matches the hash recorded for BANK_REVISION', () => {
  const reg = readJson('revisions.json');
  const hash = bankHash(BANKS);
  const next = BANK_REVISION + 1;
  assert.equal(
    hash,
    reg[String(BANK_REVISION)],
    `The bank changed what can be dealt. Bump BANK_REVISION in schema.ts to ${next} and append "${next}": "${hash}" to revisions.json. Never edit an existing entry.`,
  );
});

test('must-red revision: one changed attribute without a bump changes the hash; a note does not', () => {
  const en = structuredClone(BANK_EN);
  en.food[0].syllables += 1;
  assert.deepEqual(checkBank('en', en).findings.map(show), [], 'the oracle alone cannot see this change');
  assert.notEqual(bankHash({ th: BANK_TH, en }), bankHash(BANKS));
  const noted = structuredClone(BANK_EN);
  noted.food[0].note = 'reviewer prose only';
  assert.equal(bankHash({ th: BANK_TH, en: noted }), bankHash(BANKS));
});

test('must-red revision: a field inherited through a prototype changes the hash', () => {
  const en = structuredClone(BANK_EN);
  Object.setPrototypeOf(en.general[0], { retired: true });
  assert.equal(Object.hasOwn(en.general[0], 'retired'), false, 'the plant must be inherited, not own');
  assert.equal(en.general[0].retired, true, 'an engine reading w.retired sees it');
  assert.notEqual(bankHash({ th: BANK_TH, en }), bankHash(BANKS));
});
