// The animal cast every party game opens with: one fixed order, identical in every game, defined
// HERE and read by the play routes (issue #152, ADR-0049 rulings 1-3).
//
// One copy still exists outside this file. src/play/freeze-tap/main.js declares MASCOT_PLAYERS inline
// and keeps it: that file is a verbatim mockup lift and the thai-comments exemption is keyed to its
// basename, so giving it an import would weaken the claim that it is unmodified. The two are pinned
// row for row by src/play/mascot-defaults.test.mjs, so a drift is a red test rather than two casts
// that quietly stop matching.
//
// The colours that array carries are deliberately NOT copied: ADR-0049 requires colour to enter a
// stylesheet as a named token, and every screen that paints a mascot row paints it from play.css.
export type Mascot = { emoji: string; name: string };

export const MASCOTS: readonly Mascot[] = [
  { emoji: '🐱', name: 'แมวส้ม' },
  { emoji: '🐶', name: 'ชิบะ' },
  { emoji: '🐰', name: 'บันนี่' },
  { emoji: '🐸', name: 'ฟร็อกกี้' },
  { emoji: '🐻', name: 'หมีทอง' },
  { emoji: '🐼', name: 'แพนด้า' },
  { emoji: '🐧', name: 'เพนกวิน' },
  { emoji: '🐥', name: 'ลูกเจี๊ยบ' },
  { emoji: '🐷', name: 'หมูอ้วน' },
  { emoji: '⭐', name: 'สไลม์ดาว' },
  { emoji: '🐨', name: 'โคอาล่า' },
  { emoji: '🦊', name: 'จิ้งจอก' },
  { emoji: '🐿️', name: 'กระรอก' },
  { emoji: '🦦', name: 'นากน้อย' },
  { emoji: '🦁', name: 'สิงโต' },
  { emoji: '🦌', name: 'กวางน้อย' },
  { emoji: '🐹', name: 'แฮมสเตอร์' },
  { emoji: '🦝', name: 'แรคคูน' },
  { emoji: '🦭', name: 'แมวน้ำ' },
  { emoji: '🐲', name: 'มังกรน้อย' },
];

/** The numbered default the lifted mockups render when they have no names of their own -- the ONLY
 *  value replaced below. A roster-seeded name never matches it, because the bridge only runs this
 *  when there is no roster.
 *  It does NOT follow that a typed name is safe: this matches on the STRING, not on where it came
 *  from, so a player who types the literal "ผู้เล่น 7" has it silently swapped for a mascot on the
 *  observer's next pass. Accepted as a follow-up, not designed away -- the fix is to stop observing
 *  a field once it has received a real input event, and nothing in this repo can currently see the
 *  difference. Do not restate the stronger claim that was here before; it was false. */
const NUMBERED_DEFAULT = /^\u0e1c\u0e39\u0e49\u0e40\u0e25\u0e48\u0e19\s*\d+$/;

/** Replaces the numbered defaults a mockup's own setup screen renders with the cast above, for the
 *  routes whose mockup does not already ship it.
 *
 *  Called ONLY when the device has no roster to seed -- with a roster, the bridge fills the same
 *  fields with real names and this would find nothing to do. That is also what bounds the observer:
 *  on that path the player must pass through setup, so it always gets its chance and then stops.
 *
 *  Why an observer rather than driving the setup controls the way the bridges do: two of these
 *  mockups render their name fields only after the player picks a count (or leaves a hero screen),
 *  and clicking through for them would take the count screen away from the one player who has never
 *  seen it. Watching instead leaves every screen and every flow exactly as the mockup wrote it, and
 *  changes only the text a field opens with. Every pass re-queries, because these mockups re-render
 *  by replacing innerHTML and a node captured earlier is detached by the next render.
 *
 *  ponytail: it disconnects when the fields go away, i.e. when the match starts. A player who never
 *  reaches setup on a roster-less device does not get here at all. */
export function applyMascotDefaults(nameInputSelector: string): void {
  let seen = false;
  // True once the work is finished for good.
  const pass = (): boolean => {
    const inputs = document.querySelectorAll<HTMLInputElement>(nameInputSelector);
    if (inputs.length === 0) return seen;
    seen = true;
    inputs.forEach((input, i) => {
      const current = (input.value ?? '').trim();
      if (current !== '' && !NUMBERED_DEFAULT.test(current)) return;
      const name = MASCOTS[i % MASCOTS.length].name;
      // Direct .value skips the attribute's maxlength -- enforce it, as the bridges do.
      input.value = input.maxLength > 0 ? name.slice(0, input.maxLength) : name;
      // Bubbling: these mockups listen on the document, not on the field. Only fired on a field this
      // pass actually changed, so a settled setup screen produces no events and no re-render loop.
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return false;
  };

  if (pass()) return;
  // Absent under the test runner's fake DOM, where the single pass above is the whole behaviour.
  if (typeof MutationObserver === 'undefined') return;
  const root = document.body ?? document.documentElement;
  if (!root) return;
  const observer = new MutationObserver(() => {
    if (pass()) observer.disconnect();
  });
  observer.observe(root, { childList: true, subtree: true });
}
