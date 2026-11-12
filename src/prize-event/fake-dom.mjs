// Test-only fake DOM for the prize-draw screens (setup page, projector route, 2D reveal). No dependency.
// Deliberately strict where the name sink is concerned:
//   - textContent reads back the text of the whole subtree, so a test reads what a screen actually shows;
//   - any write to innerHTML / outerHTML / insertAdjacentHTML is recorded in doc.htmlWrites, and the
//     hostile-name tests require that list to stay empty: a name that went through a markup sink is a
//     failure even if the fake could not parse what it would have built;
//   - no layout: clientWidth / offsetWidth are 0, so the fit rule (names-dom.ts fitName) is a no-op here
//     and is measured in a browser instead (docs/verification/evidence/gh304-tracer-2026-11-11/);
//   - every way this fake lets a string reach the DOM (textContent, a text node, a string child, an
//     attribute, a style property, a form value) is reported to doc.onWrite when a test sets it, so a test
//     can ask WHICH module wrote a given string. innerText and outerText are not modelled, so writing them
//     throws instead of becoming a silent plain property the hook cannot see.

const report = (doc, text) => doc?.onWrite?.(String(text));

class FakeNode {
  constructor(doc) {
    this.ownerDocument = doc;
    this.parentNode = null;
  }
}

class FakeText extends FakeNode {
  constructor(doc, text) {
    super(doc);
    this.nodeType = 3;
    report(doc, text);
    this.data = String(text);
  }
  get textContent() {
    return this.data;
  }
}

class FakeClassList {
  constructor(el) {
    this.el = el;
  }
  get list() {
    return (this.el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  }
  add(...names) {
    this.el.setAttribute('class', [...new Set([...this.list, ...names])].join(' '));
  }
  remove(...names) {
    this.el.setAttribute('class', this.list.filter((n) => !names.includes(n)).join(' '));
  }
  contains(name) {
    return this.list.includes(name);
  }
  toggle(name, force) {
    const on = force ?? !this.contains(name);
    if (on) this.add(name);
    else this.remove(name);
    return on;
  }
}

export class FakeElement extends FakeNode {
  constructor(doc, tag) {
    super(doc);
    this.nodeType = 1;
    this.tagName = String(tag).toUpperCase();
    this.childNodes = [];
    this.attrs = new Map();
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.rawValue = '';
    this.type = '';
    this.classList = new FakeClassList(this);
    const props = {};
    this.style = {
      setProperty: (k, v) => {
        report(doc, v);
        props[k] = String(v);
      },
      getPropertyValue: (k) => props[k] ?? '',
      props,
    };
  }
  get children() {
    return this.childNodes.filter((n) => n.nodeType === 1);
  }
  get firstElementChild() {
    return this.children[0] ?? null;
  }
  get id() {
    return this.getAttribute('id') ?? '';
  }
  set id(v) {
    this.setAttribute('id', v);
  }
  get className() {
    return this.getAttribute('class') ?? '';
  }
  set className(v) {
    this.setAttribute('class', v);
  }
  get value() {
    return this.rawValue;
  }
  set value(v) {
    report(this.ownerDocument, v);
    this.rawValue = String(v);
  }
  set innerText(_v) {
    throw new Error('fake-dom: innerText is not modelled; write text with textContent');
  }
  set outerText(_v) {
    throw new Error('fake-dom: outerText is not modelled; write text with textContent');
  }
  setAttribute(k, v) {
    report(this.ownerDocument, v);
    this.attrs.set(k, String(v));
  }
  getAttribute(k) {
    return this.attrs.has(k) ? this.attrs.get(k) : null;
  }
  removeAttribute(k) {
    this.attrs.delete(k);
  }
  hasAttribute(k) {
    return this.attrs.has(k);
  }
  get textContent() {
    return this.childNodes.map((n) => n.textContent).join('');
  }
  set textContent(v) {
    this.childNodes = [];
    if (String(v) !== '') this.append(new FakeText(this.ownerDocument, v));
  }
  set innerHTML(v) {
    report(this.ownerDocument, v);
    this.ownerDocument.htmlWrites.push({ el: this, html: String(v) });
  }
  set outerHTML(v) {
    report(this.ownerDocument, v);
    this.ownerDocument.htmlWrites.push({ el: this, html: String(v) });
  }
  insertAdjacentHTML(_where, html) {
    report(this.ownerDocument, html);
    this.ownerDocument.htmlWrites.push({ el: this, html: String(html) });
  }
  append(...nodes) {
    for (const n of nodes) {
      const node = typeof n === 'string' ? new FakeText(this.ownerDocument, n) : n;
      node.parentNode?.childNodes && (node.parentNode.childNodes = node.parentNode.childNodes.filter((c) => c !== node));
      node.parentNode = this;
      this.childNodes.push(node);
    }
  }
  appendChild(n) {
    this.append(n);
    return n;
  }
  replaceChildren(...nodes) {
    this.childNodes = [];
    this.append(...nodes);
  }
  contains(node) {
    for (let n = node; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }
  dispatch(type, ev = {}) {
    for (const fn of [...(this.listeners[type] ?? [])]) fn({ type, target: this, timeStamp: 0, preventDefault() {}, ...ev });
  }
  click() {
    if (!this.disabled) this.dispatch('click');
  }
  focus() {}
  /** Every element below this one, depth first. */
  all() {
    const out = [];
    const walk = (el) => {
      for (const c of el.children) {
        out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelectorAll(sel) {
    return this.all().filter((el) => matches(el, sel));
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] ?? null;
  }
}

function matches(el, sel) {
  return sel.split(',').some((one) => {
    const s = one.trim();
    if (s.startsWith('#')) return el.id === s.slice(1);
    if (s.startsWith('[') && s.endsWith(']')) return el.hasAttribute(s.slice(1, -1));
    const [tag, ...classes] = s.split('.');
    if (tag && el.tagName !== tag.toUpperCase()) return false;
    return classes.every((c) => el.classList.contains(c));
  });
}

export function makeDoc() {
  const doc = {
    htmlWrites: [],
    /** Set by a test to see every string written into this document (see the header). */
    onWrite: null,
    defaultView: null,
    createElement: (tag) => new FakeElement(doc, tag),
    createElementNS: (_ns, tag) => new FakeElement(doc, tag),
    createTextNode: (text) => new FakeText(doc, text),
    addEventListener() {},
    removeEventListener() {},
  };
  doc.body = new FakeElement(doc, 'body');
  doc.getElementById = (id) => doc.body.all().find((el) => el.id === id) ?? null;
  doc.querySelector = (sel) => doc.body.querySelector(sel);
  doc.querySelectorAll = (sel) => doc.body.querySelectorAll(sel);
  return doc;
}

/** Elements a name must never become, whatever it contains. */
export const ACTIVE_TAGS = ['A', 'IMG', 'SCRIPT', 'IFRAME', 'SVG:A', 'OBJECT', 'EMBED', 'FORM', 'LINK', 'STYLE'];

/** The hostile names every screen's test feeds: markup within the 12-cluster cap (a longer one never gets
 *  past the cap, so it would test the cap, not the sink), a 13-cluster name, and a bidi override. */
export const HOSTILE = {
  markup: '<img src=x>',
  anchor: '<a href=x>',
  thirteen: 'WWWWWWWWWWWWW',
  bidi: '\u202Eabc\u202C',
};
