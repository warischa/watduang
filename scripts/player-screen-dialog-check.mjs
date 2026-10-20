#!/usr/bin/env node
// Static pin for ADR-0024's first property on the shared player screen (gh#279): each of the two
// dialogs, #ps-reset-dialog and #ps-edit-dialog, must be a real <dialog> element. The reason is the
// ADR's: a modal dialog sits in the top layer, so dismissing it never reflows the stage under the
// finger; a <div> that merely looks like a dialog does not.
//
// The second property (fails safe when showModal is missing) is a behaviour, pinned by
// src/play/_player-screen/no-showmodal.test.mjs over the DOM harness. Parsing player-screen.ts for a
// guard was rejected: that set belongs to the parser.
//
// ponytail: a source-text scan of one file. It reads the tag that carries each id and nothing more:
// it cannot see a dialog another stylesheet or script turns into something else at run time, and an
// attribute value holding a literal `>` would end the tag early (none is shipped, and the failure
// direction is a false red).
//
//   node scripts/player-screen-dialog-check.mjs             -> scan the real file, non-zero on any hit
//   node scripts/player-screen-dialog-check.mjs --selftest  -> both-direction calibration on fixtures

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { stripAstro } from './strip-comments.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const FILE = 'src/play/_player-screen/PlayerScreen.astro';
const DIALOG_IDS = ['ps-reset-dialog', 'ps-edit-dialog'];

// Blanks what is not live markup: JS and CSS comments through stripAstro(), HTML comments here
// (stripAstro leaves them), and every <style>/<script> body, so an id named in prose or in a
// selector cannot stand in for the element.
function liveMarkup(text) {
  return stripAstro(text)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
}

/** text -> violations. Pure: the selftest feeds it strings, main() feeds it the real file. */
function dialogViolations(text, ids = DIALOG_IDS) {
  const markup = liveMarkup(text);
  const out = [];
  for (const id of ids) {
    const tags = [...markup.matchAll(new RegExp(`<([A-Za-z][\\w-]*)\\b[^>]*\\bid\\s*=\\s*["']${id}["'][^>]*>`, 'g'))].map((m) => m[1]);
    if (tags.length === 0) out.push(`#${id} is not declared in ${FILE}`);
    else if (tags.length > 1) out.push(`#${id} is declared ${tags.length} times in ${FILE}`);
    else if (tags[0].toLowerCase() !== 'dialog') {
      out.push(`#${id} is a <${tags[0]}>, not a <dialog> -- ADR-0024: only a modal dialog keeps the stage still when it is dismissed`);
    }
  }
  return out;
}

const fixture = (resetTag, editTag) => `---\n---\n<template id="ps-template"></template>\n` +
  `<${editTag} class="ps-dialog" id="ps-edit-dialog"><button>x</button></${editTag}>\n` +
  `<${resetTag} class="ps-dialog" id="ps-reset-dialog"><button>x</button></${resetTag}>\n`;

function selftest() {
  // Positive control: the green fixture is green, so every red below is the check's doing.
  assert.deepEqual(dialogViolations(fixture('dialog', 'dialog')), [], 'a fixture with two real dialogs must pass');
  // Must-red, once per id: each id turned into a <div> is its own finding, and only its own.
  const resetDiv = dialogViolations(fixture('div', 'dialog'));
  assert.equal(resetDiv.length, 1);
  assert.match(resetDiv[0], /#ps-reset-dialog is a <div>/);
  const editDiv = dialogViolations(fixture('dialog', 'div'));
  assert.equal(editDiv.length, 1);
  assert.match(editDiv[0], /#ps-edit-dialog is a <div>/);
  // An id that vanished, or a second element claiming it, is not a pass.
  assert.match(dialogViolations(fixture('dialog', 'dialog').replace('id="ps-edit-dialog"', 'id="other"'))[0], /not declared/);
  assert.match(dialogViolations(fixture('dialog', 'dialog') + '<div id="ps-reset-dialog"></div>')[0], /2 times/);
  // A commented-out real dialog must not vouch for a live <div>, and prose must not trip a pass.
  const laundered = fixture('div', 'dialog') + '<!-- <dialog id="ps-reset-dialog"></dialog> -->';
  assert.match(dialogViolations(laundered)[0], /#ps-reset-dialog is a <div>/);
  // Attribute order does not matter.
  assert.deepEqual(dialogViolations(fixture('dialog', 'dialog').replace('class="ps-dialog" id="ps-edit-dialog"', 'id="ps-edit-dialog" class="ps-dialog"')), []);
  console.log('player-screen-dialog-check selftest: ok');
}

function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const text = fs.readFileSync(path.join(repoRoot, FILE), 'utf8');
  const violations = dialogViolations(text);
  if (violations.length) {
    for (const v of violations) console.error(`player-screen-dialog-check: ${v}`);
    process.exit(1);
  }
  console.log(`player-screen-dialog-check: ok -- ${DIALOG_IDS.length} dialogs are real <dialog> elements`);
}

main();
