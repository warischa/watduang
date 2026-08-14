// node --test — no framework, no dependency.
// sessionStorage does not exist in Node, so stub it with what the real one is: a string→string map.
// That is also what makes this test worth having — the checkpoint survives as JSON, not as an object.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const slots = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (slots.has(k) ? slots.get(k) : null),
  setItem: (k, v) => slots.set(k, String(v)),
  removeItem: (k) => slots.delete(k),
};

const { loadSession } = await import('./session.ts');

// #23 — "เริ่มรอบใหม่" abandons the round in progress on purpose. If the slot is not actually empty
// before the game mounts, the game's resume finds the old blob and the "new" round IS the old one.
test('#23 saveCheckpoint(null) empties the slot for real — a fresh round cannot inherit the old one', () => {
  slots.clear();
  const session = loadSession();
  session.setPlayers(['เอ', 'บี']);
  session.saveCheckpoint({ game: 'siamsi', players: ['เอ', 'บี'], holder: 0 });
  // positive control: the slot really held a round, so the null below is a clear and not an empty start
  assert.equal(loadSession().checkpoint.game, 'siamsi');

  session.saveCheckpoint(null);
  assert.equal(loadSession().checkpoint, null);
  // clearing the round must not clear the วง — the ticked group is the player's, not the round's
  assert.deepEqual(loadSession().players, ['เอ', 'บี']);
});
