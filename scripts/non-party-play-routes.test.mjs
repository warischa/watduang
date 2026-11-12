// node --test — the out-of-scope re-proof the player-screen gates share (gh#304).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outOfScopeLine, referencesPlayerScreen, refutedOutOfScope } from './non-party-play-routes.mjs';

test('a route that references the shared player screen is refuted as out of scope', () => {
  assert.equal(referencesPlayerScreen({ 'main.ts': "import { mountPlayerScreen } from '../_player-screen/player-screen.ts';" }), true);
  assert.equal(referencesPlayerScreen({ 'main.ts': "import { mountStage } from './stage.ts';" }), false);
  const lines = refutedOutOfScope([{ id: 'x', category: 'company-party', mountsScreen: true }, { id: 'y', category: 'company-party', mountsScreen: false }], 'g');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^x: .*NOT outside g's scope/);
});

test('the printed line names every route left out', () => {
  assert.match(outOfScopeLine([{ id: 'prize-draw', category: 'company-party' }], 'g'), /1 non-party play route\(s\): prize-draw \(company-party\)/);
  assert.match(outOfScopeLine([], 'g'), /0 non-party play route\(s\): none/);
});
