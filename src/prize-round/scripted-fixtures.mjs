// Fixture banks and the exact-cut sweep for engine 2b (gh#323), shared by scripted.test.mjs (light) and the gh#323
// proof script (heavy). NOT the product bank. The banks are engine 2a's fixtures (fixtures.mjs, planted pending
// and retired words included) plus words appended so the Thai and English general, office and food pools hold two
// word-disjoint chains under the link rule; the animal pools stay thin, so game 4's refusal path has a real case.
// Spelling cells are derived here (fixtures only; a runtime module never derives them).
//
// The sweep is an evaluator written apart from the composition modules: it reads the dealt items, the stored
// word cells and its own copy of the link rule, never a module's own verdict, and counts survivors from that.

import { fixtureBanks, prng, roster, eventKey, halfCutConfigs, TAPS } from './fixtures.mjs';
import { hostScriptRound, hostScores, hostSurvivors, phoneScriptDeal, phoneScriptTrace, phoneScriptVerdict, scriptInfeasible, LANG_ORDER } from './scripted.ts';
import { POOL_ORDER } from './round.ts';

const CLASS_OF = new Map(
  Object.entries({ high: 'ขฃฉฐถผฝศษสห', mid: 'กจฎฏดตบปอ', low: 'คฅฆงชซฌญฑฒณทธนพฟภมยรลวฬฮ' }).flatMap(([cls, s]) => [...s].map((c) => [c, cls])),
);
const TONE_MARKS = ['่', '้', '๊', '๋'];
const COMBINING = /[ัิ-ฺ็-๎]/u;
const distinctSorted = (text) => [...new Set(text)].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));

function thaiWord(pool, i, [text, syllables, vowels, liveDead]) {
  const cps = [...text];
  const firstConsonant = cps.find((c) => CLASS_OF.has(c));
  const eligible = ['firstChar', 'firstConsonant'];
  if (!COMBINING.test(cps.at(-1))) eligible.push('lastChar');
  eligible.push('letters', 'toneMarks', 'karan', 'length', 'consonantClass', 'vowels');
  if (syllables !== null) eligible.push('syllables');
  if (liveDead !== null) eligible.push('liveDead');
  return {
    id: `th-${pool}-${String(i + 1).padStart(3, '0')}`, text, firstChar: cps[0], lastChar: cps.at(-1), letters: distinctSorted(cps),
    length: cps.length, syllables, workplaceSafe: true, review: 'reviewed', firstConsonant, toneMarks: TONE_MARKS.filter((m) => cps.includes(m)),
    karan: cps.includes('์'), consonantClass: CLASS_OF.get(firstConsonant), vowels, liveDead, eligible,
  };
}

function englishWord(pool, i, [text, syllables, wordType]) {
  const cps = [...text];
  return {
    id: `en-${pool}-${String(i + 1).padStart(3, '0')}`, text, firstChar: cps[0], lastChar: cps.at(-1), letters: distinctSorted(cps),
    length: cps.length, syllables, workplaceSafe: true, review: 'reviewed', doubleLetter: cps.some((c, k) => k > 0 && c === cps[k - 1]), wordType,
    eligible: ['firstChar', 'lastChar', 'letters', 'length', 'doubleLetter', 'syllables', 'wordType'],
  };
}

