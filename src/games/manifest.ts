// แหล่งความจริงเดียวว่ามีเกมอะไรบ้าง — getStaticPaths() และ scripts/validate-games.mjs อ่านไฟล์นี้
// static import ตั้งใจ: build time ได้ object จริงไปตรวจ ไม่มีสำเนา metadata ให้ drift
// โค้ดตรงนี้ไม่หลุดไปหา browser — หน้าเกมโหลด module ผ่าน import.meta.glob ฝั่ง client แทน
import type { GameModule } from './types';
// นามสกุล .ts เขียนไว้เต็มๆ ตั้งใจ: scripts/validate-games.mjs import ไฟล์นี้ด้วย node ตรงๆ
// ซึ่ง ESM ของ node เดานามสกุลให้ไม่ได้ · Vite/Astro รับ .ts อยู่แล้ว
import timebomb from './timebomb.ts';
import siamsi from './siamsi.ts';
import pickLoser from './pick-loser.ts';
import shortStick from './short-stick.ts';

export const games: GameModule[] = [timebomb, siamsi, pickLoser, shortStick];

export const byId = (id: string): GameModule | undefined =>
  games.find((g) => g.id === id);
