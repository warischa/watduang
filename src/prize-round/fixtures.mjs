// Fixture banks for the word-round engine tests and the gh#322 proof script. NOT the product bank: the real
// banks in src/prize-words are still `pending` and grown concurrently, so the proof runs on these, where every
// word is `reviewed` except the planted pending and retired ones. Spelling cells are derived here (fixtures only;
// a runtime module never derives them); judged cells (syllables, vowel forms, live/dead, word type) are typed.
// The `animal` pools are deliberately thin, so the "no feasible pair" path has a real case.

import { proposeSchedule } from '../prize-draw/schedule.ts';
import { cutsInHalf } from '../prize-event/event.ts';
import { holds } from './conditions.ts';
import { feasibilityReport, hostSurvivors, hostWordRound, phoneWordRound, phoneWordVerdict, survives } from './round.ts';

const CONSONANT_CLASSES = {
  high: 'ขฃฉฐถผฝศษสห',
  mid: 'กจฎฏดตบปอ',
  low: 'คฅฆงชซฌญฑฒณทธนพฟภมยรลวฬฮ',
};
const CLASS_OF = new Map(Object.entries(CONSONANT_CLASSES).flatMap(([cls, s]) => [...s].map((c) => [c, cls])));
const TONE_MARKS = ['่', '้', '๊', '๋'];
const KARAN = '์';
const COMBINING = /[ัิ-ฺ็-๎]/u;

const distinctSorted = (text) => [...new Set(text)].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));

function thaiWord(pool, i, [text, syllables, vowels, liveDead], extra = {}) {
  const cps = [...text];
  const firstConsonant = cps.find((c) => CLASS_OF.has(c));
  const eligible = ['firstChar', 'firstConsonant'];
  if (!COMBINING.test(cps.at(-1))) eligible.push('lastChar');
  eligible.push('letters', 'toneMarks', 'karan', 'length', 'consonantClass', 'vowels');
  if (syllables !== null) eligible.push('syllables');
  if (liveDead !== null) eligible.push('liveDead');
  return {
    id: `th-${pool}-${String(i + 1).padStart(3, '0')}`,
    text,
    firstChar: cps[0],
    lastChar: cps.at(-1),
    letters: distinctSorted(cps),
    length: cps.length,
    syllables,
    workplaceSafe: true,
    review: 'reviewed',
    firstConsonant,
    toneMarks: TONE_MARKS.filter((m) => cps.includes(m)),
    karan: cps.includes(KARAN),
    consonantClass: CLASS_OF.get(firstConsonant),
    vowels,
    liveDead,
    eligible,
    ...extra,
  };
}

function englishWord(pool, i, [text, syllables, wordType], extra = {}) {
  const cps = [...text];
  const eligible = ['firstChar', 'lastChar', 'letters', 'length', 'doubleLetter'];
  if (syllables !== null) eligible.push('syllables');
  eligible.push('wordType');
  return {
    id: `en-${pool}-${String(i + 1).padStart(3, '0')}`,
    text,
    firstChar: cps[0],
    lastChar: cps.at(-1),
    letters: distinctSorted(cps),
    length: cps.length,
    syllables,
    workplaceSafe: true,
    review: 'reviewed',
    doubleLetter: cps.some((c, k) => k > 0 && c === cps[k - 1]),
    wordType,
    eligible,
    ...extra,
  };
}