// Appended words, [text, syllables, vowel forms, live/dead] / [text, syllables, word type].
const TH_MORE = {
  general: [['นก', 1, [], 'dead'], ['กบ', 1, [], 'dead'], ['บึง', 1, ['-ึ'], 'live'], ['เงิน', 1, ['เ-ิ'], 'live'], ['นม', 1, [], 'live'], ['มด', 1, [], 'dead'], ['อ่าง', 1, ['-า'], 'live']],
  office: [['มือถือ', 2, ['-ื', '-อ'], null], ['ลงชื่อ', 2, ['-ื', '-อ'], null], ['นัด', 1, ['-ั'], 'dead'], ['ดินสอ', 2, ['-ิ', '-อ'], null], ['ออฟฟิศ', 2, ['-อ', '-ิ'], null]],
  food: [['น้ำตาล', 2, ['-ำ', '-า'], null], ['ลาบ', 1, ['-า'], 'dead'], ['มะพร้าว', 2, ['-ะ', '-า'], null], ['วุ้น', 1, ['-ุ'], 'live'], ['น้ำพริก', 2, ['-ำ', '-ิ'], null], ['กุ้ง', 1, ['-ุ'], 'live']],
};
const EN_MORE = {
  general: [['tiger', 2, 'noun'], ['robot', 2, 'noun'], ['nest', 1, 'noun'], ['lemon', 2, 'noun']],
  office: [['keyboard', 2, 'noun'], ['report', 2, 'noun'], ['team', 1, 'noun'], ['manager', 3, 'noun'], ['folder', 2, 'noun'], ['deadline', 2, 'noun'], ['laptop', 2, 'noun'], ['ruler', 2, 'noun']],
  food: [['egg', 1, 'noun'], ['grape', 1, 'noun'], ['melon', 2, 'noun'], ['nut', 1, 'noun'], ['tea', 1, 'noun'], ['onion', 2, 'noun'], ['orange', 2, 'noun']],
};

/** Engine 2a's fixture banks plus the chain words above. */
export function scriptFixtureBanks() {
  const b = fixtureBanks();
  for (const [pool, rows] of Object.entries(TH_MORE)) for (const r of rows) b.th[pool].push(thaiWord(pool, b.th[pool].length, r));
  for (const [pool, rows] of Object.entries(EN_MORE)) for (const r of rows) b.en[pool].push(englishWord(pool, b.en[pool].length, r));
  return b;
}

/** The same banks with one pool's order reversed (ids travel with their words). */
export function reorderedScriptBanks(lang, pool) {
  const b = scriptFixtureBanks();
  b[lang][pool] = [...b[lang][pool]].reverse();
  return b;
}

/** Every scripted setup in code order: game 3 only under the general pool digit. */
export function allScriptSetups() {
  const out = [];
  for (const game of [2, 3, 4]) for (const lang of LANG_ORDER) for (const pool of game === 3 ? ['general'] : POOL_ORDER) out.push({ game, lang, pool });
  return out;
}

export function feasibleScriptSetups(banks) {
  return allScriptSetups().filter((s) => scriptInfeasible(banks, s) === null);
}

// ---- the independent evaluator ------------------------------------------------------------------------------------

const LINK_CONSONANTS = new Set('กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ');
const BINGO_THRESHOLD = 4;
const CHAIN_WORDS = 5;
const unplayable = (w) => !w || w.review !== 'reviewed' || w.retired === true;

function wordById(banks, setup) {
  return new Map(banks[setup.lang][setup.pool].map((w) => [w.id, w]));
}

// The link rule, written again from the ruling: Thai last written character in the consonant table, the next
// word's first consonant equal to it; English last letter equal to the next word's first letter.
function linksAgain(lang, a, b) {
  if (lang === 'th') return LINK_CONSONANTS.has(a.lastChar) && LINK_CONSONANTS.has(b.lastChar) && b.firstConsonant === a.lastChar && a.id !== b.id;
  return /^[a-z]$/.test(a.lastChar) && /^[a-z]$/.test(b.lastChar) && b.firstChar === a.lastChar && a.id !== b.id;
}

/**
 * Per game: `score(h, rule, k)` read from the dealt items and the stored cells, `match(h, rule)` after the last
 * step, `crossFree(h, g)` (the holding carries nothing of the other group's side), and `scriptsOk`.
 */
