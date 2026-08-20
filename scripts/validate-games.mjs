#!/usr/bin/env node
// Build-time gate: reads the real manifest and fails naming FILE + FIELD for any
// GameModule that violates the contract in src/games/types.ts. See issue #13.
//
//   node scripts/validate-games.mjs             -> import src/games/manifest.ts, validate every GameModule
//   node scripts/validate-games.mjs --selftest  -> both-direction calibration on in-memory + temp-dir fixtures
import { existsSync } from 'node:fs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// No resolve hook needed: manifest.ts writes the full .ts extension on every game import,
// so node finds the file directly (Vite/Astro already accept the full extension too)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'src/games/manifest.ts');

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isStrArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isFn = (v) => typeof v === 'function';

// ---------------------------------------------------------------------------
// Pure(ish): games array -> violation strings. The only IO is existsSync, and it resolves against
// `checkRoot` rather than a hardcoded path, so the selftest can point both existence checks (id ->
// src/games/<id>.ts, og -> public/og/<og>) at a temp fixture tree instead of the real repo. Normal
// invocation below always passes the real `root`, so behaviour there is unchanged.
// ---------------------------------------------------------------------------
function validateGames(games, checkRoot) {
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
      if (!existsSync(path.join(checkRoot, 'src/games', `${g.id}.ts`))) {
        err('id', `"${g.id}" has no matching src/games/${g.id}.ts on disk`);
      }
      if (seenIds.has(g.id)) err('id', `"${g.id}" is duplicated in the manifest`);
      seenIds.add(g.id);
    }

    if (!isStr(g?.names?.th)) err('names.th', 'must be a non-empty string');
    if (!isStr(g?.names?.en)) err('names.en', 'must be a non-empty string');

    // The OG card uses this field as its hook line — if it's empty, scripts/make-og.mjs stops immediately
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

    if (!isStr(g?.seo?.title)) err('seo.title', 'must be a non-empty string');
    if (!isStr(g?.seo?.description)) err('seo.description', 'must be a non-empty string');
    if (!Array.isArray(g?.seo?.steps) || g.seo.steps.length < 3 || !g.seo.steps.every(isStr)) {
      err('seo.steps', 'must be an array of at least 3 non-empty strings');
    }

    if (!isStr(g?.og)) {
      err('og', 'must be a non-empty string');
    } else if (!existsSync(path.join(checkRoot, 'public/og', g.og))) {
      err('og', `"${g.og}" — public/og/${g.og} does not exist`);
    }

    if (g?.ads !== false) err('ads', 'must be false — no ad slots on play screens');

    if (!isFn(g?.mount)) err('mount', 'must be a function');
    if (!isFn(g?.dispose)) err('dispose', 'must be a function');
    if (g?.onVisibility !== undefined && !isFn(g.onVisibility)) {
      err('onVisibility', 'must be a function when present');
    }
  });

  return errors;
}

