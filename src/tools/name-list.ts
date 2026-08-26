// The list a name tool keeps for its own page — one localStorage key per tool, no ceiling, and never
// the shared stores (ADR-0039 dropped the tools from the roster that the "สุ่มคนโดน" games still share).
// The key is handed in by the page, so this module names no storage key of its own and can never write
// one by accident; keep the key OUT of here for that reason (number.astro's range store is the same
// pattern). Every storage touch runs inside try/catch (issue #7): private mode and full-quota both
// degrade to an in-memory list for this page, never a throw.
export function loadToolNames(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

export function saveToolNames(key: string, names: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(names));
  } catch {
    // Storage unavailable — the panel keeps working in memory for this page.
  }
}

/** The panel is one textarea, one name per line, so the names ARE the non-empty trimmed lines.
 *  Duplicates are KEPT on purpose: the box is what the reader sees, two people in one group really
 *  can both be "แนน", and swallowing the second line would make the panel disagree with its own
 *  contents. Uniqueness only ever existed to let a chip be removed by value, and the chips are gone.
 *  Still no ceiling — no slice, no cap (gh#91). */
export function parseNameLines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
}

/** One player's place in the list. `index` is the position in the roster the panel handed over, and
 *  it is the ONLY identity a round may eliminate by: parseNameLines keeps duplicates on purpose, so
 *  two players who both typed "แนน" are two slots that each own a turn. Keying elimination on the
 *  name string took them both out on one pick. */
export interface NameSlot {
  index: number;
  name: string;
}

/** The slots a round still has left. `eliminated` holds ROSTER POSITIONS, never names. */
export function remainingSlots(names: string[], eliminated: Set<number>): NameSlot[] {
  return names
    .map((name, index) => ({ index, name }))
    .filter((slot) => !eliminated.has(slot.index));
}

/** Pick tokens for one round. The pure pickers (wheel.ts pickName, draw.ts drawNames) take a
 *  string[] and hand a member back, so a caller can only invert the pick when every entry is
 *  distinct — names are not. A token is the OFFSET into `slots`, so `slots[Number(token)]` inverts
 *  it, and that same offset is what the wheel's landing angle is computed from: the answer is still
 *  picked first and the geometry derived from it, never read back off the wheel. */
export function slotTokens(slots: NameSlot[]): string[] {
  return slots.map((_, offset) => String(offset));
}
