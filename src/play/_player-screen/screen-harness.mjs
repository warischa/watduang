// Test-only harness: runs the REAL shared player screen (player-screen.ts) against the REAL markup
// (PlayerScreen.astro's template and dialogs, plus a converted route's own markup.html) in a small
// tree-shaped fake DOM, with the REAL arm gate (src/games/_arm-gate.ts). Not a *.test.mjs file, so
// the runner does not collect it on its own; each converted route's arm-reveal-paths.test.mjs calls
// revealPathCases() with its own root and header control.
//
// Why a tree and not src/play/_dom-stub.mjs: that stub mints a node for any id and has no parents,
// which is right for slicing one row builder and wrong here -- the arm gate walks real descendants,
// the screen finds its surface with closest(), and a dialog must be found by id in the page. A gate
// that "disables every button" over a stub with no buttons would pass while gating nothing.
//
// ponytail: not a browser. No layout, no CSS, no event bubbling beyond what is written below, and
// the HTML reader handles exactly the markup this repo writes (comments, quoted attributes, void
// tags, entities left as text). A markup shape it cannot read throws -- it never guesses.
import fs from 'node:fs';
import path from 'node:path';

const VOID = new Set(['input', 'br', 'img', 'meta', 'link', 'hr', 'source', 'wbr']);

class Text {
  constructor(text) {
    this.nodeType = 3;
    this.textContent = text;
    this.parent = null;
  }
  cloneNode() {
    return new Text(this.textContent);
  }
}

