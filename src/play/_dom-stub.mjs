// Test-only. A tolerant fake `document` for driving one real row-builder out of a play route's
// main.js/main.ts under `node --test`, with no browser and no build.
//
// Why tolerant rather than faithful: the builders these tests exercise are slices of mockup code that
// touch dozens of unrelated element ids on their way past the row loop (`$('val-stick-count')`,
// `getElementById('startGameBtn').onclick = ...`). A stub that returns null for an id it was not
// told about turns every one of those into a TypeError, and the test would be measuring the stub. So
// getElementById mints a node for ANY id and remembers it, which leaves the row loop as the only
// thing the test actually asserts on.
//
// ponytail: not a DOM. No layout, no event dispatch beyond calling the listeners a builder attached,
// no parsing -- `innerHTML` is stored as the raw string it was assigned, which is precisely what the
// badge assertions read. The setup-badge-icon tests each pull the badge out of that string (template
// builders) or off the node (createElement builders); neither needs a parser. A builder whose badge
// glyph is only decided by real layout, CSS `content`, or a canvas draw is OUT of this instrument's
// reach and must not be tested through it.

/** One fake element. Every property a mockup row-builder is known to touch, and nothing else. */
function makeNode(tag = 'div') {
  const node = {
    tagName: tag.toUpperCase(),
    className: '',
    id: '',
    textContent: '',
    value: '',
    type: '',
    maxLength: 0,
    disabled: false,
    title: '',
    checked: false,
    hidden: false,
    dataset: {},
    attributes: {},
    children: [],
    listeners: {},
    style: { setProperty() {}, removeProperty() {} },
    classList: {
      add() {}, remove() {}, toggle() {}, contains: () => false,
    },
    setAttribute(name, v) {
      node.attributes[name] = String(v);
    },
    getAttribute: (name) => (name in node.attributes ? node.attributes[name] : null),
    removeAttribute(name) {
      delete node.attributes[name];
    },
    appendChild(child) {
      node.children.push(child);
      return child;
    },
    append(...kids) {
      node.children.push(...kids);
    },
    replaceChildren(...kids) {
      node.children = [...kids];
      node._html = '';
    },
    remove() {},
    focus() {},
    blur() {},
    scrollIntoView() {},
    addEventListener(type, fn) {
      (node.listeners[type] ??= []).push(fn);
    },
    removeEventListener() {},
    // Neither of these is a selector engine. They answer only the one question the row builders ask
    // of their own freshly written markup -- "give me the field/button I just put in this row", as a
    // single `.class`, `#id` or tag selector -- by counting occurrences of that token in the assigned
    // innerHTML and minting one stand-in node per hit. Without it, a builder that attaches a listener
    // to its own row crashes on null and the test measures the stub instead of the badge.
    querySelector: (sel) => node.querySelectorAll(sel)[0] ?? null,
    querySelectorAll(sel) {
      const token = String(sel).trim();
      const needle = token.startsWith('.') ? `class="[^"]*\\b${token.slice(1)}\\b`
        : token.startsWith('#') ? `id="${token.slice(1)}"`
          : `<${token}[\\s>]`;
      const hits = node._html.match(new RegExp(needle, 'g')) ?? [];
      return hits.map(() => makeNode('div'));
    },
    closest: () => null,
    insertAdjacentHTML(_where, html) {
      node._html += html;
    },
  };
  // innerHTML is a real accessor so an assignment is RECORDED rather than dropped -- the template
  // builders write the whole row markup through it and that string is the badge evidence.
  node._html = '';
  Object.defineProperty(node, 'innerHTML', {
    get: () => node._html,
    set: (v) => {
      node._html = String(v);
      node.children = [];
    },
    enumerable: true,
  });
  return node;
}

/** A fake document plus the id registry, so a test can read back whichever container it cares about. */
export function makeDocumentStub() {
  const byId = new Map();
  const created = [];
  const document = {
    getElementById(id) {
      if (!byId.has(id)) {
        const node = makeNode('div');
        node.id = id;
        byId.set(id, node);
      }
      return byId.get(id);
    },
    createElement(tag) {
      const node = makeNode(tag);
      created.push(node);
      return node;
    },
    createTextNode: (text) => ({ textContent: String(text) }),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    documentElement: makeNode('html'),
  };
  document.body = makeNode('body');
  return { document, byId, created, el: (id) => document.getElementById(id) };
}

export { makeNode };

/** Slices `function <name>(...) { ... }` (or `const <name> = (...) => {`, or a bare class method
 *  `<name>(...) {`) out of a source string by matching braces from the first `{` of its body.
 *
 *  Raw text, not an AST: the same idiom the four existing setup-badge-icon tests already use. It is
 *  fooled by an unbalanced brace inside a string or a regex literal; none of the sliced builders
 *  carries one today, and a slice that goes wrong fails LOUDLY when the extracted text will not
 *  compile, never silently. `notFoundMessage` exists so the caller's assertion names the symbol --
 *  a builder that has been renamed must red as "this test is measuring nothing", not as a pass. */
export function sliceBlock(source, header) {
  // The header is matched only where a BODY opens immediately after it. `renderMascotsList()` occurs
  // as a call before it occurs as a declaration, and taking the first textual hit walked from the
  // call site to some later unrelated brace and sliced nonsense -- which surfaced as a syntax error
  // rather than a wrong pass, but only by luck. First hit followed by `{` is the declaration.
  let start = -1;
  let open = -1;
  for (let at = source.indexOf(header); at !== -1; at = source.indexOf(header, at + 1)) {
    const rest = source.slice(at + header.length);
    const lead = rest.length - rest.trimStart().length;
    if (rest.trimStart().startsWith('{')) {
      start = at;
      open = at + header.length + lead;
      break;
    }
  }
  if (start === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}