// [text, syllables, vowel forms, live/dead]
const TH = {
  general: [
    ['กา', 1, ['-า'], 'live'], ['ขา', 1, ['-า'], 'live'], ['ตา', 1, ['-า'], 'live'], ['ปู', 1, ['-ู'], 'live'],
    ['ไก่', 1, ['ไ-'], 'dead'], ['ไข่', 1, ['ไ-'], 'dead'], ['มีด', 1, ['-ี'], 'dead'], ['บ้าน', 1, ['-า'], 'live'],
    ['ประตู', 2, ['-ู'], null], ['สมุด', 2, ['-ุ'], null], ['ดินสอ', 2, ['-ิ', '-อ'], null], ['ปากกา', 2, ['-า'], null],
    ['หน้าต่าง', 2, ['-า'], null], ['ตู้เย็น', 2, ['-ู', 'เ-็'], null], ['นาฬิกา', 3, ['-า', '-ิ'], null],
    ['จันทร์', 1, ['-ั'], 'live'], ['ห้องสมุด', 3, ['-อ', '-ุ'], null], ['โรงพยาบาล', 4, ['โ-', '-า'], null],
    ['พิพิธภัณฑ์', 4, ['-ิ', '-ั'], null], ['ถนน', 2, [], null], ['ผ้า', 1, ['-า'], 'live'], ['สี', 1, ['-ี'], 'live'],
    ['ช้อน', 1, ['-อ'], 'live'], ['เก้าอี้', 2, ['เ-า', '-ี'], null],
  ],
  office: [
    ['โต๊ะ', 1, ['โ-ะ'], 'dead'], ['กระดาษ', 2, ['-ะ', '-า'], null], ['แฟ้ม', 1, ['แ-'], 'live'], ['ปากกา', 2, ['-า'], null],
    ['ประชุม', 2, ['-ุ'], null], ['เจ้านาย', 2, ['เ-า', '-า'], null], ['ลิฟต์', 1, ['-ิ'], 'dead'], ['งาน', 1, ['-า'], 'live'],
    ['สมุด', 2, ['-ุ'], null], ['ห้องประชุม', 3, ['-อ', '-ุ'], null], ['คอมพิวเตอร์', 3, ['-อ', '-ิ', 'เ-อ'], null],
    ['เงินเดือน', 2, ['เ-ิ', 'เ-ือ'], null], ['ปฏิทิน', 3, ['-ิ'], null], ['อีเมล', 2, ['-ี', 'เ-'], null],
    ['บัตร', 1, ['-ั'], 'dead'], ['กาแฟ', 2, ['-า', 'แ-'], null],
    ['กรรไกร', 2, ['ไ-'], null], ['กล่อง', 1, ['-อ'], 'live'], ['ส่ง', 1, [], 'live'], ['ห่อ', 1, ['-อ'], 'live'],
    ['ที่เย็บ', 2, ['-ี', 'เ-็'], null], ['ป้าย', 1, ['-า'], 'live'], ['โทรศัพท์', 3, ['โ-', '-ั'], null],
  ],
  food: [
    ['ข้าว', 1, ['-า'], 'live'], ['ส้ม', 1, [], 'live'], ['กล้วย', 1, ['-ัว'], 'live'], ['ปลา', 1, ['-า'], 'live'],
    ['แตงโม', 2, ['แ-', 'โ-'], null], ['ขนม', 2, [], null], ['มะละกอ', 3, ['-ะ', '-อ'], null], ['ทุเรียน', 2, ['-ุ', 'เ-ีย'], null],
    ['สับปะรด', 3, ['-ั', '-ะ'], null], ['ผลไม้', 3, ['ไ-'], null], ['ไข่', 1, ['ไ-'], 'dead'], ['หมู', 1, ['-ู'], 'live'],
    ['อาหารกลางวัน', 4, ['-า', '-ั'], null], ['ก๋วยเตี๋ยว', 2, ['-ัว', 'เ-ีย'], null], ['มะม่วง', 2, ['-ะ', '-ัว'], null],
    ['ผัด', 1, ['-ั'], 'dead'],
  ],
  animal: [
    ['หมา', 1, ['-า'], 'live'], ['แมว', 1, ['แ-'], 'live'], ['ช้าง', 1, ['-า'], 'live'], ['งู', 1, ['-ู'], 'live'],
  ],
};