function evaluator(r, banks) {
  const { setup, scripts } = r;
  if (setup.game === 2) {
    const byId = wordById(banks, setup);
    const words = r.detail.words.map((id) => byId.get(id));
    // The script must be exactly the stored letters, each once, ordered by first appearance in the text.
    const firstAt = (w, c) => ([...w.text].indexOf(c) + 1 || Infinity);
    const ordered = (w, s) => s.every((c, i) => i === 0 || firstAt(w, s[i - 1]) <= firstAt(w, c));
    const scriptsOk = words.every(
      (w, g) => !unplayable(w) && w.eligible.includes('letters') && scripts[g].length === w.letters.length && new Set(scripts[g]).size === w.letters.length && scripts[g].every((c) => w.letters.includes(c)) && ordered(w, scripts[g]),
    );
    return {
      scriptsOk,
      score: (h, rule, k) => (scripts[rule].slice(0, k).includes(h[0]) && words[rule].letters.includes(h[0]) ? 1 : 0),
      match: (h, rule) => h.length === 1 && words[rule].letters.includes(h[0]),
      crossFree: (h, g) => h.length === 1 && words[g].letters.includes(h[0]) && !words[1 - g].letters.includes(h[0]),
    };
  }
  if (setup.game === 3) {
    const marks = (h, rule, k) => h.filter((x) => scripts[rule].slice(0, k).includes(x)).length;
    const scriptsOk = scripts.every((s) => s.length === 12 && new Set(s).size === 12);
    return {
      scriptsOk,
      score: marks,
      match: (h, rule) => marks(h, rule, scripts[rule].length) >= BINGO_THRESHOLD,
      crossFree: (h, g) => h.length === 9 && new Set(h).size === 9 && h.every((x) => !(scripts[1 - g].includes(x) && !scripts[g].includes(x))),
    };
  }
  const byId = wordById(banks, setup);
  const chains = scripts.map((s) => s.map((id) => byId.get(id)));
  const scriptsOk =
    chains.every((c) => c.length === CHAIN_WORDS && c.every((w) => !unplayable(w)) && c.every((w, i) => i === 0 || linksAgain(setup.lang, c[i - 1], w))) &&
    !scripts[0].some((id) => scripts[1].includes(id));
  return {
    scriptsOk,
    score: (h, rule, k) => (scripts[rule].slice(0, k).includes(h[0]) ? 1 : 0),
    match: (h, rule) => h.length === 1 && scripts[rule].includes(h[0]),
    crossFree: (h, g) => h.length === 1 && scripts[g].includes(h[0]) && !scripts[1 - g].includes(h[0]),
  };
}

/**
 * For each config and each of `keys` event keys, one round per setup in `setupsFor(ci, k)`, checking: survivors ==
 * keep under both scripts x both polarities (counted by the evaluator, and the host's own count); every holder
 * matches exactly one script; no holding carries the other group's side; scripts valid; phone == host for the deal,
 * every step of both scripts (item and score) and the final verdict after every tap. The phone side runs on
 * `phoneBanks`, a separate copy of the banks, so it shares no cache with the host.
 */
