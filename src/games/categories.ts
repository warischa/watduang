// Single source of truth for category meta — scripts/validate-games.mjs checks every game's
// category against these keys and the /c/<slug>/ listing pages (gh#74) render from these values, so
// a category exists here exactly when at least one game claims it. Like manifest.ts, this file is
// read by plain node, so every relative import spells the full .ts extension (node's ESM resolver
// cannot guess it).
import type { Category } from './types.ts';

export interface CategoryMeta {
  /** Thai display name — the heading of the category's listing page, and the pill label on game
   *  cards where a game's category is shown. Only the category page and the home page consume it;
   *  gh#87 did not need a third variant (ADR-0034 records the reversal of the hub-copy fields). */
  label: string;
  /** One short Thai line: when to pick a game from this category */
  whenToUse: string;
  /** Thai heading for this group's section on the home hub (gh#75). Separate from `label`: the
   *  category page's H1 is the bare category name, while the hub section carries the keyword form.
   *  Restored with the wording gh#75 shipped and gh#87 removed together with its cards — approved
   *  copy, not new Thai (ADR-0034: a second surface's copy is a manifest field, never a page
   *  literal). */
  hubHeading: string;
  /** Thai when-to-use line for this group's section on the home hub (gh#75) — longer than
   *  `whenToUse`, which belongs to the category page. */
  hubBody: string;
  /** Thai intro copy paragraph for the listing page */
  intro: string;
  /** Accent NAME, not a colour value — the page/token layer resolves it to real colours */
  accent: string;
  /** Does a group of players carry on from one game in this category into the next? gh#94: only
   *  the party category does — its games share a roster and a turn order (ADR-0040). The fortune
   *  category's games are one person, one answer, so their nav neither filters to the category nor
   *  claims the group carries on.
   *  A flag and not a branch on the slug: Record<Category, CategoryMeta> makes a fourth category that
   *  forgets to answer this a tsc error, so no nav or layout edit is needed to add one. */
  carriesGroup: boolean;
  seo: { title: string; description: string };
}

// Record<Category, ...> on purpose: keyed by the hand-written union in types.ts, not derived from
// these keys, so a key missing here or added only here is a compile error before it is a validator
// error. That parity is what lets the validator below treat these keys as the runtime truth.
// gh#201: fortune pages are not "เกม" (owner decision — the word for what a visitor receives is
// "คำทำนาย", never a synonym). `label`, `hubHeading`, `hubBody` and `intro` below must never call
// this category a game; only `seo.description` below is exempt by a separate standing decision.
// ponytail: no automated gate covers the digit-free half of this claim (a "เกม" claim with no
// player-count number in it) — ADR-0019 rule 1 rejects that gate here: the likely regression is a
// synonym for "game" that never uses the literal word "เกม" at all, which is on the wrong side of
// any string-match ceiling, same reasoning as gh#44's rejected widening. Reviewer-owned until the
// class is small enough to enumerate.
export const categories: Record<Category, CategoryMeta> = {
  fortune: {
    label: 'ดูดวง',
    whenToUse: 'อยากรู้ว่าวันนี้ดวงเป็นยังไง หรือคู่ไหนเข้ากัน',
    hubHeading: 'ดูดวง ทำนายโชคชะตา',
    hubBody: 'ไม่มีใครแพ้ ไม่มีใครโดน กดดูดวงของตัวเองได้ทันที อยากรู้เมื่อไหร่ก็เปิดดูได้เลย',
    intro: 'รวมคำทำนายดูดวงฟรีบนมือถือเครื่องเดียว เสี่ยงเซียมซี เปิดดวงประจำวัน หรือวัดว่าคู่ไหนเข้ากัน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    accent: 'gold',
    carriesGroup: false,
    seo: {
      title: 'ดูดวงออนไลน์ฟรี — เซียมซี ดวงวันนี้ ดวงความรัก | วัดดวง',
      description: 'รวมเกมดูดวงเล่นฟรีบนมือถือ เสี่ยงเซียมซี เปิดดวงวันนี้ วัดดวงความรัก เล่นได้ทันทีไม่ต้องโหลดแอป',
    },
  },
  party: {
    label: 'สุ่มคนโดน',
    whenToUse: 'ต้องหาคนโดน คนจ่าย หรือคนเริ่มก่อน',
    hubHeading: 'เกมวัดดวง สุ่มคนโดน',
    hubBody: 'จบรอบมีคนโดนหนึ่งคนเสมอ วงตกลงกันเองว่าคนโดนต้องทำอะไร',
    intro: 'รวมเกมสุ่มคนโดนสำหรับวงเพื่อน จับไม้สั้น ระเบิดเวลา หรือสุ่มคนโดนแบบตรง ๆ ตัดสินว่าใครจ่าย ใครเริ่ม ใครโดน ด้วยมือถือเครื่องเดียว',
    accent: 'punch',
    carriesGroup: true,
    seo: {
      title: 'เกมสุ่มคนโดน เล่นฟรีในวงเพื่อน | วัดดวง',
      description: 'รวมเกมสุ่มคนโดนเล่นฟรี จับไม้สั้น ระเบิดเวลา สุ่มคนโดน ตัดสินว่าใครจ่ายใครเริ่ม บนมือถือเครื่องเดียว',
    },
  },
};