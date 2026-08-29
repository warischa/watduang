// Shared fake DOM for game tests — no jsdom, no happy-dom, no dependency (same rule as every
// *.test.mjs in this folder). Before this file, all six game tests inlined their own near-identical
// FakeElement copy, and every copy carried the same three blind spots that let real defects survive:
//
//   (a) innerHTML was stored as a string, so nothing rendered through it existed as a child. An
//       `<a href>` inside an innerHTML constant is invisible to an ADR-0014 sweep written that way.
//   (b) window.matchMedia returned a frozen `{ matches }` object with no addEventListener, so a game
//       that reacts to a reduced-motion CHANGE could never be exercised, and a leaked media listener
//       could never be detected.
//   (c) clientWidth was absent, i.e. 0 — any layout-measuring branch silently took its degenerate path.
//
// The .mjs extension and the _ prefix keep this out of both the client lazy-loader glob and the
// `src/**/*.test.mjs` test glob.
//
// ponytail: the HTML parser below is a tag scanner, not a spec parser. It handles elements,
// attributes, void/self-closing tags, comments and text — enough for the SVG/markup constants these
// games assign to innerHTML. It does NOT do entity decoding, implied tag closing (`<p>a<p>b`),
// `<template>`, or CDATA. If a game ever needs one of those, reach for a real parser rather than
// growing this one.

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'source', 'track', 'wbr',
]);

const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
const ATTR = /([\w:.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function parseAttrs(raw) {
  const out = {};
  if (!raw) return out;
  ATTR.lastIndex = 0;
  let m;
  while ((m = ATTR.exec(raw)) !== null) {
    // Authored case is preserved: SVG attribute names are case-sensitive (viewBox, patternUnits),
    // and a test reading a markup constant asks for the name the constant wrote.
    out[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

/** Parses an HTML string into FakeElement children. Text lands as the own-text of the element that
 *  encloses it — this fake's textContent is own-text only, deliberately, so a parent never reports
 *  its descendants' copy as its own. */
function parseHTML(html, ownerDocument) {
  const root = { children: [] };
  const stack = [root];
  let cursor = 0;
  const str = String(html);
  TOKEN.lastIndex = 0;
  let m;
  const addText = (text) => {
    const top = stack[stack.length - 1];
    if (top !== root && text.trim()) top._text += text;
  };
  while ((m = TOKEN.exec(str)) !== null) {
    addText(str.slice(cursor, m.index));
    cursor = TOKEN.lastIndex;
    if (m[0].startsWith('<!--')) continue;
    // Authored tag case is preserved for the same reason as attributes (linearGradient, clipPath);
    // tag matching in querySelector is case-insensitive to compensate.
    const [, closing, tag, rawAttrs, selfClose] = m;
    if (closing) {
      // Close the nearest matching open tag; a stray close tag is ignored rather than unwinding.
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName.toLowerCase() === tag.toLowerCase()) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const node = new FakeElement(tag, ownerDocument);
    const attrs = parseAttrs(rawAttrs);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    stack[stack.length - 1].children.push(node);
    if (!selfClose && !VOID_TAGS.has(tag.toLowerCase())) stack.push(node);
  }
  addText(str.slice(cursor));
  return root.children;
}

function matches(node, selector) {
  const sel = selector.trim();
  if (sel.startsWith('#')) return node.id === sel.slice(1);
  if (sel.startsWith('.')) return node.className.split(/\s+/).includes(sel.slice(1));
  if (sel.startsWith('[') && sel.endsWith(']')) return node.getAttribute(sel.slice(1, -1)) !== null;
  return node.tagName.toLowerCase() === sel.toLowerCase();
}

function walk(node, selector, out) {
  for (const child of node.children) {
    if (matches(child, selector)) out.push(child);
    walk(child, selector, out);
  }
  return out;
}

export class FakeElement {
  constructor(tagName, ownerDocument = null) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this._text = '';
    this._innerHTML = '';
    this.style = {};
    this._attrs = {};
    this._listeners = {};
    this.disabled = false;
    this.hidden = false;
    // Hole (c): a real mounted element has a width. Zero here made every layout-measuring branch
    // take its degenerate path with no test able to see it. Writable per element.
    this.clientWidth = 360;
    this.clientHeight = 640;
  }

  set textContent(v) { this._text = String(v); this.children = []; this._innerHTML = ''; }
  get textContent() { return this._text; }

  get className() { return this._attrs['class'] ?? ''; }
  set className(v) { this._attrs['class'] = String(v); }

  // Hole (a): assigning innerHTML replaces the children, exactly as the platform does, so anything
  // rendered through a markup constant is reachable by children/querySelector.
  set innerHTML(v) {
    this._innerHTML = String(v);
    this.children = parseHTML(v, this.ownerDocument);
  }
  get innerHTML() { return this._innerHTML; }

  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k); }

  querySelector(sel) { return walk(this, sel, [])[0] ?? null; }
  querySelectorAll(sel) { return walk(this, sel, []); }

  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...nodes) { this.children = nodes; this._innerHTML = ''; }
  remove() { /* detached fakes have no parent link; nothing to unhook */ }

  addEventListener(type, fn) { (this._listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn);
  }
  listenerCount(type) { return (this._listeners[type] || []).length; }
  dispatch(type, ...args) { (this._listeners[type] || []).slice().forEach((fn) => fn(...args)); }
  // A disabled control dispatches no activation — the platform swallows the click before any
  // listener runs. The fake models that on purpose: without it every arm-gate assertion passes vacuously.
  click() { if (!this.disabled) this.dispatch('click'); }
}

/** A fake `document`. `dispatched` records every dispatchEvent() so tests can assert what the game
 *  asked the page for (watduang:change-players, watduang:round-started). Reset it per test. */
export function makeDocument() {
  const doc = {
    dispatched: [],
    createElement(tag) { return new FakeElement(String(tag).toLowerCase(), doc); },
    dispatchEvent(event) { doc.dispatched.push(event); return true; },
    dispatchedTypes() { return doc.dispatched.map((e) => e.type); },
  };
  return doc;
}

/** A fake `window` whose matchMedia returns a live MediaQueryList: it registers listeners and fires
 *  them on setMedia(). Hole (b) — the old `() => ({ matches })` could not model a change at all, so
 *  no test could drive a reduced-motion flip or catch a leaked media listener. */
export function makeWindow({ reducedMotion = false, media = {} } = {}) {
  const REDUCE = '(prefers-reduced-motion: reduce)';
  const state = { [REDUCE]: reducedMotion, ...media };
  const lists = new Map();

  function mqlFor(query) {
    let mql = lists.get(query);
    if (!mql) {
      const listeners = [];
      mql = {
        media: query,
        get matches() { return Boolean(state[query]); },
        addEventListener(type, fn) { if (type === 'change') listeners.push(fn); },
        removeEventListener(type, fn) {
          if (type !== 'change') return;
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        },
        _listeners: listeners,
      };
      lists.set(query, mql);
    }
    return mql;
  }

  return {
    matchMedia: (query) => mqlFor(query),
    /** Flips a media query and notifies every registered listener, like a real UA does. */
    setMedia(query, value) {
      state[query] = value;
      const mql = lists.get(query);
      if (mql) mql._listeners.slice().forEach((fn) => fn({ matches: value, media: query }));
    },
    setReducedMotion(value) { this.setMedia(REDUCE, value); },
    /** Registered change listeners for a query — a leaked listener after dispose() shows up here. */
    mediaListeners(query = REDUCE) { return lists.get(query)?._listeners.length ?? 0; },
  };
}
