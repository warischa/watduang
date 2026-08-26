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

/** Pure list handling, extracted so the seams are unit-tested without a DOM. Returns the new list and
 *  whether it actually grew, so the panel can keep its input fish-bowl behaviour (blank and duplicate
 *  both clear the field without adding). Trimming only; the unbounded list is the whole point (gh#91). */
export function addToolName(names: string[], raw: string): { names: string[]; added: boolean } {
  const trimmed = raw.trim();
  if (!trimmed || names.includes(trimmed)) return { names, added: false };
  return { names: [...names, trimmed], added: true };
}

/** Removes every occurrence — the list is expected to hold no duplicates, so one filter pass is honest. */
export function removeToolName(names: string[], name: string): string[] {
  return names.filter((n) => n !== name);
}