class El {
  constructor(tag, doc) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.doc = doc;
    this.attrs = new Map();
    this.childNodes = [];
    this.parent = null;
    this.listeners = {};
    this.value = '';
    this.maxLength = -1;
    this.placeholder = '';
    this.type = '';
    this.open = false;
    this._disabled = false;
    if (this.tagName === 'TEMPLATE') this.content = new El('#fragment', doc);
    const self = this;
    this.classList = {
      add: (...c) => { const s = self.classes(); c.forEach((x) => s.add(x)); self.setClasses(s); },
      remove: (...c) => { const s = self.classes(); c.forEach((x) => s.delete(x)); self.setClasses(s); },
      contains: (c) => self.classes().has(c),
      toggle: (c, on) => { const s = self.classes(); const want = on ?? !s.has(c); if (want) s.add(c); else s.delete(c); self.setClasses(s); },
    };
  }
  classes() { return new Set((this.attrs.get('class') ?? '').split(/\s+/).filter(Boolean)); }
  setClasses(s) { this.attrs.set('class', [...s].join(' ')); }
  get className() { return this.attrs.get('class') ?? ''; }
  set className(v) { this.attrs.set('class', String(v)); }
  get id() { return this.attrs.get('id') ?? ''; }
  get hidden() { return this.attrs.has('hidden'); }
  set hidden(v) { if (v) this.attrs.set('hidden', ''); else this.attrs.delete('hidden'); }
  get disabled() { return this._disabled; }
  set disabled(v) { this._disabled = !!v; }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(v) { this.replaceChildren(String(v)); }
  setAttribute(n, v) { this.attrs.set(n, String(v)); if (n === 'disabled') this._disabled = true; }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  hasAttribute(n) { return this.attrs.has(n); }
  removeAttribute(n) { this.attrs.delete(n); }
  adopt(node) {
    if (typeof node === 'string') node = new Text(node);
    if (node.tagName === '#FRAGMENT') return [...node.childNodes].map((k) => this.adopt(k)).flat();
    if (node.parent) node.parent.childNodes = node.parent.childNodes.filter((k) => k !== node);
    node.parent = this;
    return [node];
  }
  append(...nodes) { for (const n of nodes) this.childNodes.push(...this.adopt(n)); }
  appendChild(n) { this.append(n); return n; }
  replaceChildren(...nodes) {
    for (const k of this.childNodes) k.parent = null;
    this.childNodes = [];
    this.append(...nodes);
  }
  cloneNode(deep) {
    const c = new El(this.tagName === '#FRAGMENT' ? '#fragment' : this.tagName.toLowerCase(), this.doc);
    for (const [k, v] of this.attrs) c.attrs.set(k, v);
    c._disabled = this._disabled;
    if (deep) for (const k of this.childNodes) c.append(k.cloneNode(true));
    if (this.content && deep) for (const k of this.content.childNodes) c.content.append(k.cloneNode(true));
    return c;
  }
  descendants() {
    const out = [];
    const walk = (n) => { for (const k of n.children) { out.push(k); walk(k); } };
    walk(this);
    return out;
  }
  matches(sel) {
    return sel.split(',').map((s) => s.trim()).some((one) => {
      let m;
      if ((m = /^\[([\w-]+)="([^"]*)"\]$/.exec(one))) return this.getAttribute(m[1]) === m[2];
      if (one.startsWith('#')) return this.id === one.slice(1);
      if (one.startsWith('.')) return this.classes().has(one.slice(1));
      if (/^[a-z]+$/.test(one)) return this.tagName === one.toUpperCase();
      throw new Error(`screen-harness: selector not supported: ${one}`);
    });
  }
  querySelectorAll(sel) { return this.descendants().filter((n) => n.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  closest(sel) {
    for (let n = this; n && n.nodeType === 1; n = n.parent) if (n.matches(sel)) return n;
    return null;
  }
  contains(other) {
    for (let n = other; n; n = n.parent) if (n === this) return true;
    return false;
  }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn); }
  dispatchEvent(ev) {
    for (const fn of [...(this.listeners[ev.type] ?? [])]) fn(ev);
    return !ev.defaultPrevented;
  }
  // The HTML sinks are not implemented, they THROW: this harness never parses a string into
  // elements, so a screen that wrote markup through one would otherwise "pass" with an element that
  // silently stayed empty. Fail closed, and the name-escaping test reads that as a sink found.
  set innerHTML(_v) { throw new Error('screen-harness: innerHTML is an HTML sink -- the player screen must not use one'); }
  get innerHTML() { throw new Error('screen-harness: innerHTML read'); }
  set outerHTML(_v) { throw new Error('screen-harness: outerHTML is an HTML sink'); }
  insertAdjacentHTML() { throw new Error('screen-harness: insertAdjacentHTML is an HTML sink'); }
  focus() { this.doc.activeElement = this; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  /** A real browser dispatches no click on a disabled button; this does the same. */
  click() {
    if (this.disabled) return false;
    this.dispatchEvent({ type: 'click', target: this, timeStamp: 0 });
    return true;
  }
}

/** Reads the markup this repo writes into `parent`. Throws on anything it does not understand. */
function parseInto(parent, html, doc) {
  const stack = [parent];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  let at = 0;
  while ((m = re.exec(html))) {
    if (m.index !== at) throw new Error(`screen-harness: unreadable markup near ${JSON.stringify(html.slice(at, at + 40))}`);
    at = re.lastIndex;
    const top = stack[stack.length - 1];
    const target = top.tagName === 'TEMPLATE' ? top.content : top;
    if (m[0].startsWith('<!--')) continue;
    if (m[5] !== undefined) {
      if (m[5].trim()) target.append(m[5].replace(/\s+/g, ' '));
      continue;
    }
    if (m[1]) {
      const name = m[1].toUpperCase();
      while (stack.length > 1 && stack[stack.length - 1].tagName !== name) stack.pop();
      if (stack.length > 1) stack.pop();
      continue;
    }
    const el = new El(m[2], doc);
    for (const a of m[3].matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
      el.attrs.set(a[1], a[2] ?? a[3] ?? a[4] ?? '');
      if (a[1] === 'disabled') el._disabled = true;
    }
    target.append(el);
    if (!VOID.has(m[2].toLowerCase()) && !m[4]) stack.push(el);
  }
  if (at !== html.length) throw new Error('screen-harness: trailing markup it could not read');
}

/** The Astro file's markup: everything after the frontmatter fence and before the style block. */
function componentMarkup() {
  const text = fs.readFileSync(path.join(import.meta.dirname, 'PlayerScreen.astro'), 'utf8');
  const body = text.split('\n---\n')[1];
  if (!body) throw new Error('screen-harness: PlayerScreen.astro has no frontmatter fence');
  return body.slice(0, body.indexOf('<style'));
}

/** A fresh page: the route's markup, then the shared screen's, as play.astro renders them. */
export function makePage(routeMarkup) {
  const listeners = {};
  const doc = {
    activeElement: null,
    createElement: (tag) => new El(tag, doc),
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn); },
    dispatchEvent: (ev) => { for (const fn of [...(listeners[ev.type] ?? [])]) fn(ev); return true; },
    getElementById: (id) => [doc.body, ...doc.body.descendants()].find((n) => n.id === id) ?? null,
    querySelectorAll: (sel) => doc.body.querySelectorAll(sel),
    querySelector: (sel) => doc.body.querySelector(sel),
  };
  doc.documentElement = new El('html', doc);
  doc.body = new El('body', doc);
  doc.documentElement.append(doc.body);
  parseInto(doc.body, routeMarkup, doc);
  parseInto(doc.body, componentMarkup(), doc);
  return doc;
}

