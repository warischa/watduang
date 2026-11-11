#!/usr/bin/env node
// gh#303 board generator. Writes, into design/:
//   Gh303Fireworks.dc.html  the countdown-fireworks game: elimination and its final variant
//   Gh303Cards.dc.html      the deal-the-whole-room card game
//   Gh303Ladder.dc.html     the lane-picking ladder final
//   CatCompany-partyPop.dc.html   the company-party category page (the Cat<Slug>Pop twin for the slug gh#304 wired)
//   Gh303Home.dc.html       that category's row on the home page, at 1440 and 320
// Deterministic: seeded PRNGs, so a re-run writes the same bytes. Never imports the gh#302 generator.
// Usage: node make-boards.mjs [Board ...]   (no argument: every board)

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFireworks } from './board-fireworks.mjs';
import { buildCards } from './board-cards.mjs';
import { buildLadder } from './board-ladder.mjs';
import { buildCategory, buildHome } from './board-category.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const designDir = path.resolve(here, '../../../../design');
const ALL = { Gh303Fireworks: buildFireworks, Gh303Cards: buildCards, Gh303Ladder: buildLadder, 'CatCompany-partyPop': buildCategory, Gh303Home: buildHome };
const pick = process.argv.slice(2);
for (const [name, build] of Object.entries(ALL)) {
  if (pick.length && !pick.includes(name)) continue;
  const html = build();
  writeFileSync(path.join(designDir, `${name}.dc.html`), html);
  console.log(`${name}.dc.html ${Buffer.byteLength(html)} bytes`);
}
