// Engine 2b for the prize draw (gh#323): multi-step "scripted cut" rounds for game 2 (letter tiles and a hidden
// word), game 3 (letter cards and drawn letters) and game 4 (a word chain), in event mode. Pure: no DOM, storage
// or network. Shares engine 2a's code family and rule tap; the phase-1 machinery is imported, never edited.
//
// Half-cut rounds only (owner ruling 2026-11-19): live = 2 x keep, so the two cuts of a deal are equal and every
// identity is in group 0 (fate value below the cut) or group 1. Each game composes TWO CANDIDATE SCRIPTS so that
// group 0 matches script 0 and not script 1, and group 1 the reverse (script-kit.ts). The phone rebuilds its own
// holding from the code before the reveal; which script was drawn, and the polarity, reach it only by the rule
// tap, as the card round's rule does. So no phone holds the ending before the reveal starts: its holding matches
// one candidate and not the other. After the tap the phone follows every step on its own.
//
// Script code: engine 2a's 14-digit word-family code (round.ts familyCode), with kind = SCRIPT_KIND_BASE + the
// index of (game, language) in the frozen SCRIPT_KINDS table below. Game 3 reads no pool and is written under the
// first pool digit only, so each code has one meaning. Sharing the family keeps every phase-1 length 2 or more
// away and lets the one Damm check reject each single substitution or adjacent swap between the two engines.

import { fateValue, hostDealCuts, parseCode } from '../prize-draw/round-code.ts';
import type { Lang } from '../prize-words/schema.ts';
import { BINGO } from './bingo.ts';
import { CHAIN } from './chain.ts';
import { LETTERS } from './letters.ts';
import {
  familyCode,
  parseFamilyCode,
  POOL_ORDER,
  revisionDigit,
  SCRIPT_KIND_BASE,
  WORD_CODE_LENGTH,
  type Banks,
  type CodeRefusal,
  type Polarity,
  type Refused,
  type RuleTap,
} from './round.ts';
import { scoreAt, type ComposeCtx, type Composed, type Composer, type Group, type Script, type ScriptGame, type ScriptSetup } from './script-kit.ts';

export const SCRIPT_GAMES: readonly ScriptGame[] = [2, 3, 4];
export const LANG_ORDER: readonly Lang[] = ['th', 'en'];
/** Engine 2b's kinds. FROZEN ORDER: a code carries SCRIPT_KIND_BASE + the index; a new entry is appended. */
export const SCRIPT_KINDS: readonly { readonly game: ScriptGame; readonly lang: Lang }[] = [
  { game: 2, lang: 'th' },
  { game: 2, lang: 'en' },
  { game: 3, lang: 'th' },
  { game: 3, lang: 'en' },
  { game: 4, lang: 'th' },
  { game: 4, lang: 'en' },
];
export const SCRIPT_CODE_LENGTH = WORD_CODE_LENGTH;

const COMPOSERS: Readonly<Record<ScriptGame, Composer>> = { 2: LETTERS, 3: BINGO, 4: CHAIN };

export type ParsedScriptCode = { seed: string; cut: number; revision: number; setup: ScriptSetup };

function checkSetup(setup: ScriptSetup): void {
  if (!SCRIPT_GAMES.includes(setup.game)) throw new RangeError(`not a scripted game: ${String(setup.game)}`);
  if (!LANG_ORDER.includes(setup.lang)) throw new RangeError(`unknown language ${String(setup.lang)}`);
  if (!POOL_ORDER.includes(setup.pool)) throw new RangeError(`unknown pool ${String(setup.pool)}`);
  if (setup.game === 3 && setup.pool !== POOL_ORDER[0]) throw new RangeError('game 3 reads no word pool; it is written under the first pool digit only');
}

/** The script code for a seed and cut. Exported so the golden vectors can pin a fixed seed. */
export function scriptCode(round: number, seed: string, cut: number, setup: ScriptSetup, revision: number): string {
  checkSetup(setup);
  const k = SCRIPT_KINDS.findIndex((x) => x.game === setup.game && x.lang === setup.lang);
  return familyCode(round, seed, cut, revision, SCRIPT_KIND_BASE + k, setup.pool);
}

/** Parse a script code typed for `round`; null when the family parser refuses it or it names no engine-2b kind. */
export function parseScriptCode(raw: string, round: number): ParsedScriptCode | null {
  const f = parseFamilyCode(raw, round);
  if (!f || f.kind < SCRIPT_KIND_BASE) return null;
  const k = SCRIPT_KINDS[f.kind - SCRIPT_KIND_BASE];
  if (!k) return null;
  // One meaning per code: game 3 reads no pool, so only the first pool digit is written for it.
  if (k.game === 3 && f.pool !== POOL_ORDER[0]) return null;
  return { seed: f.seed, cut: f.cut, revision: f.revision, setup: { game: k.game, lang: k.lang, pool: f.pool } };
}

function composerFor(setup: ScriptSetup): Composer {
  return COMPOSERS[setup.game];
}

/** Null when the setup can be played on these banks; the reason otherwise. */
export function scriptInfeasible(banks: Banks, setup: ScriptSetup): string | null {
  checkSetup(setup);
  return composerFor(setup).infeasible(banks, setup);
}

/** Does a holding match a script once every step is revealed? */
export function matchesScript(setup: ScriptSetup, script: Script, held: readonly string[]): boolean {
  return scoreAt(script, held, script.length) >= composerFor(setup).threshold;
}

function verdictOf(matched: boolean, polarity: Polarity): 'in' | 'out' {
  return matched === (polarity === 'survive') ? 'in' : 'out';
}

