#!/usr/bin/env node
// Build-time gate: reads the real games manifest and the category manifest and fails naming
// FILE + FIELD for any GameModule that violates the contract in src/games/types.ts, any game whose
// category has no manifest entry, and any manifest entry no game claims (gh#74). See issue #13.
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
const categoriesPath = path.join(root, 'src/games/categories.ts');

// Games that must never generate an ad request at all, keyed by id, valued by the reason. A game NOT
// in here may set ads either way — that is a revenue choice and no gate's business.
//
// The direction is deliberate, and it is a denylist rather than an allowlist because the two errors
// are not equally costly. A wrong `ads: true` on a page in this map is an account-termination-class
// risk; a wrong `ads: false` anywhere else only loses revenue. A denylist fails toward the first and
// tolerates the second, and it enumerates "pages this project decided must never request an ad" — a
// set this repo's own decision record owns, which grows only by an owner ruling. An allowlist would
// instead enumerate "pages allowed to earn", blocking the build on a revenue choice and needing an
// edit for every new game.
//
// What this does NOT do: it does not enumerate what Google classifies as restricted content. That set
// belongs to Google's policy engine, changes without notice, and never converges by patching. This map
// records decisions already taken about specific pages, nothing more.
//
// It replaced a blanket "ads must be false" rule that the scaffold introduced. Issue #13's amendment 8
// states the actual decision as no ad slot on the PLAY SCREEN, naming the how-to-play prose below the
// game and the hub as inventory — which is where GameLayout renders the slot. The scaffold flattened
// "never on the play screen" into "never on the page", and that flattened rule then kept every game
// page slot-free. Issue #5's game table carries the per-game values.
const NO_AD_REQUEST = {
  'pick-loser':
    'the "ใครแพ้หมดแก้ว" page is AdSense restricted content (issue #10): it carries an Auto ads page ' +
    'exclusion and must place no manual slot, so it generates no ad request at all',
};

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isStrArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isFn = (v) => typeof v === 'function';

