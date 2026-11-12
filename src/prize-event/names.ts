// The name channel of a prize-draw event, DOM-free. A name is typed by the MC today and by a stranger's
// phone in QR mode (gh#308), and either way it ends up on a projector. So every name passes checkName
// before it is stored, and again when a stored event is read back (event.ts decodeEvent): storage is a
// second channel into the screen, and a blob written by an older build or by hand is not trusted because
// the setup page once checked it.
//
// THE validity rule is checkName, one pure function, held to the join server's own copy
// (services/feedback/src/join.mjs checkName, gh#308) verdict for verdict, reason code for reason code:
// one rule for admin-typed and phone-joined names (orchestrator decision 2026-11-11). In order:
//   - not a well-formed string -> 'empty' / 'lone-surrogate';
//   - any control, format or separator character (\p{C}, \p{Zl}, \p{Zp}) -> 'control';
//   - NFC, whitespace runs collapsed to one space, trimmed; nothing left -> 'empty';
//   - over 64 UTF-16 units -> 'too-long' (a ceiling before anything is segmented);
//   - outside the allowlist (Thai U+0E01-U+0E3A, U+0E40-U+0E4E, Thai digits, ASCII letters and digits,
//     space . - ' _) -> 'emoji' when it holds a pictograph, else 'charset';
//   - more than NAME_CAP clusters -> 'too-long';
//   - per cluster: a mark with no Thai consonant under it -> 'leading-mark'; over 3 code points, a mark
//     repeated (it prints on itself), or SARA AM not right after a consonant or a tone mark ->
//     'stacked-marks'.
// Clusters are split by a rule this file owns, not by the runtime's ICU: every Thai mark or SARA AM joins
// the cluster before it. On the allowlist that equals the UAX #29 count. SARA AM is a spacing letter that
// still joins its cluster, which is why the widest valid Thai name is DDO PHU THAO + SARA AM, x12.
// An allowlist, not a list of bad characters: bidi controls, zero-width characters and markup symbols are
// refused because they are not on it (ADR-0026). Markup that would still matter is made inert by the
// textContent sink in src/play/_prize-reveal/names-dom.ts anyway.

/** The longest name, in clusters (owner ruling 2026-11-11). */
export const NAME_CAP = 12;
/** UTF-16 ceiling, checked before segmenting. */
export const NAME_MAX_UNITS = 64;
/** Code points in one cluster: a Thai consonant and at most two marks on it. */
export const NAME_MAX_CLUSTER = 3;

export type NameIssue =
  | 'empty'
  | 'lone-surrogate'
  | 'control'
  | 'emoji'
  | 'charset'
  | 'too-long'
  | 'leading-mark'
  | 'stacked-marks';

const FORBIDDEN = /[\p{C}\p{Zl}\p{Zp}]/u;
const ALLOWED = /^[ก-ฺเ-๎๐-๙A-Za-z0-9 .'_-]*$/u;
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;
const THAI_MARK = /^[ัิ-ฺ็-๎]$/u;
const SARA_AM = 'ำ';
const isConsonant = (c: string): boolean => c >= 'ก' && c <= 'ฮ';
const isToneMark = (c: string): boolean => c >= '่' && c <= '๋';
const attaches = (c: string): boolean => c === SARA_AM || THAI_MARK.test(c);

function clusters(text: string): string[][] {
  const out: string[][] = [];
  for (const c of text) {
    if (attaches(c) && out.length > 0) out[out.length - 1]!.push(c);
    else out.push([c]);
  }
  return out;
}

/** Clusters in a name, by this file's own rule. */
export function graphemeCount(text: string): number {
  return clusters(text).length;
}

/** NFC, every run of whitespace one space, trimmed. Nothing is stripped: a character outside the rule
 *  makes the name invalid instead of silently becoming another name. */
export function normaliseName(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

/** THE rule: the normalised name, or why it is refused. */
export function checkName(raw: unknown): { ok: true; name: string } | { ok: false; reason: NameIssue } {
  if (typeof raw !== 'string') return { ok: false, reason: 'empty' };
  if (!raw.isWellFormed()) return { ok: false, reason: 'lone-surrogate' };
  const nfc = raw.normalize('NFC');
  if (FORBIDDEN.test(nfc)) return { ok: false, reason: 'control' };
  const name = nfc.replace(/\s+/gu, ' ').trim();
  if (name === '') return { ok: false, reason: 'empty' };
  if (name.length > NAME_MAX_UNITS) return { ok: false, reason: 'too-long' };
  if (!ALLOWED.test(name)) return { ok: false, reason: EMOJI.test(name) ? 'emoji' : 'charset' };
  const parts = clusters(name);
  if (parts.length > NAME_CAP) return { ok: false, reason: 'too-long' };
  for (const cluster of parts) {
    if (attaches(cluster[0]!) || (cluster.length > 1 && !isConsonant(cluster[0]!))) return { ok: false, reason: 'leading-mark' };
    if (cluster.length > NAME_MAX_CLUSTER) return { ok: false, reason: 'stacked-marks' };
    if (new Set(cluster).size !== cluster.length) return { ok: false, reason: 'stacked-marks' };
    const am = cluster.indexOf(SARA_AM);
    if (am > 0 && !isConsonant(cluster[am - 1]!) && !isToneMark(cluster[am - 1]!)) return { ok: false, reason: 'stacked-marks' };
  }
  return { ok: true, name };
}

/** Why `name` is refused, or null. */
export function nameIssue(name: string): NameIssue | null {
  const r = checkName(name);
  return r.ok ? null : r.reason;
}

/**
 * The uniqueness key: two names with one key read the same on a projector, so the second is taken. The
 * join server's folding (gh#308 nameKey) without its hash: NFKC (SARA AM meets NIKHAHIT + SARA AA), two
 * SARA E read as SARA AE, KHO KHUAT and KHO KHON read as KHO KHAI and KHO KHWAI, marks on one consonant
 * sorted, case folded, spaces dropped. Works on a name checkName accepted.
 */
export function nameKey(name: string): string {
  const folded = name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ /g, '')
    .replace(/เเ/g, 'แ')
    .replace(/ฃ/g, 'ข')
    .replace(/ฅ/g, 'ค');
  return clusters(folded)
    .map(([base, ...marks]) => base + marks.sort().join(''))
    .join('');
}

export type ParsedRoster = {
  /** Accepted names, in input order. */
  names: string[];
  /** Lines that break the rule, normalised, with the reason; never repaired. */
  refused: { name: string; issue: NameIssue }[];
  /** A valid name whose key was already taken; never merged, since the MC must tell two people apart. */
  duplicates: string[];
};

/** One name per line, as the MC types them. Blank lines are dropped. */
export function parseRoster(text: string): ParsedRoster {
  const names: string[] = [];
  const refused: ParsedRoster['refused'] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (normaliseName(line) === '') continue;
    const r = checkName(line);
    if (!r.ok) {
      refused.push({ name: normaliseName(line), issue: r.reason });
      continue;
    }
    const key = nameKey(r.name);
    if (seen.has(key)) {
      duplicates.push(r.name);
      continue;
    }
    seen.add(key);
    names.push(r.name);
  }
  return { names, refused, duplicates };
}

/** True when a stored name is exactly what checkName would store. */
export function isCleanName(name: unknown): name is string {
  const r = checkName(name);
  return r.ok && r.name === name;
}
