// Contract ของทุกเกม — ทุกไฟล์ใน src/games/ ที่ไม่ขึ้นต้นด้วย _ ต้อง default-export GameModule
// เหตุผลของ field ต่างๆ อยู่ใน issue #13 — ห้ามเขียนซ้ำที่นี่

/** รายชื่อผู้เล่นที่อยู่ข้ามรอบ ข้ามเกม — localStorage (ต้อง try/catch ทุกครั้ง) */
export interface Roster {
  names(): string[];
  add(name: string): void;
  remove(name: string): void;
  clear(): void;
}

/**
 * A mid-round save. The game decides every field except the two the envelope names: `game` says
 * whose blob it is (one slot is shared site-wide) and `players` is the round's own roster, so a
 * round is resumed from the checkpoint instead of from whatever the setup panel currently shows (#23).
 * The shape a game writes is still its own business — validate before trusting it, the blob on disk
 * was written by a past version of the code.
 */
export type Checkpoint = { game: string; players: string[] } & Record<string, unknown>;

/** สถานะของ "วงนี้" เท่านั้น — หมดอายุเองได้ ไม่ผูกกับ roster */
export interface GameSession {
  /** ผู้เล่นในวงรอบนี้ — subset ของ roster หรือชื่อชั่วคราว P1..Pn */
  players: string[];
  /** ตั้งผู้เล่นแล้วเขียนลง storage ในจังหวะเดียว — อย่าเซ็ต players ตรงๆ มันจะไม่ถูกบันทึก */
  setPlayers(names: string[]): void;
  /** id ของเกมที่วงนี้เล่นไปแล้ว — ใช้ตอนแนะนำเกมถัดไปเมื่อมีเกม >= 2 */
  played: string[];
  markPlayed(id: string): void;
  /** สถานะกลางรอบ กันรีเฟรชแล้วหาย — เกมกำหนดรูปร่างเอง นอกจาก game/players ที่ envelope บังคับ */
  checkpoint: Checkpoint | null;
  saveCheckpoint(cp: Checkpoint | null): void;
  /** ปุ่ม "ล้างกลุ่มนี้" — ล้าง session ไม่แตะ roster */
  clear(): void;
}

export interface GameContext {
  roster: Roster;
  session: GameSession;
}

export interface GameModule {
  /** slug → /game/<id>/ — ต้องตรงกับชื่อไฟล์ */
  id: string;
  names: { th: string; en: string };
  category: 'party' | 'fortune';
  players: [min: number, max: number];
  keywords: string[];
  /** ponytail: ยังไม่มีใครอ่าน — Vite แตก chunk ต่อไฟล์เกมให้เองแล้ว
   *  เก็บไว้ตามสเปก #13 เผื่อเกมที่ต้องโหลด lib ก้อนใหญ่จริง */
  needs: string[];
  /** hook สั้นๆ บรรทัดเดียวสำหรับการ์ด OG — seo.title ยาวไป seo.description ยิ่งยาว
   *  ใช้โดย scripts/make-og.mjs · ไม่มีที่นี่แล้วการ์ดจะเหลือแต่ชื่อเกม */
  tagline: string;
  /** steps → หัวข้อ "วิธีเล่น" + HowTo JSON-LD */
  seo: { title: string; description: string; steps: string[] };
  /** ชื่อไฟล์ใน public/og/ เช่น "timebomb.png" — ห้ามมีขวด กระป๋อง หรือแก้วที่มีโลโก้ */
  og: string;
  /** false = ทั้งหน้าไม่มี ad slot — จอเล่นทุกจอต้องเป็น false */
  ads: boolean;
  mount(stage: HTMLElement, ctx: GameContext): void;
  /** ล้าง timer / listener / audio ทุกทางออก — บังคับ */
  dispose(): void;
  onVisibility?(hidden: boolean): void;
}