// [text, syllables, word type]
const EN = {
  general: [
    ['happy', 2, 'adjective'], ['tiny', 2, 'adjective'], ['eat', 1, 'verb'], ['write', 1, 'verb'], ['run', 1, 'verb'],
    ['jump', 1, 'verb'], ['sleep', 1, 'verb'], ['apple', 2, 'noun'], ['table', 2, 'noun'], ['coffee', 2, 'noun'],
    ['pencil', 2, 'noun'], ['banana', 3, 'noun'], ['elephant', 3, 'noun'], ['beautiful', 3, 'adjective'],
    ['green', 1, 'adjective'], ['small', 1, 'adjective'], ['sing', 1, 'verb'], ['umbrella', 3, 'noun'],
    ['television', 4, 'noun'], ['calculator', 4, 'noun'], ['remember', 3, 'verb'], ['tall', 1, 'adjective'],
  ],
  office: [
    ['desk', 1, 'noun'], ['paper', 2, 'noun'], ['meeting', 2, 'noun'], ['email', 2, 'noun'], ['type', 1, 'verb'],
    ['print', 1, 'verb'], ['busy', 2, 'adjective'], ['boss', 1, 'noun'], ['schedule', 2, 'noun'], ['calendar', 3, 'noun'],
    ['present', 2, 'noun'], ['agree', 2, 'verb'], ['copy', 2, 'verb'], ['quiet', 2, 'adjective'],
    ['efficient', 3, 'adjective'], ['photocopy', 4, 'verb'],
  ],
  food: [
    ['rice', 1, 'noun'], ['soup', 1, 'noun'], ['cook', 1, 'verb'], ['bake', 1, 'verb'], ['sweet', 1, 'adjective'],
    ['salty', 2, 'adjective'], ['noodle', 2, 'noun'], ['cookie', 2, 'noun'], ['butter', 2, 'noun'], ['carrot', 2, 'noun'],
    ['tomato', 3, 'noun'], ['potato', 3, 'noun'], ['delicious', 3, 'adjective'], ['avocado', 4, 'noun'],
    ['watermelon', 4, 'noun'], ['macaroni', 4, 'noun'], ['boil', 1, 'verb'], ['juicy', 2, 'adjective'],
  ],
  animal: [['cat', 1, 'noun'], ['dog', 1, 'noun'], ['fish', 1, 'noun']],
};

function build(table, make) {
  return Object.fromEntries(Object.entries(table).map(([pool, rows]) => [pool, rows.map((r, i) => make(pool, i, r))]));
}

/** Fresh fixture banks. Pending and retired words are planted in `general`: they must never be dealt. */
export function fixtureBanks() {
  const th = build(TH, thaiWord);
  const en = build(EN, englishWord);
  th.general.push(
    thaiWord('general', th.general.length, ['ปลาทู', 2, ['-า', '-ู'], null], { review: 'pending' }),
    thaiWord('general', th.general.length + 1, ['ไม้', 1, ['ไ-'], 'live'], { retired: true }),
  );
  en.general.push(
    englishWord('general', en.general.length, ['yellow', 2, 'adjective'], { review: 'pending' }),
    englishWord('general', en.general.length + 1, ['walk', 1, 'verb'], { retired: true }),
  );
  return { th, en };
}

/** The same banks with one pool's order reversed (ids travel with their words): a reorder, as a stale bundle would hold. */
export function reorderedBanks(lang, pool) {
  const b = fixtureBanks();
  b[lang][pool] = [...b[lang][pool]].reverse();
  return b;
}

/** Seeded PRNG for host draws and rosters (mulberry32). */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** A roster of `n` distinct ids in the server's join-id shape (22 base64url characters). */
export function roster(n, random) {
  const ids = new Set();
  while (ids.size < n) ids.add(Array.from({ length: 22 }, () => ID_CHARS[Math.floor(random() * 64)]).join(''));
  return [...ids];
}

/** A 6-digit event key, the QR's PIN shape. */
export function eventKey(random) {
  return String(Math.floor(random() * 1e6)).padStart(6, '0');
}

// ---- The exact-cut sweep, shared by round.test.mjs (light) and the gh#322 proof script (heavy) ----------------

/** Every half-cut step of every proposed schedule for n in [from, to]: { n, round, live, keep }. */
export function halfCutConfigs(from = 9, to = 300) {
  const out = [];
  for (let n = from; n <= to; n++) {
    const s = proposeSchedule(n);
    for (let round = 1; round < s.length; round++) if (cutsInHalf(s, round)) out.push({ n, round, live: s[round - 1], keep: s[round] });
  }
  return out;
}

/** Every (game, lang, pool, family) the banks can play: a setup with at least one feasible pair. */
export function feasibleSetups(banks) {
  return feasibilityReport(banks)
    .filter((r) => r.feasible.length > 0)
    .map((r) => ({ game: r.game, lang: r.lang, pool: r.pool, family: r.family }));
}