export type HostScriptRound = {
  code: string;
  setup: ScriptSetup;
  scripts: readonly [Script, Script];
  detail: Composed['detail'];
  holdings: Map<string, readonly string[]>;
  /** groups[0]: the lowest `keep` fate values, composed to match script 0; groups[1]: the rest. */
  groups: [string[], string[]];
  tries: number;
};

/** Host side: refuses anything but a half-cut and a setup it cannot play; deals every identity its holding. */
export function hostScriptRound(
  eventKey: string,
  round: number,
  roster: string[],
  keep: number,
  random: () => number,
  setup: ScriptSetup,
  banks: Banks,
): HostScriptRound {
  if (roster.length !== 2 * keep) {
    throw new RangeError(`scripted rounds play only half-cut rounds (live = 2 x keep); got ${roster.length} live, keep ${keep}`);
  }
  const why = scriptInfeasible(banks, setup);
  if (why) throw new RangeError(`no feasible script for game ${setup.game} ${setup.lang} ${setup.pool}: ${why}`);
  const dealt = hostDealCuts(eventKey, round, roster, keep, random);
  const parsed = parseCode(dealt.code, round);
  if (!parsed || parsed.kind !== 'deal' || parsed.low !== parsed.high) throw new Error('a half-cut deal must carry two equal cuts');
  const code = scriptCode(round, dealt.seed, parsed.low, setup, revisionDigit(banks));
  const ctx: ComposeCtx = { eventKey, round, seed: dealt.seed, setup, banks };
  const composed = composerFor(setup).compose(ctx);
  const first = new Set(dealt.survivors[0]);
  const holdings = new Map<string, readonly string[]>();
  for (const id of roster) holdings.set(id, composed.holding(id, first.has(id) ? 0 : 1));
  return { code, setup, scripts: composed.scripts, detail: composed.detail, holdings, groups: [dealt.survivors[0], dealt.survivors[1]], tries: dealt.tries };
}

/** Every identity's score after `step` items of the drawn script. */
export function hostScores(r: HostScriptRound, rule: 0 | 1, step: number): Map<string, number> {
  return new Map([...r.holdings].map(([id, h]) => [id, scoreAt(r.scripts[rule], h, step)]));
}

/** The identities still in once the drawn script has run to its end, under the tapped polarity. */
export function hostSurvivors(r: HostScriptRound, tap: RuleTap): string[] {
  return [...r.holdings].filter(([, h]) => verdictOf(matchesScript(r.setup, r.scripts[tap.rule], h), tap.polarity) === 'in').map(([id]) => id);
}

type PhoneCore = { setup: ScriptSetup; composed: Composed; group: Group };

function phoneCore(eventKey: string, identity: string, round: number, code: string, banks: Banks): PhoneCore | Refused {
  const parsed = parseScriptCode(code, round);
  if (!parsed) return { refused: 'bad-code' };
  if (parsed.revision !== revisionDigit(banks)) return { refused: 'stale-bank' };
  if (composerFor(parsed.setup).infeasible(banks, parsed.setup)) return { refused: 'bad-code' };
  const composed = composerFor(parsed.setup).compose({ eventKey, round, seed: parsed.seed, setup: parsed.setup, banks });
  const group: Group = fateValue(eventKey, round, parsed.seed, identity) < parsed.cut ? 0 : 1;
  return { setup: parsed.setup, composed, group };
}

export type PhoneScriptDeal = { setup: ScriptSetup; holding: readonly string[] };

/** The deal a phone shows before the reveal: its own holding, from the code alone; or why the code is refused. */
export function phoneScriptDeal(eventKey: string, identity: string, round: number, code: string, banks: Banks): PhoneScriptDeal | Refused {
  const c = phoneCore(eventKey, identity, round, code, banks);
  return 'refused' in c ? c : { setup: c.setup, holding: c.composed.holding(identity, c.group) };
}

export type PhoneStep = {
  step: number;
  /** Total steps of the drawn script. */
  steps: number;
  /** The item the main screen reveals at this step; null at step 0. */
  item: string | null;
  score: number;
  /** Set only at the last step: the verdict under the tapped polarity. */
  verdict: 'in' | 'out' | null;
};

/** The phone's whole reveal after the rule tap: one entry per step, 0 (nothing shown) to the script's end. */
export function phoneScriptTrace(eventKey: string, identity: string, round: number, code: string, tap: RuleTap, banks: Banks): PhoneStep[] | Refused {
  const c = phoneCore(eventKey, identity, round, code, banks);
  if ('refused' in c) return c;
  const held = c.composed.holding(identity, c.group);
  const script = c.composed.scripts[tap.rule];
  const out: PhoneStep[] = [];
  for (let k = 0; k <= script.length; k++) {
    const score = scoreAt(script, held, k);
    const verdict = k === script.length ? verdictOf(score >= composerFor(c.setup).threshold, tap.polarity) : null;
    out.push({ step: k, steps: script.length, item: k === 0 ? null : script[k - 1]!, score, verdict });
  }
  return out;
}

/** One step of the phone's reveal; null when the step is past the script's end; or why the code is refused. */
export function phoneScriptStep(eventKey: string, identity: string, round: number, code: string, tap: RuleTap, step: number, banks: Banks): PhoneStep | Refused | null {
  const t = phoneScriptTrace(eventKey, identity, round, code, tap, banks);
  return 'refused' in t ? t : (t[step] ?? null);
}

/** The phone's final verdict after the rule tap, or the reason the code is refused. */
export function phoneScriptVerdict(eventKey: string, identity: string, round: number, code: string, tap: RuleTap, banks: Banks): 'in' | 'out' | CodeRefusal {
  const t = phoneScriptTrace(eventKey, identity, round, code, tap, banks);
  return 'refused' in t ? t.refused : t[t.length - 1]!.verdict!;
}
