// gh#304: the play routes OUTSIDE the party category, for the gates whose subject is the shared player
// screen (ADR-0071), which is the party category's roster (ADR-0039). Those gates scope themselves to
// party routes; this module is how each of them names what it leaves out instead of skipping it in
// silence, and re-proves why on every run: a route outside party that references the shared screen's
// directory (src/play/_player-screen/) is NOT out of scope, and the calling gate fails on it.
//
// Not a gate itself: no CLI, imported by scripts/player-screen-mount-check.mjs,
// scripts/render-suspension-check.mjs and scripts/seat-cap-check.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** True when any non-test source file in `dir` names the shared player screen's directory. */
export function referencesPlayerScreen(files) {
  return Object.values(files).some((text) => text.includes('_player-screen'));
}

function routeSources(root, id) {
  const dir = path.join(root, 'src/play', id);
  if (!fs.existsSync(dir)) return {};
  const files = {};
  for (const name of fs.readdirSync(dir).sort()) {
    if (!/\.(ts|js|html)$/.test(name) || name.includes('.test.')) continue;
    files[name] = fs.readFileSync(path.join(dir, name), 'utf8');
  }
  return files;
}

/** [{ id, category, mountsScreen }] for every manifest game with a playRoute outside the party category. */
export async function nonPartyPlayRoutes(root) {
  const { games } = await import(pathToFileURL(path.join(root, 'src/games/manifest.ts')).href);
  return games
    .filter((g) => g.playRoute && g.category !== 'party')
    .map((g) => ({ id: g.id, category: g.category, mountsScreen: referencesPlayerScreen(routeSources(root, g.id)) }));
}

/** The failure lines for routes whose out-of-scope reason did not survive re-proof. */
export function refutedOutOfScope(routes, gate) {
  return routes
    .filter((r) => r.mountsScreen)
    .map((r) => `${r.id}: a ${r.category} play route references src/play/_player-screen/, so it is NOT outside ${gate}'s scope -- widen the gate to cover it`);
}

/** The line a gate prints so its green names what it did not scan. */
export function outOfScopeLine(routes, gate) {
  const ids = routes.map((r) => `${r.id} (${r.category})`).join(', ') || 'none';
  return `${gate}: out of scope, re-proved to mount no shared player screen: ${routes.length} non-party play route(s): ${ids}`;
}
