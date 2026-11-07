// node --test src/tools/wheel-arm-gate.test.mjs
// gh#295: the wheel's names-in gate (the shared arm gate, ADR-0016) and the page's own render() both
// write `disabled` on the spin button and the disc. These cases run the REAL page scripts, bundled
// out of the .astro files with the esbuild that ships inside astro, against the shared fake DOM and
// a fake clock, because the bug lives in how the two writers interleave and no source pin can see
// that. Three ways the gate used to hand back a control the wheel had disabled for its own reason:
// a mode change inside the window released spin early, a late in-window contact re-armed the gate
// under a running spin, and a one-name list arriving inside the window left spin enabled after it.
// Ceiling: the fake DOM has no layout, no CSS and no transitionend, so a spin lands on the page's own
// fallback timer, and taps are click() on the fake element with a hand-dispatched pointer stamp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { FakeElement, makeDocument } from '../games/_fake-dom.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const { build } = createRequire(repo + 'package.json')('esbuild');

async function bundle(rel) {
  const code = readFileSync(repo + rel, 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const out = await build({
    stdin: { contents: code, loader: 'ts', resolveDir: repo + rel.slice(0, rel.lastIndexOf('/')), sourcefile: rel },
    bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent',
  });
  return out.outputFiles[0].text;
}
const scripts = Promise.all([bundle('src/components/ToolNameEntry.astro'), bundle('src/pages/tool/wheel.astro')]);

function fakeClock() {
  let now = 0;
  let id = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms = 0) { const key = ++id; timers.set(key, { fn, at: now + ms }); return key; },
    clearTimeout(key) { timers.delete(key); },
    tick(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
      }
      now = end;
    },
  };
}

// The few element members the wheel script reads that the shared fake DOM does not carry.
FakeElement.prototype.scrollIntoView = function () {};
FakeElement.prototype.getBoundingClientRect = function () { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; };
Object.defineProperty(FakeElement.prototype, 'attributes', { get() { return Object.entries(this._attrs).map(([name, value]) => ({ name, value })); } });
Object.defineProperty(FakeElement.prototype, 'firstChild', { get() { return this.children[0] ?? null; } });
FakeElement.prototype.removeChild = function (kid) { this.children.splice(this.children.indexOf(kid), 1); };
Object.defineProperty(FakeElement.prototype, 'classList', { get() {
  const node = this;
  return {
    add(c) { node.className = [...new Set([...node.className.split(/\s+/).filter(Boolean), c])].join(' '); },
    remove(c) { node.className = node.className.split(/\s+/).filter((x) => x !== c).join(' '); },
  };
} });

async function page() {
  const [entryJs, wheelJs] = await scripts;
  const doc = makeDocument();
  const time = fakeClock();
  const els = {};
  const add = (id, tag, parent) => {
    const el = new FakeElement(tag, doc);
    el.id = id;
    els[id] = el;
    parent?.appendChild(el);
    return el;
  };
  const section = add('wheel', 'section');
  add('wheel-disc', 'button', section);
  add('wheel-group', 'g', els['wheel-disc']);
  for (const id of ['wheel-result', 'wheel-note', 'wheel-names']) add(id, 'div', section);
  for (const id of ['wheel-spin', 'wheel-stop', 'wheel-reset']) add(id, 'button', section);
  add('wheel-eliminate', 'input', section).checked = false;
  const root = add('tool-name-entry', 'div', section);
  root.dataset = { storageKey: 'test:wheel-names' };
  add('name-input', 'textarea', root).value = '';
  add('name-start', 'button', root);
  const auto = add('mode-auto', 'input', section);
  auto.value = 'auto';
  auto.checked = true;
  const press = add('mode-press', 'input', section);
  press.value = 'press';
  press.checked = false;
  doc.getElementById = (id) => els[id];
  doc.querySelector = (sel) => els[sel.slice(1)];
  doc.querySelectorAll = () => [auto, press];
  doc.createElementNS = (_, tag) => new FakeElement(tag, doc);
  doc.dispatchEvent = (ev) => { doc.fire(ev.type, ev); return true; };
  const store = new Map();
  const context = vm.createContext({
    document: doc,
    window: { matchMedia: () => ({ matches: false }), setTimeout: time.setTimeout },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    CustomEvent: class { constructor(type, props) { this.type = type; Object.assign(this, props); } },
    setTimeout: time.setTimeout, clearTimeout: time.clearTimeout, console, Intl, Math,
    // The stop handler reads the held disc angle; the fake DOM has no layout, so it reads as unrotated.
    getComputedStyle: () => ({ transform: 'none' }),
  });
  vm.runInContext(entryJs, context);
  vm.runInContext(wheelJs, context);
  // One finger contact now: the document seed the gate anchors to, then the section's restart leg.
  const contact = () => {
    const ev = { timeStamp: time.now() };
    doc.fire('pointerdown', ev);
    section.dispatch('pointerdown', ev);
    doc.fire('pointerup', { timeStamp: time.now() + 1 });
  };
  const spin = els['wheel-spin'];
  const disc = els['wheel-disc'];
  return {
    els, time, section, spin, disc,
    held: () => ({ spin: spin.disabled, disc: disc.disabled }),
    rotation: () => els['wheel-group'].style.transform,
    namesIn(names) { els['name-input'].value = names; contact(); els['name-start'].click(); },
    modeAuto() { contact(); auto.checked = true; press.checked = false; auto.dispatch('change'); },
    modePress() { contact(); auto.checked = false; press.checked = true; press.dispatch('change'); },
    tap(el) { contact(); el.click(); },
  };
}