// ---------------------------------------------------------------------------
// Self-test: an in-memory fixture game plus a temp dir standing in for the repo root (never
// src/games/ or public/og themselves) — calibrated both ways, one known-bad case per rule this
// validator enforces above.
// ---------------------------------------------------------------------------
function selftest() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-games-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'src/games'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'public/og'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src/games/happy-game.ts'), '');
    fs.writeFileSync(path.join(tmpDir, 'public/og/happy-game.png'), '');

    const goodGame = () => ({
      id: 'happy-game',
      names: { th: 'สวัสดี', en: 'Hello' },
      tagline: 'สนุกมาก',
      category: 'party',
      players: [2, 10],
      keywords: ['party', 'สนุก'],
      seo: { title: 'ชื่อ', description: 'คำอธิบาย', steps: ['หนึ่ง', 'สอง', 'สาม'] },
      og: 'happy-game.png',
      ads: false,
      mount: () => {},
      dispose: () => {},
    });

    // --- known-good: guards against a selftest that always fails. ---
    assert.deepEqual(validateGames([goodGame()], tmpDir), [], 'a fully-valid GameModule must report zero violations');
    console.log('PASS known-good: a fully-valid GameModule reports zero violations');

    // --- known-bad, one case per rule. Each mutates exactly one field off the good fixture so the
    // resulting violation is attributable to that rule, not a side effect of another one. ---
    const cases = [
      { field: 'id (missing)', mutate: (g) => ({ ...g, id: undefined }), expect: /id must be a non-empty string/ },
      { field: 'id (bad pattern)', mutate: (g) => ({ ...g, id: 'Happy Game' }), expect: /id "Happy Game" must match/ },
      { field: 'id (no file on disk)', mutate: (g) => ({ ...g, id: 'ghost-game' }), expect: /id "ghost-game" has no matching src\/games\/ghost-game\.ts on disk/ },
      { field: 'names.th', mutate: (g) => ({ ...g, names: { ...g.names, th: '' } }), expect: /names\.th must be a non-empty string/ },
      { field: 'names.en', mutate: (g) => ({ ...g, names: { ...g.names, en: '' } }), expect: /names\.en must be a non-empty string/ },
      { field: 'tagline', mutate: (g) => ({ ...g, tagline: '   ' }), expect: /tagline must be a non-empty string/ },
      { field: 'category', mutate: (g) => ({ ...g, category: 'quiz' }), expect: /category is "quiz", must be "party" or "fortune"/ },
      { field: 'players (shape)', mutate: (g) => ({ ...g, players: [2] }), expect: /players must be a 2-element number array/ },
      { field: 'players[0] (min < 2)', mutate: (g) => ({ ...g, players: [1, 10] }), expect: /players\[0\] is 1, must be >= 2/ },
      { field: 'players[1] (max < min)', mutate: (g) => ({ ...g, players: [5, 2] }), expect: /players\[1\] is 2, must be >= players\[0\] \(5\)/ },
      { field: 'keywords', mutate: (g) => ({ ...g, keywords: ['party', 1] }), expect: /keywords must be an array of strings/ },
      { field: 'seo.title', mutate: (g) => ({ ...g, seo: { ...g.seo, title: '' } }), expect: /seo\.title must be a non-empty string/ },
      { field: 'seo.description', mutate: (g) => ({ ...g, seo: { ...g.seo, description: '' } }), expect: /seo\.description must be a non-empty string/ },
      { field: 'seo.steps (too few)', mutate: (g) => ({ ...g, seo: { ...g.seo, steps: ['หนึ่ง', 'สอง'] } }), expect: /seo\.steps must be an array of at least 3 non-empty strings/ },
      { field: 'og (not a string)', mutate: (g) => ({ ...g, og: '' }), expect: /og must be a non-empty string/ },
      { field: 'og (file missing)', mutate: (g) => ({ ...g, og: 'ghost.png' }), expect: /og "ghost\.png" — public\/og\/ghost\.png does not exist/ },
      { field: 'ads', mutate: (g) => ({ ...g, ads: true }), expect: /ads must be false — no ad slots on play screens/ },
      { field: 'mount', mutate: (g) => ({ ...g, mount: undefined }), expect: /mount must be a function/ },
      { field: 'dispose', mutate: (g) => ({ ...g, dispose: undefined }), expect: /dispose must be a function/ },
      { field: 'onVisibility (present, not a function)', mutate: (g) => ({ ...g, onVisibility: 'nope' }), expect: /onVisibility must be a function when present/ },
    ];

    for (const { field, mutate, expect } of cases) {
      const errors = validateGames([mutate(goodGame())], tmpDir);
      assert.ok(errors.length > 0, `${field}: known-bad fixture must report at least one violation`);
      assert.ok(errors.some((e) => expect.test(e)), `${field}: expected a violation matching ${expect}, got: ${JSON.stringify(errors)}`);
    }
    console.log(`PASS known-bad: ${cases.length} case(s), one per rule (${cases.map((c) => c.field).join(', ')})`);

    // --- known-bad, duplicate id: only the SECOND occurrence is flagged. ---
    const dupErrors = validateGames([goodGame(), goodGame()], tmpDir);
    assert.equal(dupErrors.length, 1, 'a duplicated id must be flagged exactly once');
    assert.match(dupErrors[0], /id "happy-game" is duplicated in the manifest/);
    console.log('PASS known-bad: a repeated id is flagged as duplicated exactly once (first occurrence stays clean)');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true }); // ponytail: hermetic — nothing under the real src/games/ or public/og/ is ever touched
  }
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  let games;
  try {
    ({ games } = await import(manifestPath));
  } catch (err) {
    console.error(`validate-games: failed to import src/games/manifest.ts — ${err.message}`);
    process.exit(1);
  }

  const errors = validateGames(games, root);

  if (errors.length > 0) {
    console.error(`validate-games: ${errors.length} violation(s):`);
    for (const line of errors) console.error(`  ${line}`);
    process.exit(1);
  }

  console.log(`validate-games: ${games.length} game(s) OK`);
}

await main();