export function scriptSweep({ banks, phoneBanks = structuredClone(banks), configs, keys, setupsFor, seedBase = 1 }) {
  const t = {
    rounds: 0, identities: 0, cutChecks: 0, stepChecks: 0, phoneChecks: 0, byGame: {}, byLive: {},
    bingoGap: { minSurvivor: Infinity, maxOut: -Infinity }, chainEmpty: {},
    bad: { cut: 0, phone: 0, step: 0, suspense: 0, cross: 0, script: 0, gap: 0 },
  };
  configs.forEach((cfg, ci) => {
    for (let k = 0; k < keys; k++) {
      for (const [si, setup] of setupsFor(ci, k).entries()) {
        const random = prng(seedBase * 1_000_003 + ci * 7919 + k * 104_729 + si * 15_485_863);
        const ek = eventKey(random);
        const ids = roster(cfg.live, random);
        const r = hostScriptRound(ek, cfg.round, ids, cfg.keep, random, setup, banks);
        const ev = evaluator(r, banks);
        t.rounds++;
        t.byGame[setup.game] = (t.byGame[setup.game] ?? 0) + 1;
        t.byLive[`${cfg.live}>${cfg.keep}`] = (t.byLive[`${cfg.live}>${cfg.keep}`] ?? 0) + 1;
        if (!ev.scriptsOk) t.bad.script++;
        for (const tap of TAPS) {
          t.cutChecks++;
          const counted = ids.filter((id) => ev.match(r.holdings.get(id), tap.rule) === (tap.polarity === 'survive')).length;
          if (counted !== cfg.keep || hostSurvivors(r, tap).length !== cfg.keep) t.bad.cut++;
        }
        if (setup.game === 3) {
          for (const rule of [0, 1]) {
            const end = r.scripts[rule].length;
            const m = ids.map((id) => [ev.match(r.holdings.get(id), rule), ev.score(r.holdings.get(id), rule, end)]);
            const lo = Math.min(...m.filter(([x]) => x).map(([, s]) => s));
            const hi = Math.max(...m.filter(([x]) => !x).map(([, s]) => s));
            if (!(lo > hi)) t.bad.gap++;
            t.bingoGap.minSurvivor = Math.min(t.bingoGap.minSurvivor, lo);
            t.bingoGap.maxOut = Math.max(t.bingoGap.maxOut, hi);
          }
        }
        if (setup.game === 4) {
          const shape = `${cfg.live}>${cfg.keep}`;
          const e = (t.chainEmpty[shape] ??= { rounds: 0, roundsWithEmpty: 0, emptyWords: 0, words: 0 });
          for (const g of [0, 1]) {
            const held = new Set(r.groups[g].map((id) => r.holdings.get(id)[0]));
            const empty = r.scripts[g].filter((id) => !held.has(id)).length;
            e.rounds++;
            e.words += r.scripts[g].length;
            e.emptyWords += empty;
            if (empty > 0) e.roundsWithEmpty++;
          }
        }
        const hostSteps = [0, 1].map((rule) => Array.from({ length: r.scripts[rule].length + 1 }, (_, step) => hostScores(r, rule, step)));
        const group0 = new Set(r.groups[0]);
        ids.forEach((id, i) => {
          t.identities++;
          const h = r.holdings.get(id);
          const g = group0.has(id) ? 0 : 1;
          if (ev.match(h, 0) === ev.match(h, 1) || ev.match(h, g) !== true) t.bad.suspense++;
          if (!ev.crossFree(h, g)) t.bad.cross++;
          t.phoneChecks++;
          const deal = phoneScriptDeal(ek, id, cfg.round, r.code, phoneBanks);
          if ('refused' in deal || deal.holding.join('|') !== h.join('|') || JSON.stringify(deal.setup) !== JSON.stringify(setup)) {
            t.bad.phone++;
            return;
          }
          for (const tap of TAPS) {
            const trace = phoneScriptTrace(ek, id, cfg.round, r.code, tap, phoneBanks);
            const script = r.scripts[tap.rule];
            if ('refused' in trace || trace.length !== script.length + 1) {
              t.bad.step++;
              continue;
            }
            for (let s = 0; s <= script.length; s++) {
              t.stepChecks++;
              const want = ev.score(h, tap.rule, s);
              const p = trace[s];
              if (p.score !== want || hostSteps[tap.rule][s].get(id) !== want || p.item !== (s === 0 ? null : script[s - 1]) || p.steps !== script.length) t.bad.step++;
            }
            const final = ev.match(h, tap.rule) === (tap.polarity === 'survive') ? 'in' : 'out';
            if (trace[script.length].verdict !== final) t.bad.phone++;
          }
          const tap = TAPS[i % TAPS.length];
          const v = phoneScriptVerdict(ek, id, cfg.round, r.code, tap, phoneBanks);
          if (v !== (ev.match(h, tap.rule) === (tap.polarity === 'survive') ? 'in' : 'out')) t.bad.phone++;
        });
      }
    }
  });
  return t;
}

export { halfCutConfigs, prng, roster, TAPS };