const BOTH_HELD = { spin: true, disc: true };
const BOTH_FREE = { spin: false, disc: false };

test('a mode change inside the window keeps spin and disc held, and a spin after it holds them until it lands', async () => {
  const p = await page();
  p.modePress();
  p.namesIn('A\nB\nC');
  assert.deepEqual(p.held(), BOTH_HELD, 'the names-in gate did not hold spin and disc');
  p.time.tick(120);
  p.modeAuto();
  assert.deepEqual(p.held(), BOTH_HELD, 'a mode change inside the window released spin or disc');
  p.time.tick(50);
  p.tap(p.spin);
  assert.equal(p.rotation(), '', 'a tap inside the window started a spin');
  p.time.tick(1000);
  assert.deepEqual(p.held(), BOTH_FREE, 'spin and disc not handed back once the window closed');
  p.tap(p.spin);
  assert.notEqual(p.rotation(), '', 'a deliberate tap after the window did not spin');
  p.time.tick(1000);
  assert.deepEqual(p.held(), BOTH_HELD, 'spin or disc came back enabled while the wheel was still turning');
  p.time.tick(10000);
  assert.ok(p.els['wheel-result'].children.length > 0, 'the spin never landed');
  assert.deepEqual(p.held(), BOTH_FREE, 'spin and disc not handed back once the spin landed');
});

test('a spin started after the window stays held when a late in-window contact re-arms the gate', async () => {
  const p = await page();
  p.namesIn('A\nB\nC');
  p.time.tick(450);
  assert.deepEqual(p.held(), BOTH_FREE, 'spin and disc not handed back once the window closed');
  // A keyboard activation: no pointer contact, so the gate is still listening.
  p.spin.click();
  assert.notEqual(p.rotation(), '', 'activating spin after the window did not spin');
  // A contact the browser stamped inside the window but delivered only now (ADR-0059).
  p.section.dispatch('pointerdown', { timeStamp: 200 });
  p.time.tick(1000);
  assert.deepEqual(p.held(), BOTH_HELD, 'the re-armed gate handed spin or disc back while the wheel was still turning');
  p.time.tick(10000);
  assert.deepEqual(p.held(), BOTH_FREE, 'spin and disc not handed back once the spin landed');
});

test('a one-name list arriving inside the window leaves spin held after the window closes', async () => {
  const p = await page();
  p.namesIn('A\nB\nC');
  p.time.tick(120);
  p.namesIn('A');
  p.time.tick(1000);
  assert.deepEqual(p.held(), BOTH_HELD, 'the gate handed spin or disc back to a one-name wheel');
  p.tap(p.spin);
  assert.equal(p.els['wheel-result'].children.length, 0, 'a one-name wheel produced a result');
});

// The gate snapshots stop as the wheel's own disabled (no spin running at names-in). A behaviour-B
// spin then enables it, and a late in-window contact re-holds it. Before gh#297 the gate never handed
// that control back and its hold marker outlived the window; it now does. Either way the wheel must
// release stop once the gate has re-armed, or the hold can never be stopped and never reveals.
test('a behaviour-B spin keeps a working stop after a late in-window contact re-arms the gate', async () => {
  const p = await page();
  p.modePress();
  p.namesIn('A\nB\nC');
  p.time.tick(450);
  p.spin.click();
  const stop = p.els['wheel-stop'];
  assert.equal(stop.disabled, false, 'a behaviour-B spin did not offer stop');
  p.section.dispatch('pointerdown', { timeStamp: 200 });
  assert.equal(stop.disabled, true, 'the late in-window contact did not re-hold stop');
  p.time.tick(1000);
  assert.equal(stop.disabled, false, 'stop still held after the re-armed window closed');
  stop.click();
  p.time.tick(10000);
  assert.equal(p.els['wheel-result'].children.length, 1, 'stop did not end the hold with a result');
});
