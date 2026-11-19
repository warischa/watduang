// Code-kind crossover measurement (gh#323 REFUTE round 1), shared by codes.test.mjs and both proof scripts.
// Mints valid codes of every kind a phone can be handed (phase-1 cut, deal and final codes; engine 2a word codes;
// engine 2b script codes), applies every single-digit edit (substitution, insertion, deletion, adjacent
// transposition) and counts how many edited strings each decoder accepts. A phone that accepts an edited code of
// another kind reads a fate from a code no host minted for it.

import { FINAL_ROUND, hostCutRound, hostDealCuts, hostFinalCode, parseCode } from '../prize-draw/round-code.ts';
import { parseWordCode, hostWordRound } from './round.ts';
import { parseScriptCode, hostScriptRound } from './scripted.ts';
import { prng, roster, eventKey, feasibleSetups } from './fixtures.mjs';
import { scriptFixtureBanks, feasibleScriptSetups } from './scripted-fixtures.mjs';

/** Every single-digit edit of `code`, each distinct from it. */
export function singleEdits(code) {
  const out = new Set();
  for (let i = 0; i <= code.length; i++) for (let d = 0; d < 10; d++) out.add(code.slice(0, i) + d + code.slice(i));
  for (let i = 0; i < code.length; i++) {
    out.add(code.slice(0, i) + code.slice(i + 1));
    for (let d = 0; d < 10; d++) out.add(code.slice(0, i) + d + code.slice(i + 1));
    if (i + 1 < code.length) out.add(code.slice(0, i) + code[i + 1] + code[i] + code.slice(i + 2));
  }
  out.delete(code);
  return [...out];
}

/** `perKind` valid codes of each kind, with the round each is typed into. */
export function mintSamples(perKind, seed = 1) {
  const random = prng(seed);
  const banks = scriptFixtureBanks();
  const wordSetups = feasibleSetups(banks);
  const scriptSetups = feasibleScriptSetups(banks);
  const out = [];
  for (let k = 0; k < perKind; k++) {
    const round = 1 + (k % 4);
    const ek = eventKey(random);
    const n = 10 + 2 * Math.floor(random() * 20);
    const ids = roster(n, random);
    out.push({ kind: 'cut', round, code: hostCutRound(ek, round, ids, 1 + Math.floor(random() * (n - 1)), random).code });
    out.push({ kind: 'deal', round, code: hostDealCuts(ek, round, ids, k % 2 ? n / 2 : 1 + Math.floor(random() * (n / 2 - 1)), random).code });
    out.push({ kind: 'word', round, code: hostWordRound(ek, round, ids, n / 2, random, wordSetups[k % wordSetups.length], banks).code });
    out.push({ kind: 'script', round, code: hostScriptRound(ek, round, ids, n / 2, random, scriptSetups[k % scriptSetups.length], banks).code });
    const final = hostFinalCode(ek, ids.slice(0, 5), 1 + (k % 5));
    if (final) out.push({ kind: 'final', round: FINAL_ROUND, code: final });
  }
  return out;
}

export const DECODERS = {
  word: (s, r) => parseWordCode(s, r) !== null,
  script: (s, r) => parseScriptCode(s, r) !== null,
  phase1: (s, r) => parseCode(s, r) !== null,
};

/**
 * Per (source kind -> decoder): edited strings tried and accepted. An elimination-round code is decoded in its own
 * round; a final code, which no elimination decoder should ever see, in each of rounds 1 to 4. The unedited code is
 * also offered to every decoder of another kind ('as is').
 */
export function crossoverTable(samples) {
  const table = {};
  const bump = (key, ok) => {
    const row = (table[key] ??= { tried: 0, accepted: 0 });
    row.tried++;
    if (ok) row.accepted++;
  };
  for (const s of samples) {
    const rounds = s.kind === 'final' ? [1, 2, 3, 4] : [s.round];
    for (const [name, accept] of Object.entries(DECODERS)) {
      const own = name === s.kind || (name === 'phase1' && ['cut', 'deal', 'final'].includes(s.kind));
      for (const r of rounds) {
        if (!own) bump(`${s.kind} as is -> ${name}`, accept(s.code, r));
        for (const e of singleEdits(s.code)) bump(`${s.kind} edited -> ${name}`, accept(e, r));
      }
    }
  }
  return table;
}
