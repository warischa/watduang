#!/usr/bin/env node
// Build-time gate: reads the real manifest and fails naming FILE + FIELD for any
// GameModule that violates the contract in src/games/types.ts. See issue #13.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ไม่ต้องมี resolve hook: manifest.ts เขียนนามสกุล .ts เต็มในทุก import ของเกม
// node จึงหาไฟล์เจอตรงๆ (Vite/Astro รับนามสกุลเต็มอยู่แล้ว)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'src/games/manifest.ts');

let games;
try {
  ({ games } = await import(manifestPath));
} catch (err) {
  console.error(`validate-games: failed to import src/games/manifest.ts — ${err.message}`);
  process.exit(1);
}

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isStrArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isFn = (v) => typeof v === 'function';

const errors = [];
const seenIds = new Set();

games.forEach((g, i) => {
  // file label: best effort even when id itself is broken
  const label = isStr(g?.id) ? `src/games/${g.id}.ts` : `src/games/<game at index ${i}, id=${JSON.stringify(g?.id)}>`;
  const err = (field, msg) => errors.push(`${label}: ${field} ${msg}`);

  if (!isStr(g?.id)) {
    err('id', 'must be a non-empty string');
  } else {
    if (!/^[a-z0-9-]+$/.test(g.id)) err('id', `"${g.id}" must match [a-z0-9-]+`);
    if (!existsSync(path.join(root, 'src/games', `${g.id}.ts`))) {
      err('id', `"${g.id}" has no matching src/games/${g.id}.ts on disk`);
    }
    if (seenIds.has(g.id)) err('id', `"${g.id}" is duplicated in the manifest`);
    seenIds.add(g.id);
  }

  if (!isStr(g?.names?.th)) err('names.th', 'must be a non-empty string');
  if (!isStr(g?.names?.en)) err('names.en', 'must be a non-empty string');

  // การ์ด OG ใช้ field นี้เป็นบรรทัดฮุก — ว่างเมื่อไหร่ scripts/make-og.mjs หยุดทันที
  if (!isStr(g?.tagline) || g.tagline.trim() === '') err('tagline', 'must be a non-empty string');

  if (g?.category !== 'party' && g?.category !== 'fortune') {
    err('category', `is ${JSON.stringify(g?.category)}, must be "party" or "fortune"`);
  }

  if (!Array.isArray(g?.players) || g.players.length !== 2 || g.players.some((n) => typeof n !== 'number')) {
    err('players', 'must be a 2-element number array');
  } else {
    const [min, max] = g.players;
    if (min < 2) err('players[0]', `is ${min}, must be >= 2`);
    if (max < min) err('players[1]', `is ${max}, must be >= players[0] (${min})`);
  }

  if (!isStrArray(g?.keywords)) err('keywords', 'must be an array of strings');
  if (!isStrArray(g?.needs)) err('needs', 'must be an array of strings');

  if (!isStr(g?.seo?.title)) err('seo.title', 'must be a non-empty string');
  if (!isStr(g?.seo?.description)) err('seo.description', 'must be a non-empty string');
  if (!Array.isArray(g?.seo?.steps) || g.seo.steps.length < 3 || !g.seo.steps.every(isStr)) {
    err('seo.steps', 'must be an array of at least 3 non-empty strings');
  }

  if (!isStr(g?.og)) {
    err('og', 'must be a non-empty string');
  } else if (!existsSync(path.join(root, 'public/og', g.og))) {
    err('og', `"${g.og}" — public/og/${g.og} does not exist`);
  }

  if (g?.ads !== false) err('ads', 'must be false — no ad slots on play screens');

  if (!isFn(g?.mount)) err('mount', 'must be a function');
  if (!isFn(g?.dispose)) err('dispose', 'must be a function');
  if (g?.onVisibility !== undefined && !isFn(g.onVisibility)) {
    err('onVisibility', 'must be a function when present');
  }
});

if (errors.length > 0) {
  console.error(`validate-games: ${errors.length} violation(s):`);
  for (const line of errors) console.error(`  ${line}`);
  process.exit(1);
}

console.log(`validate-games: ${games.length} game(s) OK`);
