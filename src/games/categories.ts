// Single source of truth for category meta — scripts/validate-games.mjs checks every game's
// category against these keys and the /c/<slug>/ listing pages (gh#74) render from these values, so
// a category exists here exactly when at least one game claims it. Like manifest.ts, this file is
// read by plain node, so every relative import spells the full .ts extension (node's ESM resolver
// cannot guess it).
import type { Category } from './types.ts';

export interface CategoryMeta {
  /** Thai display name — the heading of the category's listing page */
  label: string;
  /** One short Thai line: when to pick a game from this category */
  whenToUse: string;
  /** Thai intro copy paragraph for the listing page */
  intro: string;
  /** Thai heading for this group's card on the home hub (gh#75). Separate from `label` on purpose:
   *  the category page's H1 is the bare category name, while the hub card carries the
   *  keyword-bearing phrase from design/HubNeutral.dc.html. One manifest, two consumers — same reason
   *  src/tools/manifest.ts exists. */
  hubHeading: string;
  /** Thai when-to-use line for this group's card on the home hub (gh#75) — longer than `whenToUse`,
   *  which stays the category page's own line and is not changed by gh#75. */
  hubBody: string;
  /** Accent NAME, not a colour value — the page/token layer resolves it to real colours */
  accent: string;
  seo: { title: string; description: string };
}

// Record<Category, ...> on purpose: keyed by the hand-written union in types.ts, not derived from
// these keys, so a key missing here or added only here is a compile error before it is a validator
// error. That parity is what lets the validator below treat these keys as the runtime truth.
export const categories: Record<Category, CategoryMeta> = {
  fortune: {
    label: 'ดูดวง',
    whenToUse: 'อยากรู้ว่าวันนี้ดวงเป็นยังไง หรือคู่ไหนเข้ากัน',
    intro: 'รวมเกมดูดวงเล่นฟรีบนมือถือเครื่องเดียว เสี่ยงเซียมซี เปิดดวงประจำวัน หรือวัดว่าคู่ไหนเข้ากัน ส่งเครื่องวนกันในวง ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    hubHeading: 'ดูดวง ทำนายโชคชะตา',
    hubBody: 'ไม่มีใครแพ้ ไม่มีใครโดน จั่วได้แล้วอ่านให้วงฟัง เหมาะกับวงที่เพิ่งเจอกัน',
    accent: 'gold',
    seo: {
      title: 'ดูดวงออนไลน์ฟรี — เซียมซี ดวงวันนี้ ดวงความรัก | วัดดวง',
      description: 'รวมเกมดูดวงเล่นฟรีบนมือถือ เสี่ยงเซียมซี เปิดดวงวันนี้ วัดดวงความรัก เล่นได้ทันทีไม่ต้องโหลดแอป',
    },
  },
  party: {
    label: 'สุ่มคนโดน',
    whenToUse: 'ต้องหาคนโดน คนจ่าย หรือคนเริ่มก่อน',
    intro: 'รวมเกมสุ่มคนโดนสำหรับวงเพื่อน จับไม้สั้น ระเบิดเวลา หรือสุ่มคนโดนแบบตรง ๆ ตัดสินว่าใครจ่าย ใครเริ่ม ใครโดน ด้วยมือถือเครื่องเดียว',
    hubHeading: 'เกมวัดดวง สุ่มคนโดน',
    hubBody: 'จบรอบมีคนโดนหนึ่งคนเสมอ วงตกลงกันเองว่าคนโดนต้องทำอะไร',
    accent: 'punch',
    seo: {
      title: 'เกมสุ่มคนโดน เล่นฟรีในวงเพื่อน | วัดดวง',
      description: 'รวมเกมสุ่มคนโดนเล่นฟรี จับไม้สั้น ระเบิดเวลา สุ่มคนโดน ตัดสินว่าใครจ่ายใครเริ่ม บนมือถือเครื่องเดียว',
    },
  },
};