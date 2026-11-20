#!/usr/bin/env node
// gh#325 board generator, FROZEN kit file. Loads ONE board module named on argv by dynamic import and writes
// design/<BOARD.name>.dc.html. Boards are never imported statically: a sibling's half-written board-<x>.mjs can
// break only its own run. Deterministic: seeded PRNGs and literal values, so a re-run writes the same bytes.
// Usage: node make-boards.mjs board-<x>.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const designDir = path.resolve(here, '../../../../design');
const args = process.argv.slice(2);
if (args.length !== 1 || !/^board-[a-z0-9-]+\.mjs$/.test(path.basename(args[0]))) {
  console.error('usage: node make-boards.mjs board-<x>.mjs   (exactly one board module)');
  process.exit(2);
}
const mod = await import(pathToFileURL(path.resolve(here, path.basename(args[0]))).href);
const B = mod.BOARD;
if (!B || typeof B.name !== 'string' || !/^Gh\d+[A-Za-z0-9]+$/.test(B.name) || typeof B.build !== 'function') {
  console.error(`${args[0]}: must export BOARD = { name: 'Gh<n><Name>', build(), expect, plants, sel, floors }`);
  process.exit(2);
}
const html = B.build();
writeFileSync(path.join(designDir, `${B.name}.dc.html`), html);
console.log(`${B.name}.dc.html ${Buffer.byteLength(html)} bytes`);
