// คัดลอกไฟล์นี้เป็น src/games/<slug>.ts แล้วเพิ่มอีกบรรทัดใน manifest.ts — จบ
// ชื่อขึ้นต้นด้วย _ = ทั้ง glob ฝั่ง client และ validate-games.mjs ข้ามไฟล์นี้
import type { GameContext, GameModule } from './types';

let cleanup: Array<() => void> = [];

const game: GameModule = {
  id: 'template',
  names: { th: 'ชื่อไทย', en: 'English name' },
  category: 'party',
  players: [2, 10],
  keywords: [],
  needs: [],
  tagline: 'บรรทัดเดียวสั้นๆ ว่าเกมนี้สนุกยังไง — ขึ้นบนการ์ด OG',
  seo: {
    title: '',
    description: '',
    steps: ['ขั้นที่ 1', 'ขั้นที่ 2', 'ขั้นที่ 3'],
  },
  og: 'template.png',
  ads: false, // จอเล่น = ห้ามมี ad slot เสมอ

  mount(stage: HTMLElement, ctx: GameContext) {
    stage.textContent = `${ctx.session.players.length} คน`;
  },

  // ทุก timer / listener / audio ที่ mount สร้าง ต้องถูกปิดตรงนี้
  dispose() {
    cleanup.forEach((fn) => fn());
    cleanup = [];
  },
};

export default game;
