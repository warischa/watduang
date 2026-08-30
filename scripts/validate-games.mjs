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
//
// gh#154, 2026-08-30: THIS MAP IS NOW EMPTY, and that means the rule below has ZERO live instances.
// Its only entry was the party game deleted by that ticket (issue #10 had excluded that one page from
// Auto ads as restricted content). The entry went with the page rather than staying behind as a
// record of a decision about a URL that no longer resolves. The rule itself is NOT dead code: it is
// still exercised in both directions by the selftest against FIXTURE_NO_AD_REQUEST, and main() now
// prints the denylist size so a green never reads as "the ad-policy rule checked something".
const NO_AD_REQUEST = {};

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
function validateGames(games, checkRoot, categories, noAdRequest = NO_AD_REQUEST) {
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
      const isSolo = min === 1 && max === 1;
      // gh#96 / ADR-0040 rule 1: a min of 1 is legal only as [1, 1]. A [1, N>1] hybrid passes the
      // reopened min gate while skipping the panel, and ADR-0007's full-party enumeration then has no
      // party to enumerate. The field named is players[1] — it is the N that is not 1.
      if (min === 1 && !isSolo) {
        err('players[1]', `is ${max}, a page with min 1 must declare [1, 1] (docs/adr/0040)`);
      }
      if (min < 2 && min !== 1) err('players[0]', `is ${min}, must be >= 2`);
      if (max < min) err('players[1]', `is ${max}, must be >= players[0] (${min})`);
      // gh#96 / ADR-0040 rule 2: the "ดูดวง" (fortune) category and [1, 1] bind to each other. A party
      // range on a fortune page is a "เกม"-shape the category no longer contains; [1, 1] anywhere else
      // is a party-of-one page in a "หมวด" whose pages the panel still serves. Total over what the
      // module declares — no page-id list, for the same reason NO_AD_REQUEST must not be the model.
      if (g?.category === 'fortune' && !isSolo) {
        err('players', `is [${min}, ${max}], a fortune page must declare [1, 1] (docs/adr/0040)`);
      } else if (isSolo && g?.category !== 'fortune') {
        err('players', 'is [1, 1], only a fortune page may declare a party of one (docs/adr/0040)');
      }
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
    } else if (g.ads === true && noAdRequest[g.id]) {
      err('ads', `must be false for "${g.id}" — ${noAdRequest[g.id]}`);
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
    // otherwise it would trip the id and og existence rules and pass for the wrong reason. gh#154:
    // the id is a FIXTURE id, not a real page — the real denylist is empty, and a selftest keyed to a
    // real id would have gone unrunnable the moment that page was deleted.
    fs.writeFileSync(path.join(tmpDir, 'src/games/restricted-fixture.ts'), '');
    fs.writeFileSync(path.join(tmpDir, 'public/og/restricted-fixture.png'), '');

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

    // Known-good for the ADR-0040 binds: a fortune page declaring [1, 1] is the new legal shape. It
    // claims 'fortune' (so partyAndFortune's keys are all claimed) and needs its own id file on disk,
    // exactly like the restricted-fixture files above.
    fs.writeFileSync(path.join(tmpDir, 'src/games/solo-game.ts'), '');
    const soloGame = () => ({ ...goodGame(), id: 'solo-game', category: 'fortune', players: [1, 1] });

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

    // gh#154 — the ad-policy denylist the known-bad loop runs against. The REAL NO_AD_REQUEST is
    // empty (its only page was deleted), so a selftest reading the real map would exercise nothing.
    // A fixture denylist keeps the rule calibrated in the failing direction while the shipped map has
    // zero instances; `restricted-fixture` is not, and must never become, a real page id.
    const FIXTURE_NO_AD_REQUEST = { 'restricted-fixture': 'fixture page: AdSense restricted content' };

    // The ads rule has to be calibrated in BOTH directions. The blanket rule this replaced made every
    // ads: true a violation, so a selftest that only proves the failing direction would have passed
    // against the wrong gate too. This is the case that would have caught it.
    assert.deepEqual(
      validateGames([{ ...goodGame(), ads: true }], tmpDir, partyOnly, FIXTURE_NO_AD_REQUEST), [],
      'ads: true on a game that is not on the no-ad-request denylist must report zero violations',
    );
    console.log('PASS known-good: ads: true on an ordinary game reports zero violations');

    // --- known-good: gh#96 / ADR-0040 — [1, 1] on a fortune page is the legal solo shape. Guards
    // against the min >= 2 rule being reopened without the new shape becoming reachable. ---
    assert.deepEqual(
      validateGames([soloGame(), goodGame()], tmpDir, partyAndFortune),
      [],
      'a fortune page declaring [1, 1] must report zero violations, alongside a party page that still claims \'party\'',
    );
    console.log('PASS known-good: a fortune page declaring [1, 1] reports zero violations');

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
      { field: 'players[0] (min < 2, not 1)', mutate: (g) => ({ ...g, players: [0, 10] }), expect: /players\[0\] is 0, must be >= 2/ },
      // gh#96 / ADR-0040 rule 1: a min of 1 is legal only as [1, 1] — a [1, N>1] hybrid passes the
      // reopened min gate while ADR-0007's full-party enumeration has no party to enumerate.
      { field: 'players[1] (min is 1, max is not 1)', mutate: (g) => ({ ...g, players: [1, 3] }), expect: /players\[1\] is 3, a page with min 1 must declare \[1, 1\] \(docs\/adr\/0040\)/ },
      { field: 'players[1] (max < min)', mutate: (g) => ({ ...g, players: [5, 2] }), expect: /players\[1\] is 2, must be >= players\[0\] \(5\)/ },
      { field: 'keywords', mutate: (g) => ({ ...g, keywords: ['party', 1] }), expect: /keywords must be an array of strings/ },
      { field: 'seo.title', mutate: (g) => ({ ...g, seo: { ...g.seo, title: '' } }), expect: /seo\.title must be a non-empty string/ },
      { field: 'seo.description', mutate: (g) => ({ ...g, seo: { ...g.seo, description: '' } }), expect: /seo\.description must be a non-empty string/ },
      { field: 'seo.steps (too few)', mutate: (g) => ({ ...g, seo: { ...g.seo, steps: ['หนึ่ง', 'สอง'] } }), expect: /seo\.steps must be an array of at least 3 non-empty strings/ },
      { field: 'og (not a string)', mutate: (g) => ({ ...g, og: '' }), expect: /og must be a non-empty string/ },
      { field: 'og (file missing)', mutate: (g) => ({ ...g, og: 'ghost.png' }), expect: /og "ghost\.png" — public\/og\/ghost\.png does not exist/ },
      { field: 'ads (not a boolean)', mutate: (g) => ({ ...g, ads: 'yes' }), expect: /ads must be a boolean/ },
      { field: 'ads (true on a no-ad-request id)', mutate: (g) => ({ ...g, id: 'restricted-fixture', og: 'restricted-fixture.png', ads: true }), expect: /ads must be false for "restricted-fixture" — fixture page: AdSense restricted content/ },
      { field: 'mount', mutate: (g) => ({ ...g, mount: undefined }), expect: /mount must be a function/ },
      { field: 'dispose', mutate: (g) => ({ ...g, dispose: undefined }), expect: /dispose must be a function/ },
      { field: 'onVisibility (present, not a function)', mutate: (g) => ({ ...g, onVisibility: 'nope' }), expect: /onVisibility must be a function when present/ },
    ];

    for (const { field, mutate, expect } of cases) {
      const errors = validateGames([mutate(goodGame())], tmpDir, partyOnly, FIXTURE_NO_AD_REQUEST);
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

    // --- known-bad, gh#96 / ADR-0040 rule 2: the "ดูดวง" (fortune) category and [1, 1] bind to each
    // other. Each direction mutates exactly one field off the good fixture, and each runs against a
    // category record where its shape is otherwise a valid member, so the single violation it
    // produces is attributable to the cross-rule and to nothing else. ---
    const fortuneOnly = { fortune: categoryMeta('fortune') };
    const soloRange = validateGames([{ ...goodGame(), category: 'fortune' }], tmpDir, fortuneOnly);
    assert.equal(soloRange.length, 1, 'rule 2, fortune direction: a fortune page with a party range must produce exactly one violation');
    assert.match(
      soloRange[0],
      /players is \[2, 10\], a fortune page must declare \[1, 1\] \(docs\/adr\/0040\)/,
      `rule 2, fortune direction: expected the violation to name the players field, got: ${JSON.stringify(soloRange)}`,
    );
    assert.match(soloRange[0], /^src\/games\/happy-game\.ts: /, 'rule 2, fortune direction: the violation must name the file');
    const partySolo = validateGames([{ ...goodGame(), players: [1, 1] }], tmpDir, partyOnly);
    assert.equal(partySolo.length, 1, 'rule 2, party direction: a party page declaring [1, 1] must produce exactly one violation');
    assert.match(
      partySolo[0],
      /players is \[1, 1\], only a fortune page may declare a party of one \(docs\/adr\/0040\)/,
      `rule 2, party direction: expected the violation to name the players field, got: ${JSON.stringify(partySolo)}`,
    );
    assert.match(partySolo[0], /^src\/games\/happy-game\.ts: /, 'rule 2, party direction: the violation must name the file');
    console.log('PASS known-bad ADR-0040 binds: fortune + party range and party + [1, 1] each fail, naming file and field');

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

  // gh#154 / ADR-0019 — the denylist size is printed, not implied. With zero entries the ad-policy
  // rule fires on nothing, so a green here says nothing about ad policy; it says every other per-game
  // rule passed. NOT covered by this line either way: whether Google classifies any shipped page as
  // restricted content (that set is Google's, not this repo's).
  const denyIds = Object.keys(NO_AD_REQUEST);
  const denyNote = denyIds.length === 0
    ? ' · no-ad-request denylist is EMPTY — the ad-policy rule matched 0 game(s) and is NOT MEASURING (calibrated only by --selftest against a fixture denylist)'
    : ` · no-ad-request denylist: ${denyIds.length} id(s) — ${denyIds.join(', ')}`;
  console.log(`validate-games: ${games.length} game(s) OK${denyNote}`);
}

await main();