export function installStorage() {
  const slots = new Map();
  globalThis.localStorage = {
    getItem: (k) => (slots.has(k) ? slots.get(k) : null),
    setItem: (k, v) => slots.set(k, String(v)),
    removeItem: (k) => slots.delete(k),
  };
  return slots;
}

/** open() waits on the one-time migration promise; a few turns of the microtask queue settle it.
 *  setImmediate, not setTimeout, so it still runs while a test has mocked the timers. */
export const settle = () => new Promise((resolve) => setImmediate(resolve));

/** Mounts the real screen on a fresh page. `roster` seeds storage through roster.ts first. */
export async function mountOnPage({ routeMarkup, rootId, roster = [], group = [], range = [2, 10], round }) {
  installStorage();
  const doc = makePage(routeMarkup);
  globalThis.document = doc;
  // The page's window, for the one thing the screen asks of it: pagehide.
  const winListeners = {};
  globalThis.window = {
    addEventListener: (type, fn) => { (winListeners[type] ??= []).push(fn); },
    removeEventListener() {},
  };
  const fireWindow = (type) => { for (const fn of winListeners[type] ?? []) fn({ type }); };
  const ps = await import('./player-screen.ts');
  const store = await import('../../shell/roster.ts');
  // Seeded through add(), the roster's oldest write path, so the same harness can also be pointed at
  // an older tree to show a new case red there.
  const seeded = store.loadRoster();
  for (const name of roster) await seeded.add(name);
  if (group.length) store.saveGroup(group);
  const root = doc.getElementById(rootId);
  if (!root) throw new Error(`screen-harness: the route markup has no #${rootId}`);
  const calls = { started: [], aborted: 0, opened: 0 };
  const live = { round: round ?? false };
  const screen = ps.mountPlayerScreen({
    root,
    range,
    onStart: (players) => calls.started.push(players),
    roundActive: () => live.round,
    abortRound: () => { calls.aborted += 1; },
    onOpen: () => { calls.opened += 1; },
  });
  const part = (name) => root.querySelector(`[data-ps="${name}"]`);
  const byId = (id) => doc.getElementById(id);
  return { ps, store, doc, root, screen, calls, live, part, byId, fireWindow };
}

/** The shared screen's reveal paths, registered as tests against ONE route's real markup. Each case
 *  reads the route's own header control (`headerId`), which sits outside the screen's root but inside
 *  the surface the screen covers: if a route mounted the screen outside its game root, or the screen
 *  armed only its own root, the header assertions red.
 *
 *  "Armed" is read off the real gate's own effect: armAllButtons disables every button it collects
 *  the moment it is called and gives them back after ARM_DELAY_MS of quiet. Every case first lets a
 *  window expire and asserts the control is LIVE, so a control that was simply never enabled cannot
 *  pass as armed. */
