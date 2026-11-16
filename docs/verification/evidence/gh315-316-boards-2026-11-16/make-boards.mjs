#!/usr/bin/env node
// gh#315 / gh#316 board generator. Writes, into design/:
//   Gh315Zones.dc.html    the colour-zone stand-up elimination game (gh#315)
//   Gh316Marbles.dc.html  the marble-race elimination game (gh#316)
// Deterministic: seeded PRNGs and the gh#303 event fixture, so a re-run writes the same bytes.
// The gh#303 libs are imported read-only from their directory (see README, fork ruling); lib.mjs, stage.mjs and
// grammar.mjs are the local copies, each with its stated change. Never imports the gh#302 or gh#303 generators.
// Usage: node make-boards.mjs [Board ...]   (no argument: every board)

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildZones } from './board-zones.mjs';
import { buildMarbles } from './board-marbles.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const designDir = path.resolve(here, '../../../../design');
const ALL = { Gh315Zones: buildZones, Gh316Marbles: buildMarbles };
const pick = process.argv.slice(2);
for (const [name, build] of Object.entries(ALL)) {
  if (pick.length && !pick.includes(name)) continue;
  const html = build();
  writeFileSync(path.join(designDir, `${name}.dc.html`), html);
  console.log(`${name}.dc.html ${Buffer.byteLength(html)} bytes`);
}