// ---------------------------------------------------------------------------
// Pure(ish): games array + categories record -> violation strings. The only IO is existsSync, and it
// resolves against `checkRoot` rather than a hardcoded path, so the selftest can point both existence
// checks (id -> src/games/<id>.ts, og -> public/og/<og>) at a temp fixture tree instead of the real
// repo. Normal invocation below passes the real `root` and the real categories record; the selftest
// passes fixture records, so behaviour there is unchanged.
// ---------------------------------------------------------------------------
function validateGames(games, checkRoot, categories) {
  const errors = [];
  // ADR-0019: a gate's green must not imply coverage it has not earned. Every rule below is
  // per-game, so an empty array satisfies all of them vacuously and main() prints
  // "validate-games: 0 game(s) OK" — measured by emptying the manifest array: exit 0, and the
  // prebuild that runs this on every build waves a gameless site through. Zero games is not a
  // clean manifest, it is nothing having been validated.
  if (!Array.isArray(games) || games.length === 0) {
    return [
      `src/games/manifest.ts: \`games\` is ${Array.isArray(games) ? 'an empty array' : JSON.stringify(games)} — ` +
        'the validated set must never be empty (docs/adr/0019), or every per-game rule below passes ' +
        'vacuously and this gate reports OK having checked nothing.',
    ];
  }
  // gh#74 + ADR-0019: the category manifest must itself be non-empty, or both category gates below
  // pass vacuously — the membership check knows no category and the unclaimed-key gate verifies no
  // keys — and the site would build zero /c/ listing pages while this gate reports OK.
  const isCategoryRecord =
    typeof categories === 'object' && categories !== null && !Array.isArray(categories);
  if (!isCategoryRecord || Object.keys(categories).length === 0) {
    return [
      `src/games/categories.ts: \`categories\` is ${isCategoryRecord ? 'an empty record' : JSON.stringify(categories)} — ` +
        'the category manifest must never be empty (docs/adr/0019): with zero keys the membership ' +
        'check below knows no category and the unclaimed-key gate below verifies no keys, so both ' +
        'pass vacuously and the site would build zero /c/ category pages while this gate reports OK.',
    ];
  }
  const categoryKeys = Object.keys(categories);

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

    // gh#74: `categories` is the single runtime source of truth for which categories exist — the
    // /c/<slug>/ pages render from the same keys, so a category outside the record has no listing.
    if (!Object.prototype.hasOwnProperty.call(categories, g?.category)) {
      err('category', `is ${JSON.stringify(g?.category)}, must be one of: ${categoryKeys.join(', ')}`);
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

    if (typeof g?.ads !== 'boolean') {
      err('ads', 'must be a boolean');
    } else if (g.ads === true && NO_AD_REQUEST[g.id]) {
      err('ads', `must be false for "${g.id}" — ${NO_AD_REQUEST[g.id]}`);
    }

    if (!isFn(g?.mount)) err('mount', 'must be a function');
    if (!isFn(g?.dispose)) err('dispose', 'must be a function');
    if (g?.onVisibility !== undefined && !isFn(g.onVisibility)) {
      err('onVisibility', 'must be a function when present');
    }
  });

  // gh#74 inverse direction: every key of the category manifest must be claimed by at least one game,
  // or its /c/<slug>/ listing would build with zero games while this gate still reports OK.
  const claimed = new Set(games.map((g) => g?.category));
  for (const key of categoryKeys) {
    if (!claimed.has(key)) {
      errors.push(
        `src/games/categories.ts: category "${key}" is not claimed by any game in the manifest — ` +
          'every key of the categories record must be claimed by at least one game (docs/adr/0019), ' +
          'or its /c/ listing would build with zero games while this gate reports OK.',
      );
    }
  }

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
    // the ads denylist case below mutates the fixture's id, so it needs its own two files on disk —
    // otherwise it would trip the id and og existence rules and pass for the wrong reason
    fs.writeFileSync(path.join(tmpDir, 'src/games/pick-loser.ts'), '');
    fs.writeFileSync(path.join(tmpDir, 'public/og/pick-loser.png'), '');

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

    // Category-manifest fixtures for the gh#74 gates (the validator only reads Object.keys, so the
    // values are placeholders): partyOnly leaves every key claimed by goodGame, partyAndFortune
    // leaves 'fortune' unclaimed.
    const categoryMeta = (key) => ({
      label: `label ${key}`,
      whenToUse: 'when To Use',
      intro: 'intro',
      accent: 'accent',
      seo: { title: 'title', description: 'description' },
    });
    const partyOnly = { party: categoryMeta('party') };
    const partyAndFortune = { party: categoryMeta('party'), fortune: categoryMeta('fortune') };

    // --- known-good: guards against a selftest that always fails. ---
    assert.deepEqual(validateGames([goodGame()], tmpDir, partyOnly), [], 'a fully-valid GameModule must report zero violations');
    console.log('PASS known-good: a fully-valid GameModule reports zero violations');

    // The ads rule has to be calibrated in BOTH directions. The blanket rule this replaced made every
    // ads: true a violation, so a selftest that only proves the failing direction would have passed
    // against the wrong gate too. This is the case that would have caught it.
    assert.deepEqual(
      validateGames([{ ...goodGame(), ads: true }], tmpDir, partyOnly), [],
      'ads: true on a game that is not on the no-ad-request denylist must report zero violations',
    );
    console.log('PASS known-good: ads: true on an ordinary game reports zero violations');

    // --- known-bad, one case per rule. Each mutates exactly one field off the good fixture so the
    // resulting violation is attributable to that rule, not a side effect of another one. ---
    const cases = [
      { field: 'id (missing)', mutate: (g) => ({ ...g, id: undefined }), expect: /id must be a non-empty string/ },
      { field: 'id (bad pattern)', mutate: (g) => ({ ...g, id: 'Happy Game' }), expect: /id "Happy Game" must match/ },
      { field: 'id (no file on disk)', mutate: (g) => ({ ...g, id: 'ghost-game' }), expect: /id "ghost-game" has no matching src\/games\/ghost-game\.ts on disk/ },
      { field: 'names.th', mutate: (g) => ({ ...g, names: { ...g.names, th: '' } }), expect: /names\.th must be a non-empty string/ },
      { field: 'names.en', mutate: (g) => ({ ...g, names: { ...g.names, en: '' } }), expect: /names\.en must be a non-empty string/ },
      { field: 'tagline', mutate: (g) => ({ ...g, tagline: '   ' }), expect: /tagline must be a non-empty string/ },
      { field: 'category', mutate: (g) => ({ ...g, category: 'quiz' }), expect: /category is "quiz", must be one of: party/ },
      { field: 'players (shape)', mutate: (g) => ({ ...g, players: [2] }), expect: /players must be a 2-element number array/ },
      { field: 'players[0] (min < 2)', mutate: (g) => ({ ...g, players: [1, 10] }), expect: /players\[0\] is 1, must be >= 2/ },
      { field: 'players[1] (max < min)', mutate: (g) => ({ ...g, players: [5, 2] }), expect: /players\[1\] is 2, must be >= players\[0\] \(5\)/ },
      { field: 'keywords', mutate: (g) => ({ ...g, keywords: ['party', 1] }), expect: /keywords must be an array of strings/ },
      { field: 'seo.title', mutate: (g) => ({ ...g, seo: { ...g.seo, title: '' } }), expect: /seo\.title must be a non-empty string/ },
      { field: 'seo.description', mutate: (g) => ({ ...g, seo: { ...g.seo, description: '' } }), expect: /seo\.description must be a non-empty string/ },
      { field: 'seo.steps (too few)', mutate: (g) => ({ ...g, seo: { ...g.seo, steps: ['หนึ่ง', 'สอง'] } }), expect: /seo\.steps must be an array of at least 3 non-empty strings/ },
      { field: 'og (not a string)', mutate: (g) => ({ ...g, og: '' }), expect: /og must be a non-empty string/ },
      { field: 'og (file missing)', mutate: (g) => ({ ...g, og: 'ghost.png' }), expect: /og "ghost\.png" — public\/og\/ghost\.png does not exist/ },
      { field: 'ads (not a boolean)', mutate: (g) => ({ ...g, ads: 'yes' }), expect: /ads must be a boolean/ },
      { field: 'ads (true on a no-ad-request id)', mutate: (g) => ({ ...g, id: 'pick-loser', og: 'pick-loser.png', ads: true }), expect: /ads must be false for "pick-loser" — the "\u0e43\u0e04\u0e23\u0e41\u0e1e\u0e49\u0e2b\u0e21\u0e14\u0e41\u0e01\u0e49\u0e27" page is AdSense restricted content/ },
      { field: 'mount', mutate: (g) => ({ ...g, mount: undefined }), expect: /mount must be a function/ },
      { field: 'dispose', mutate: (g) => ({ ...g, dispose: undefined }), expect: /dispose must be a function/ },
      { field: 'onVisibility (present, not a function)', mutate: (g) => ({ ...g, onVisibility: 'nope' }), expect: /onVisibility must be a function when present/ },
    ];

    for (const { field, mutate, expect } of cases) {
      const errors = validateGames([mutate(goodGame())], tmpDir, partyOnly);
      assert.ok(errors.length > 0, `${field}: known-bad fixture must report at least one violation`);
      assert.ok(errors.some((e) => expect.test(e)), `${field}: expected a violation matching ${expect}, got: ${JSON.stringify(errors)}`);
    }
    console.log(`PASS known-bad: ${cases.length} case(s), one per rule (${cases.map((c) => c.field).join(', ')})`);

    // --- known-bad for the category manifest gates (gh#74): both directions. ---
    // A game whose category has no manifest entry must fail naming the category (the old category
    // left unclaimed is a second, equally-correct violation — assert only on the gate's own message).
    const noEntryErrors = validateGames([{ ...goodGame(), category: 'nonexistent' }], tmpDir, partyOnly);
    assert.ok(
      noEntryErrors.some((e) => /category is "nonexistent", must be one of: party/.test(e)),
      `gh#74 no-entry: expected a violation naming the unknown category, got: ${JSON.stringify(noEntryErrors)}`,
    );
    // A manifest entry claimed by no game must fail naming the key — goodGame is 'party', so with
    // partyAndFortune the 'fortune' key has no claimant.
    const unclaimedErrors = validateGames([goodGame()], tmpDir, partyAndFortune);
    assert.equal(unclaimedErrors.length, 1, `gh#74 unclaimed: expected exactly one violation, got: ${JSON.stringify(unclaimedErrors)}`);
    assert.match(unclaimedErrors[0], /category "fortune" is not claimed by any game/);
    console.log('PASS known-bad category gates: a game whose category has no manifest entry and a manifest entry no game claims each fail, naming category and key');

    // --- known-bad, EMPTY CATEGORY MANIFEST (ADR-0019): with zero keys the membership check knows no
    // category and the unclaimed-key gate verifies no keys — both pass vacuously and the site would
    // build zero /c/ pages green. Delete the guard and these cases go green. ---
    for (const [label, value] of [['empty record', {}], ['undefined', undefined], ['not a record', 42]]) {
      const catErrs = validateGames([goodGame()], tmpDir, value);
      assert.equal(catErrs.length, 1, `gh#74 categories ${label}: an unusable categories export must produce exactly one violation`);
      assert.match(catErrs[0], /category manifest must never be empty/, `gh#74 categories ${label}: the violation must say the category manifest was empty`);
    }
    console.log('PASS known-bad empty categories: {}, undefined and a non-record each fail — zero keys would make both category gates vacuous');

    // --- known-bad, EMPTY SET: every rule above is per-game, so an empty array passed all of them
    // and main() printed "0 game(s) OK". Delete the guard and this case goes green. ---
    for (const [label, value] of [['empty array', []], ['undefined export', undefined], ['not an array', {}]]) {
      const errs = validateGames(value, tmpDir, partyOnly);
      assert.equal(errs.length, 1, `${label}: an unusable games export must produce exactly one violation`);
      assert.match(errs[0], /must never be empty/, `${label}: the violation must say the validated set was empty`);
    }
    console.log('PASS known-bad empty set: [], undefined and a non-array games export each fail — a per-game rule set is satisfied vacuously by zero games, and "0 game(s) OK" is a green nothing earned');

    // --- known-bad, duplicate id: only the SECOND occurrence is flagged. ---
    const dupErrors = validateGames([goodGame(), goodGame()], tmpDir, partyOnly);
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

  // gh#74: the category manifest is the second runtime source of truth — both category gates check
  // Object.keys(categories), so it must be the same record the /c/ pages render from. Loaded like the
  // games manifest: categories.ts's only relative import is `import type`, which node erases, so
  // plain node never has to resolve a specifier inside it.
  let categories;
  try {
    ({ categories } = await import(categoriesPath));
  } catch (err) {
    console.error(`validate-games: failed to import src/games/categories.ts — ${err.message}`);
    process.exit(1);
  }

  const errors = validateGames(games, root, categories);

  if (errors.length > 0) {
    console.error(`validate-games: ${errors.length} violation(s):`);
    for (const line of errors) console.error(`  ${line}`);
    process.exit(1);
  }

  console.log(`validate-games: ${games.length} game(s) OK`);
}

await main();