export function revealPathCases({ test, assert, routeMarkup, rootId, headerId, label }) {
  const QUIET = 400;
  const expire = (t) => t.mock.timers.tick(QUIET + 1);
  const liveNow = (el, what) => assert.equal(el.disabled, false, `${what} should be live once the window has passed`);
  const armedNow = (el, what) => assert.equal(el.disabled, true, `${what} was not armed by this path`);

  test(`${label}: opening the screen arms the surface it uncovers -- start and the route header`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const page = await mountOnPage({ routeMarkup, rootId });
    page.screen.open();
    await settle();
    assert.equal(page.root.hidden, false);
    armedNow(page.part('start'), 'start');
    armedNow(page.byId(headerId), `the route header control #${headerId}`);
    assert.equal(page.part('inc').disabled, false, 'the steppers are tapped repeatedly and are never collected');
    expire(t);
    liveNow(page.part('start'), 'start');
    liveNow(page.byId(headerId), `#${headerId}`);
    assert.equal(page.part('start').click(), true);
    await settle(); // the roster write is applied under the lock before the players are handed over
    assert.equal(page.calls.started.length, 1, 'start hands the players over');
    assert.equal(page.root.hidden, true, 'and the screen closes itself');
  });

  test(`${label}: a stepper tap inside the window does not hand start back early`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const page = await mountOnPage({ routeMarkup, rootId });
    page.screen.open();
    await settle();
    assert.equal(page.part('inc').click(), true, 'the stepper is never gated');
    assert.equal(page.part('count-num').textContent, '5');
    armedNow(page.part('start'), 'start after a stepper re-render inside the window');
    expire(t);
    liveNow(page.part('start'), 'start');
  });

  // gh#264 REFUTE finding 6: every saved-row rebuild puts NEW controls under the finger. Two contacts
  // 100ms apart, the second landing on the rebuilt control, must not act twice -- on a tick (which
  // would toggle straight back), on the add row (a second row), and on the rows an x moved up.
  test(`${label}: a second contact 100ms after a rebuild lands on nothing live -- tick, add, x`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const page = await mountOnPage({ routeMarkup, rootId, roster: ['A', 'B', 'C'] });
    page.screen.open();
    await settle();
    expire(t);
    const tick = (i) => page.root.querySelectorAll('.ps-tick')[i];
    const contact = (stamp, el) => {
      page.doc.dispatchEvent({ type: 'pointerdown', timeStamp: stamp });
      page.doc.dispatchEvent({ type: 'pointerup', timeStamp: stamp + 10 });
      return el.click();
    };
    assert.equal(contact(1000, tick(2)), true, 'the first tap is a deliberate one');
    assert.equal(tick(2).getAttribute('aria-pressed'), 'false');
    t.mock.timers.tick(100);
    assert.equal(contact(1100, tick(2)), false, 'the rebuilt tick is inert 100ms later');
    assert.equal(tick(2).getAttribute('aria-pressed'), 'false', 'and the row did not toggle back');
    armedNow(page.byId(headerId), `#${headerId} after a tick rebuild`);
    expire(t);
    assert.equal(contact(2000, page.part('add')), true);
    t.mock.timers.tick(100);
    assert.equal(contact(2100, page.part('add')), false, 'the add row is inert 100ms after it added a row');
    assert.equal(page.root.querySelectorAll('.ps-p').length, 4, 'one row added, not two');
    expire(t);
    assert.equal(contact(3000, page.root.querySelectorAll('.ps-rm')[0]), true);
    t.mock.timers.tick(100);
    assert.equal(contact(3100, page.root.querySelectorAll('.ps-rm')[0]), false, 'the x that moved up is inert');
    assert.equal(page.root.querySelectorAll('.ps-p').length, 3, 'one row removed, not two');
  });

  test(`${label}: a ghost contact inside the window starts nothing`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const page = await mountOnPage({ routeMarkup, rootId });
    page.screen.open();
    await settle();
    assert.equal(page.part('start').click(), false, 'a gated start dispatches nothing');
    assert.equal(page.calls.started.length, 0);
  });

  test(`${label}: mid-round edit -- the confirm arms itself, and CANCEL arms the round it uncovers`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const page = await mountOnPage({ routeMarkup, rootId, roster: ['ต้น', 'มายด์', 'บอส'], round: true });
    const dialog = page.byId('ps-edit-dialog');
    page.doc.dispatchEvent({ type: page.ps.EDIT_EVENT });
    assert.equal(dialog.open, true, 'a live round is asked about first');
    assert.equal(page.root.hidden, true, 'nothing opened behind the question');
    armedNow(page.byId('ps-edit-confirm'), 'the confirm button');
    armedNow(page.byId('ps-edit-cancel'), 'the cancel button');
    expire(t);
    liveNow(page.byId(headerId), `#${headerId}`);
    page.byId('ps-edit-cancel').click();
    assert.equal(dialog.open, false);
    armedNow(page.byId(headerId), `#${headerId} after cancel`);
    assert.equal(page.calls.aborted, 0, 'cancel keeps the round');
  });

  test(`${label}: mid-round edit -- ESCAPE is a cancel path and arms the same way`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const page = await mountOnPage({ routeMarkup, rootId, roster: ['ต้น', 'มายด์'], round: true });
    const dialog = page.byId('ps-edit-dialog');
    page.doc.dispatchEvent({ type: page.ps.EDIT_EVENT });
    expire(t);
    liveNow(page.byId(headerId), `#${headerId}`);
    let prevented = false;
    dialog.dispatchEvent({ type: 'cancel', preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true, 'the native close is taken over so the arm runs');
    assert.equal(dialog.open, false);
    armedNow(page.byId(headerId), `#${headerId} after escape`);
  });

  test(`${label}: a dialog closed by the browser with no cancel event still arms what it uncovers`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const page = await mountOnPage({ routeMarkup, rootId, roster: ['ต้น', 'มายด์'], round: true });
    const dialog = page.byId('ps-edit-dialog');
    page.doc.dispatchEvent({ type: page.ps.EDIT_EVENT });
    expire(t);
    liveNow(page.byId(headerId), `#${headerId}`);
    dialog.open = false; // the close watcher closed it natively; only `close` fires
    dialog.dispatchEvent({ type: 'close' });
    armedNow(page.byId(headerId), `#${headerId} after a native close`);
    page.screen.open();
    await settle();
    expire(t);
    page.part('reset').hidden = false; // the reset dialog, same path
    const reset = page.byId('ps-reset-dialog');
    reset.showModal();
    reset.open = false;
    reset.dispatchEvent({ type: 'close' });
    armedNow(page.byId(headerId), `#${headerId} after the reset dialog closed natively`);
  });

  test(`${label}: mid-round edit -- CONFIRM ends the round, opens the screen and arms it`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const page = await mountOnPage({ routeMarkup, rootId, roster: ['ต้น', 'มายด์'], round: true });
    page.doc.dispatchEvent({ type: page.ps.EDIT_EVENT });
    expire(t);
    page.byId('ps-edit-confirm').click();
    await settle();
    assert.equal(page.calls.aborted, 1, 'the round is ended');
    assert.equal(page.root.hidden, false, 'and the screen is up');
    assert.equal(page.calls.opened, 1, 'the route was told to put its surfaces away');
    armedNow(page.part('start'), 'start after confirm');
    armedNow(page.byId(headerId), `#${headerId} after confirm`);
    expire(t);
    liveNow(page.part('start'), 'start');
  });

  test(`${label}: an edit with no live round opens the screen without asking`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const page = await mountOnPage({ routeMarkup, rootId, roster: ['ต้น', 'มายด์'], round: false });
    page.doc.dispatchEvent({ type: page.ps.EDIT_EVENT });
    await settle();
    assert.equal(page.byId('ps-edit-dialog').open, false);
    assert.equal(page.root.hidden, false);
    armedNow(page.byId(headerId), `#${headerId} on open`);
  });

  test(`${label}: the undo bar -- remove arms, UNDO arms, and the bar timing out arms`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const page = await mountOnPage({ routeMarkup, rootId, roster: ['ต้น', 'มายด์', 'บอส'] });
    page.screen.open();
    await settle();
    expire(t);
    const rm = () => page.root.querySelectorAll('.ps-rm');
    rm()[2].click();
    assert.equal(page.part('toast').hidden, false, 'the bar is up');
    assert.equal(page.part('toast-text').textContent, 'เอา บอส ออกจากวงแล้ว');
    armedNow(page.part('undo'), 'the undo button');
    armedNow(page.byId(headerId), `#${headerId} after remove`);
    expire(t);
    page.part('undo').click();
    assert.equal(page.part('toast').hidden, true, 'undo closes the bar');
    assert.equal(page.root.querySelectorAll('.ps-p').length, 3, 'and the row is back');
    armedNow(page.part('start'), 'start after undo');
    armedNow(page.byId(headerId), `#${headerId} after undo`);
    expire(t);
    rm()[0].click();
    t.mock.timers.tick(page.ps.UNDO_MS - QUIET - 1);
    liveNow(page.byId(headerId), `#${headerId} while the bar is still up`);
    t.mock.timers.tick(QUIET + 1);
    assert.equal(page.part('toast').hidden, true, 'the bar leaves after its four seconds');
    armedNow(page.byId(headerId), `#${headerId} after the bar timed out`);
    armedNow(page.part('start'), 'start after the bar timed out');
  });

  test(`${label}: the reset confirm -- opening, cancelling and confirming each arm`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const page = await mountOnPage({ routeMarkup, rootId });
    page.screen.open();
    await settle();
    expire(t);
    const dialog = page.byId('ps-reset-dialog');
    page.part('reset').click();
    assert.equal(dialog.open, true);
    armedNow(page.byId('ps-reset-confirm'), 'the reset confirm button');
    expire(t);
    page.byId('ps-reset-cancel').click();
    assert.equal(dialog.open, false);
    armedNow(page.byId(headerId), `#${headerId} after cancel`);
    armedNow(page.part('start'), 'start after cancel');
    expire(t);
    const field = page.root.querySelector('.ps-n');
    field.value = 'ต้น';
    field.dispatchEvent({ type: 'input' });
    page.part('reset').click();
    expire(t);
    page.byId('ps-reset-confirm').click();
    assert.equal(dialog.open, false);
    armedNow(page.part('start'), 'start after confirm');
    assert.notEqual(page.root.querySelector('.ps-n').value, 'ต้น', 'the typed name is gone');
  });
}