export const TAPS = [
  { rule: 0, polarity: 'survive' },
  { rule: 0, polarity: 'out' },
  { rule: 1, polarity: 'survive' },
  { rule: 1, polarity: 'out' },
];

// Independent of round.ts composition: reads the dealt items through the condition predicate only.
function matchOf(c, h, rule) {
  if (c.kind === 'conditions') return h.words.every((w) => holds(c.pair[rule], w));
  return holds({ family: c.family, value: h.value }, c.pair[rule]);
}
const candidateIds = (c) => (c.kind === 'conditions' ? c.pair.map((x) => `${x.family}=${String(x.value)}`) : c.pair.map((w) => w.id));
const holdingKey = (h) => (h.kind === 'hand' ? h.words.map((w) => w.id).join(',') : `value:${String(h.value)}`);
const unplayable = (w) => w.review !== 'reviewed' || w.retired === true;

/**
 * For each config and each of `keys` event keys, deal one round per setup in `pick(ci, k)` and check:
 * survivors == keep under both candidates x both polarities (counted from the dealt items), every holder
 * matches exactly one candidate, phone == host (candidates, holding, and verdict after every tap), no
 * pending or retired word is dealt, and a hand holds distinct words from its own group's quadrant.
 */
export function sweep({ banks, configs, keys, setupsFor, seedBase = 1 }) {
  const t = { rounds: 0, identities: 0, cutChecks: 0, phoneChecks: 0, byLive: {}, bad: { cut: 0, phone: 0, suspense: 0, unplayable: 0, hand: 0 } };
  configs.forEach((cfg, ci) => {
    for (let k = 0; k < keys; k++) {
      for (const [si, setup] of setupsFor(ci, k).entries()) {
        const random = prng(seedBase * 1_000_003 + ci * 7919 + k * 104_729 + si * 15_485_863);
        const ek = eventKey(random);
        const ids = roster(cfg.live, random);
        const r = hostWordRound(ek, cfg.round, ids, cfg.keep, random, setup, banks);
        t.rounds++;
        t.byLive[`${cfg.live}>${cfg.keep}`] = (t.byLive[`${cfg.live}>${cfg.keep}`] ?? 0) + 1;
        const c = r.candidates;
        if (c.kind === 'words' && c.pair.some(unplayable)) t.bad.unplayable++;
        for (const tap of TAPS) {
          t.cutChecks++;
          const counted = ids.filter((id) => matchOf(c, r.holdings.get(id), tap.rule) === (tap.polarity === 'survive')).length;
          if (counted !== cfg.keep || hostSurvivors(r, tap).length !== cfg.keep) t.bad.cut++;
        }
        const group0 = new Set(r.groups[0]);
        ids.forEach((id, i) => {
          t.identities++;
          const h = r.holdings.get(id);
          if (matchOf(c, h, 0) === matchOf(c, h, 1)) t.bad.suspense++;
          if (h.kind === 'hand') {
            const g = group0.has(id) ? 0 : 1;
            const inQuadrant = h.words.every((w) => holds(c.pair[g], w) && !holds(c.pair[1 - g], w));
            if (new Set(h.words.map((w) => w.id)).size !== h.words.length || !inQuadrant) t.bad.hand++;
            if (h.words.some(unplayable)) t.bad.unplayable++;
          }
          const p = phoneWordRound(ek, id, cfg.round, r.code, banks);
          t.phoneChecks++;
          if ('refused' in p || holdingKey(p.holding) !== holdingKey(h) || candidateIds(p.candidates).join('|') !== candidateIds(c).join('|')) {
            t.bad.phone++;
            return;
          }
          for (const tap of TAPS) if (survives(p.candidates, p.holding, tap) !== survives(c, h, tap)) t.bad.phone++;
          const tap = TAPS[i % TAPS.length];
          const verdict = phoneWordVerdict(ek, id, cfg.round, r.code, tap, banks);
          if (verdict !== (matchOf(c, h, tap.rule) === (tap.polarity === 'survive') ? 'in' : 'out')) t.bad.phone++;
        });
      }
    }
  });
  return t;
}