/** gh#209 per converted route: the seat rows the shared screen builds INTO THIS ROUTE'S ROOT open
 *  with the seat's animal, across the route's whole declared range. */
export function badgeCases({ test, assert, routeMarkup, rootId, range, mascots, label }) {
  const glyphs = (page) => page.root.querySelectorAll('.ps-e').map((b) => b.textContent);

  test(`${label} gh#209: every first-visit row badge equals that seat mascot glyph`, async () => {
    const page = await mountOnPage({ routeMarkup, rootId, range });
    page.screen.open();
    await settle();
    const n = Number(page.part('count-num').textContent);
    assert.ok(n >= range[0] && n <= range[1]);
    assert.deepEqual(glyphs(page), mascots.slice(0, n).map((m) => m.emoji));
  });

  test(`${label} gh#209: the mapping holds at the top of this route's range, seat by seat`, async () => {
    const page = await mountOnPage({ routeMarkup, rootId, range });
    page.screen.open();
    await settle();
    for (let i = 0; i < 30; i += 1) page.part('inc').click();
    assert.equal(Number(page.part('count-num').textContent), range[1], 'the stepper stops at the declared maximum');
    assert.deepEqual(glyphs(page), mascots.slice(0, range[1]).map((m) => m.emoji));
  });

  test(`${label} gh#209: the row keeps its POSITIONAL numbered label, which this check must never flag`, async () => {
    const page = await mountOnPage({ routeMarkup, rootId, range });
    page.screen.open();
    await settle();
    page.root.querySelectorAll('.ps-n').forEach((field, i) => {
      assert.match(field.getAttribute('aria-label'), new RegExp(`${i + 1}$`));
    });
  });
}

/** gh#177 per converted route: the reset control on this route's first-visit screen puts the animal
 *  cast back, keeps the count, and loses every typed name -- through its confirm. */
export function resetCases({ test, assert, routeMarkup, rootId, range, mascots, label }) {
  const names = (page) => page.root.querySelectorAll('.ps-n').map((f) => f.value);
  const typeInto = (field, value) => {
    field.value = value;
    field.dispatchEvent({ type: 'input' });
  };
  // Past the arm window, so the click is the player's and not a ghost the gate swallows.
  const quiet = () => new Promise((resolve) => setTimeout(resolve, 450));

  test(`${label} gh#177: reset restores the animal cast, keeps the count, and loses every typed name`, async () => {
    const page = await mountOnPage({ routeMarkup, rootId, range });
    page.screen.open();
    await settle();
    page.part('inc').click();
    const count = page.part('count-num').textContent;
    page.root.querySelectorAll('.ps-n').forEach((f, i) => typeInto(f, `typed${i}`));
    // RED CALIBRATION: the fields start off-cast, so a reset that did nothing fails below.
    assert.ok(names(page).every((n) => n.startsWith('typed')));
    await quiet();
    page.part('reset').click();
    await quiet();
    page.byId('ps-reset-confirm').click();
    assert.equal(page.part('count-num').textContent, count, 'the count did not move');
    assert.deepEqual(names(page), mascots.slice(0, Number(count)).map((m) => m.name));
  });

  test(`${label} gh#177: cancelling the reset keeps every typed name`, async () => {
    const page = await mountOnPage({ routeMarkup, rootId, range });
    page.screen.open();
    await settle();
    typeInto(page.root.querySelector('.ps-n'), 'ต้น');
    await quiet();
    page.part('reset').click();
    await quiet();
    page.byId('ps-reset-cancel').click();
    assert.equal(names(page)[0], 'ต้น');
  });

  test(`${label} gh#177: a typed name survives a count change, and a reset is offered on a first visit only`, async () => {
    const page = await mountOnPage({ routeMarkup, rootId, range });
    page.screen.open();
    await settle();
    typeInto(page.root.querySelectorAll('.ps-n')[1], 'มายด์');
    page.part('dec').click();
    page.part('inc').click();
    assert.equal(names(page)[1], 'มายด์');
    assert.equal(page.part('reset').hidden, false);
    const saved = await mountOnPage({ routeMarkup, rootId, range, roster: ['ต้น', 'มายด์'] });
    saved.screen.open();
    await settle();
    assert.equal(saved.part('reset').hidden, true, 'a saved roster has no reset -- the board draws none there');
  });
}

/** A ROUTE's own modal closer, run over the open shared screen (ADR-0057's close path). `close(page)`
 *  runs that closer's real bytes; the route's onOpen state is the caller's to set up.
 *
 *  gh#264 REFUTE round 4: a route closer that armed the screen's root through its own gate handed
 *  start back when its window closed, whatever the screen held -- duplicate names included -- and
 *  inside that window every keystroke's re-render enabled start early, because only the screen's own
 *  gate holds start for the window. Both legs are read here: a duplicate typed inside the window
 *  stays off after it, and a fix typed inside the next window waits it out. */
export function closerCases({ test, assert, routeMarkup, rootId, range, label, close }) {
  const QUIET = 400;
  const expire = (t) => t.mock.timers.tick(QUIET + 1);
  const typeInto = (field, value) => {
    field.value = value;
    field.dispatchEvent({ type: 'input' });
  };

  test(`${label}: a route modal closed over the player screen leaves start to the screen's own validity`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const page = await mountOnPage({ routeMarkup, rootId, range });
    page.screen.open();
    await settle();
    expire(t);
    const start = page.part('start');
    assert.equal(start.disabled, false, 'start must be live before the close, or nothing is measured');

    close(page);
    assert.equal(start.disabled, true, 'the close did not arm the player screen it uncovered');
    const [first, second] = page.root.querySelectorAll('.ps-n');
    typeInto(first, 'same');
    typeInto(second, 'same');
    assert.equal(start.disabled, true, 'two rows showing one name must hold start off');
    expire(t);
    assert.equal(start.disabled, true, 'the close\'s window handed start back while two rows still show one name');

    close(page);
    typeInto(second, 'other');
    assert.equal(start.disabled, true, 'a fix typed inside the close\'s window enabled start before the window passed');
    expire(t);
    assert.equal(start.disabled, false, 'start never came back once the names were fixed and the window passed');
  });
}
