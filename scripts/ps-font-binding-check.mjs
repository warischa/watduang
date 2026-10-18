#!/usr/bin/env node
// Player-screen font binding gate (gh#267, ADR-0071). The shared player screen's type is the two site
// stacks, fixed: the display stack and the body stack. A play route may redeclare --font-display or
// --font-sans on :root for its own board (short-stick does the first, as a serif stack; zero-trigger the
// second), and any rule that reads either property by name would carry that face into a screen every
// party game shares. So every font binding in the player screen's own styles spells one of the stacks
// out LITERALLY, never through a custom property a route can redeclare.
//
// A POSITIVE contract, not a "no var" scan: a scan for var(--font-display) passes the moment a binding
// is renamed to an alias (--ps-font: var(--font-display)) or folded into a `font:` shorthand, and
// passes empty if the bindings move to another file. So this gate asks three things:
//   1. Both site stacks are read from the --font-display and --font-sans declarations in
//      src/styles/tokens.css, each of which must appear exactly once. The literals are compared against
//      the tokens file, never against a copy here.
//   2. Every rule in PlayerScreen.astro's style blocks is parsed. Every font-family declaration must
//      equal one of those stacks (whitespace-normalised) and every font shorthand must contain one. Any
//      var( inside either is red.
//   3. The graded set must be non-empty and must include a .ps-go rule, a .ps-sec rule and a
//      .ps-dialog-scoped rule, so a refactor that moves the bindings out cannot pass by grading nothing.
//
// Declared rules are only half of it: text under a rule with no font-family of its own INHERITS, from
// the route's body on the in-flow screen and from the route's container on the dialogs, and a form
// control inherits nothing at all (the UA stylesheet gives it its own face). Graded rules alone passed
// while the hint, tagline, limit, dialog body and the count steppers painted route and UA faces. So the
// gate also holds the inheritance roots:
//   4. The .ps root rule and the .ps-dialog rule each bind font-family to the body stack.
//   5. One control-inherit rule makes button, input, select and textarea inherit under both roots. It
//      comes before every other font binding and its specificity stays at one class, so a control's own
//      binding (.ps-go, .ps-n, ...) still wins on source order. `inherit` is the only keyword allowed,
//      and only in that rule.
//   6. Every button, input, select and textarea in the component's markup sits inside an element that
//      carries the ps or ps-dialog class, or inside the ps template -- which counts as a .ps root only
//      while the mount code adds `ps` to the root it clones the template into.
// And it holds what outranks or replaces a stylesheet binding:
//   7. No style attribute in the component's markup names a font; an Astro style expression fails closed.
//   8. No write in the mount code can set a font: style.font*, setProperty, cssText, setAttribute('style'),
//      or a markup string naming a font. A computed property or attribute name fails closed.
//   9. No @font-face under src/play or src/styles names a site-stack family, except in the site's own
//      fonts file, which must still declare one; no @import or stylesheet link in that set either.
//
// THE SET'S HONEST BOUND. This gate grades declarations, known write patterns and at-rules in files the
// project owns. It does NOT compute the effective cascade, which the browser owns: an `all:` reset, a
// `font:` shorthand whose family list starts with another face, a style object reached through an alias
// in mount code, or a route rule that targets the screen's mount root by id or with !important can each
// change the painted face while every check here stays green (cross-lineage review, gh#267, 2026-10-18 --
// patching a CSS/JS reader to chase those never converges). The closer is a browser check of the PAINTED
// face of every text element on the shared screen, with hostile overrides injected; it exists as a hand
// tool in docs/verification/evidence/gh267-274-275-2026-10-18 (measure-a2.mjs) and is not yet a CI lane.
// Until it is, a green here means the declared bindings are right, not that the face is.
//
//   node scripts/ps-font-binding-check.mjs             -> grade the real files, exit 1 on a violation
//   node scripts/ps-font-binding-check.mjs --selftest  -> in-file fixtures, each red then green

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const TOKENS = path.join(repoRoot, 'src', 'styles', 'tokens.css');
const SCREEN = path.join(repoRoot, 'src', 'play', '_player-screen', 'PlayerScreen.astro');
const MOUNT = path.join(repoRoot, 'src', 'play', '_player-screen', 'player-screen.ts');
const FONTS = 'src/styles/fonts.css';

const CONTROLS = ['button', 'input', 'select', 'textarea'];
const ROOTS = ['.ps', '.ps-dialog'];

const norm = (s) => s.replace(/\s+/g, ' ').trim();

// Pure: tokens.css text -> the value of one custom property, or throws unless declared exactly once.
export function readStack(tokensText, prop) {
  const text = tokensText.replace(/\/\*[\s\S]*?\*\//g, '');
  const hits = [...text.matchAll(new RegExp(`${prop}\\s*:\\s*([^;}]+);`, 'g'))];
  if (hits.length !== 1) {
    throw new Error(`${prop} must be declared exactly once in tokens.css, found ${hits.length}`);
  }
  return norm(hits[0][1]);
}

// Pure: tokens.css text -> both site stacks.
export function readSiteStacks(tokensText) {
  return [readStack(tokensText, '--font-display'), readStack(tokensText, '--font-sans')];
}

// Pure: .astro text -> [{ selector, decls: [{ prop, value }] }] over every <style> block. Comments are
// blanked first; a rule is an innermost { } block, its selector the text since the previous brace.
export function parseRules(astroText) {
  const rules = [];
  for (const block of astroText.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) {
    const css = block[1].replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /([^{}]*)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
      const decls = m[2]
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const i = d.indexOf(':');
          return i < 0 ? null : { prop: d.slice(0, i).trim().toLowerCase(), value: norm(d.slice(i + 1)) };
        })
        .filter(Boolean);
      rules.push({ selector: norm(m[1]), decls });
    }
  }
  return rules;
}

// Pure: split on commas outside parentheses.
function splitTop(text) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// Pure: one compound selector -> { alts, spec } where alts are the simple selectors it matches and
// spec is classes*100 + elements. Only the shapes this rule needs: a bare token, :is(...), :where(...).
function compound(text) {
  const m = /^:(is|where)\((.*)\)$/.exec(text);
  const one = (t) => (t.startsWith('.') ? 100 : /^[a-z]+$/.test(t) ? 1 : 1000);
  if (!m) return { alts: [text], spec: one(text) };
  const alts = splitTop(m[2]);
  return { alts, spec: m[1] === 'where' ? 0 : Math.max(...alts.map(one)) };
}

// Pure: a selector -> the control-inherit rule's coverage, or null when it is not a `root control`
// descendant selector. coverage = set of "root control" pairs, spec = highest complex specificity.
function controlInheritShape(selector) {
  const pairs = new Set();
  let spec = 0;
  for (const complex of splitTop(selector)) {
    const halves = [];
    let depth = 0;
    let cur = '';
    for (const ch of complex) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (/\s/.test(ch) && depth === 0) {
        if (cur) halves.push(cur);
        cur = '';
      } else cur += ch;
    }
    if (cur) halves.push(cur);
    if (halves.length !== 2) return null;
    const [root, el] = halves.map(compound);
    if (!root.alts.every((a) => ROOTS.includes(a)) || !el.alts.every((a) => CONTROLS.includes(a))) return null;
    for (const r of root.alts) for (const e of el.alts) pairs.add(`${r} ${e}`);
    spec = Math.max(spec, root.spec + el.spec);
  }
  return { pairs, spec };
}

// Pure: (astro text, template-is-a-ps-root) -> failures for every form control in the markup that sits
// outside both roots, plus a vacuity failure when the markup holds no control at all.
export function gradeMarkup(astroText, templateIsRoot) {
  const failures = [];
  const html = astroText
    .replace(/^---[\s\S]*?\n---/, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  const stack = [];
  let controls = 0;
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
    const [tag, close, rawName, attrs] = m;
    const name = rawName.toLowerCase();
    if (close) {
      const i = stack.map((e) => e.name).lastIndexOf(name);
      if (i >= 0) stack.length = i;
      continue;
    }
    const classes = (/\bclass="([^"]*)"/.exec(attrs)?.[1] ?? '').split(/\s+/);
    const id = /\bid="([^"]*)"/.exec(attrs)?.[1];
    const isRoot = classes.includes('ps') || classes.includes('ps-dialog') || (templateIsRoot && name === 'template' && id === 'ps-template');
    if (CONTROLS.includes(name)) {
      controls++;
      if (!stack.some((e) => e.isRoot)) failures.push(`${tag} -- form control outside both .ps and .ps-dialog`);
    }
    if (!VOID.has(name) && !tag.endsWith('/>')) stack.push({ name, isRoot });
  }
  if (controls === 0) failures.push('no form control found in the markup: the markup contract is vacuous');
  return failures;
}

// Pure: component markup -> a failure for every style attribute that names a font, or whose value is an
// Astro expression this gate cannot read (fails closed). An inline declaration outranks every rule in
// the stylesheet, so a literal binding there proves nothing once a style attribute overrides it.
export function gradeInlineStyles(astroText) {
  const failures = [];
  const html = astroText.replace(/^---[\s\S]*?\n---/, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  for (const m of html.matchAll(/<[a-zA-Z][\w-]*\b[^>]*?\sstyle\s*=\s*("[^"]*"|'[^']*'|\{[^}]*\}|[^\s>]+)/g)) {
    const value = m[1];
    if (value.startsWith('{')) failures.push(`inline style ${value} -- an expression this gate cannot read`);
    else if (/font/i.test(value)) failures.push(`inline style ${value} -- names a font, outranking the screen's literal binding`);
  }
  return failures;
}

// Pure: mount source -> a failure for every write that can set a font on an element, enumerated by source
// text. A write whose target property this gate cannot resolve (a computed name) fails closed.
export function gradeMountStyleWrites(tsText) {
  const failures = [];
  const code = tsText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
  const consts = new Map([...code.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*'([^']*)'\s*;/g)].map((m) => [m[1], m[2]]));
  const literal = (arg) => /^(['"`])([^'"`]*)\1$/.exec(arg.trim())?.[2] ?? (consts.has(arg.trim()) ? consts.get(arg.trim()) : null);
  const at = (m) => `\`${m[0].trim()}\``;
  for (const m of code.matchAll(/\.style\s*\.\s*font\w*/g)) failures.push(`${at(m)} -- font write`);
  for (const m of code.matchAll(/\.style\s*\[/g)) failures.push(`${at(m)} -- computed style property`);
  for (const m of code.matchAll(/Object\.assign\(\s*[\w$.]*style\b/g)) failures.push(`${at(m)} -- computed style properties`);
  for (const m of code.matchAll(/\bsetProperty\(\s*([^,)]*)/g)) {
    const name = literal(m[1]);
    if (name === null) failures.push(`${at(m)} -- computed style property`);
    else if (/font/i.test(name)) failures.push(`${at(m)} -- font write`);
  }
  for (const m of code.matchAll(/\bcssText\s*\+?=\s*([^;\n]*)/g)) {
    if (/font/i.test(m[1])) failures.push(`${at(m)} -- font write`);
    else if (literal(m[1]) === null) failures.push(`${at(m)} -- computed cssText`);
  }
  for (const m of code.matchAll(/\bsetAttribute\(\s*([^,)]*),([^)]*)\)/g)) {
    const name = literal(m[1]);
    if (name === null) failures.push(`${at(m)} -- computed attribute name`);
    else if (name.toLowerCase() === 'style' && (/font/i.test(m[2]) || literal(m[2]) === null)) failures.push(`${at(m)} -- font write`);
  }
  // Markup or CSS built in a string: a style attribute or a declaration naming a font.
  for (const m of code.matchAll(/style\s*=\s*\\?["'][^"'`]*font|font-family|@font-face|\bfont\s*:/gi)) failures.push(`${at(m)} -- font write in a string`);
  return failures;
}

// Pure: (stylesheets [{ rel, text }], site stacks, allowed rel path) -> { failures, faces, allowedFaces }.
// Any @font-face naming a family from either stack swaps the face behind the literal stack, so only the
// site's own fonts file may declare one, and that file must still declare at least one -- an allowance
// pointing at a file with no face would mean the site's faces moved somewhere this gate does not look.
// A stylesheet import or link can carry the same @font-face from a file outside the scan, so it fails.
export function gradeFontFaces(files, stacks, allowed) {
  const failures = [];
  const unquote = (f) => f.trim().replace(/^(['"])(.*)\1$/, '$2').trim().toLowerCase();
  const families = new Set(stacks.flatMap((st) => st.split(',').map(unquote)));
  let faces = 0;
  let allowedFaces = 0;
  for (const { rel, text } of files) {
    const css = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
    for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
      faces++;
      if (rel === allowed) {
        allowedFaces++;
        continue;
      }
      const fam = /font-family\s*:\s*([^;}]+)/.exec(m[1])?.[1];
      if (fam === undefined || families.has(unquote(fam))) failures.push(`${rel}: @font-face ${fam ?? '(no font-family)'} -- names a site-stack family outside ${allowed}`);
    }
    for (const m of css.matchAll(/@import\b[^;]*|<link\b[^>]*stylesheet[^>]*>/gi)) failures.push(`${rel}: ${m[0]} -- a stylesheet this gate cannot scan`);
  }
  if (!files.some((f) => f.rel === allowed)) failures.push(`${allowed} was not among the scanned stylesheets`);
  else if (allowedFaces === 0) failures.push(`${allowed} declares no @font-face: the site's faces are hosted somewhere else now`);
  return { failures, faces, allowedFaces };
}

// Walks one project-owned directory for stylesheets and the files that carry <style> blocks.
function stylesheetsUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...stylesheetsUnder(full));
    else if (/\.(css|astro|html)$/.test(entry.name)) out.push({ rel: path.relative(repoRoot, full).split(path.sep).join('/'), text: fs.readFileSync(full, 'utf8') });
  }
  return out;
}

// Pure: mount source -> true while it adds `ps` to the root and clones the template into that root.
export function templateIsPsRoot(mountText) {
  return /root\.classList\.add\('ps'\)/.test(mountText) && /root\.append\(template\.content/.test(mountText);
}

// Pure: (astro text, site stacks, template-is-a-ps-root) -> { graded, failures }.
export function grade(astroText, stacks, templateIsRoot = false) {
  const failures = [];
  const graded = [];
  const body = stacks[1];
  const rules = parseRules(astroText);
  const inheritIdx = rules.findIndex((r) => controlInheritShape(r.selector) && r.decls.some((d) => d.prop === 'font-family' && d.value === 'inherit'));
  for (const root of ROOTS) {
    const bound = rules.some((r) => r.selector === root && r.decls.some((d) => d.prop === 'font-family' && d.value === body));
    if (!bound) failures.push(`${root} root rule does not bind font-family to the body stack`);
  }
  if (inheritIdx < 0) {
    failures.push('no control-inherit rule (font-family: inherit on button, input, select, textarea under .ps and .ps-dialog)');
  } else {
    const { pairs, spec } = controlInheritShape(rules[inheritIdx].selector);
    const missing = ROOTS.flatMap((r) => CONTROLS.map((c) => `${r} ${c}`)).filter((p) => !pairs.has(p));
    if (missing.length) failures.push(`control-inherit rule misses ${missing.join(', ')}`);
    if (spec > 100) failures.push(`control-inherit rule outranks one class (${rules[inheritIdx].selector}): it would beat a control's own binding`);
    const earlier = rules.slice(0, inheritIdx).filter((r) => !ROOTS.includes(r.selector) && r.decls.some((d) => d.prop === 'font-family' || d.prop === 'font'));
    if (earlier.length) failures.push(`control-inherit rule comes after ${earlier.map((r) => r.selector).join(', ')}: it would override them on source order`);
  }
  failures.push(...gradeMarkup(astroText, templateIsRoot));
  for (const [idx, rule] of rules.entries()) {
    const fonts = rule.decls.filter((d) => d.prop === 'font-family' || d.prop === 'font');
    if (fonts.length === 0) continue;
    graded.push(rule.selector);
    for (const d of fonts) {
      const where = `${rule.selector} { ${d.prop}: ${d.value} }`;
      if (d.prop === 'font-family' && d.value === 'inherit') {
        if (idx !== inheritIdx) failures.push(`${where} -- inherit is allowed only in the control-inherit rule`);
      } else if (d.value.includes('var(')) {
        failures.push(`${where} -- reads a custom property a route can redeclare`);
      } else if (d.prop === 'font-family' && !stacks.includes(d.value)) {
        failures.push(`${where} -- is not one of the site stacks`);
      } else if (d.prop === 'font' && !stacks.some((st) => d.value.includes(st))) {
        failures.push(`${where} -- shorthand does not contain a site stack`);
      }
    }
  }
  const has = (re) => graded.some((s) => re.test(s));
  if (graded.length === 0) failures.push('no font binding was graded: the contract is vacuous');
  else {
    if (!has(/\.ps-go\b/)) failures.push('no .ps-go rule was graded');
    if (!has(/\.ps-sec\b|reset/)) failures.push('no .ps-sec (or reset-label) rule was graded');
    if (!has(/\.ps-dialog/)) failures.push('no .ps-dialog-scoped rule was graded');
  }
  return { graded, failures };
}

function selftest() {
  const stacks = readSiteStacks(fs.readFileSync(TOKENS, 'utf8'));
  const [display, body] = stacks;
  assert.equal(display, "'Mitr', 'Noto Sans Thai', 'Sarabun', system-ui, sans-serif", 'tokens.css display stack read');
  assert.equal(body, "'Sarabun', 'Noto Sans Thai', system-ui, -apple-system, sans-serif", 'tokens.css body stack read');
  const D = `font-family: ${display};`;
  const B = `font-family: ${body};`;
  const INHERIT = ':is(.ps, .ps-dialog) :where(button, input, select, textarea) { font-family: inherit; }';
  const MARKUP = `
    <template id="ps-template"><div><button class="ps-step">-</button></div><button class="ps-go">go</button></template>
    <dialog class="ps-dialog"><p class="ps-dialog-body">x</p><button class="ps-sec">no</button></dialog>`;
  // Every fixture is the green shape with one part swapped, so each red is that part's alone.
  const shape = ({ go = D, sec = D, dlg = D, n = B, root = B, dialog = B, inherit = INHERIT, extra = '', markup = MARKUP } = {}) => `${markup}
    <style is:global>
    .ps { display: flex; ${root} }
    ${inherit}
    .ps-n { ${n} }
    .ps-go { ${go} font-size: 21px; }
    .ps-sec, .ps-danger { ${sec} }
    .ps-dialog { margin: auto; ${dialog} }
    .ps-dialog-title { ${dlg} }
    ${extra}
    </style>`;
  const cases = [
    ['display bindings on var(--font-display)', shape({ go: 'font-family: var(--font-display);', sec: 'font-family: var(--font-display);', dlg: 'font-family: var(--font-display);' }), /custom property/],
    ['name field on var(--font-sans)', shape({ n: 'font-family: var(--font-sans);' }), /custom property/],
    ['hostile alias via --ps-font', shape({ go: 'font-family: var(--ps-font);', extra: ':root { --ps-font: var(--font-display); }' }), /custom property/],
    ['font shorthand carrying var(--font-display)', shape({ go: 'font: 500 21px var(--font-display);' }), /custom property/],
    ['display stack differing by one family', shape({ dlg: `font-family: ${display.replace("'Sarabun', ", '')};` }), /not one of the site stacks/],
    ['body stack differing by one family', shape({ n: `font-family: ${body.replace('-apple-system, ', '')};` }), /not one of the site stacks/],
    ['zero graded rules', '<button class="ps">x</button><style is:global>.ps-go { color: red; }</style>', /vacuous/],
    ['no dialog-scoped rule graded', shape({ dialog: '', dlg: '', inherit: '' }), /no \.ps-dialog-scoped rule/],
    ['root rule without font-family', shape({ root: '' }), /^\.ps root rule/],
    ['dialog rule without font-family', shape({ dialog: '' }), /^\.ps-dialog root rule/],
    ['root bound to a route var', shape({ root: 'font-family: var(--font-sans);' }), /^\.ps root rule/],
    ['root bound to the display stack', shape({ root: D }), /^\.ps root rule/],
    ['missing control-inherit rule', shape({ inherit: '' }), /no control-inherit rule/],
    ['control-inherit rule under .ps only', shape({ inherit: '.ps :where(button, input, select, textarea) { font-family: inherit; }' }), /misses \.ps-dialog button/],
    ['control-inherit rule outranking a class', shape({ inherit: ':is(.ps, .ps-dialog) :is(button, input, select, textarea) { font-family: inherit; }' }), /outranks one class/],
    ['control-inherit rule after a control binding', shape({ inherit: '', extra: INHERIT }), /comes after/],
    ['inherit in a non-control rule', shape({ extra: '.ps-hint { font-family: inherit; }' }), /inherit is allowed only/],
    ['a <button> outside both roots', shape({ markup: `${MARKUP}<div class="ps-count"><button class="ps-step">+</button></div>` }), /outside both/],
    ['a <select> under a dialog that closed before it', shape({ markup: `${MARKUP}<select class="ps-x"></select>` }), /outside both/],
  ];
  for (const [name, text, why] of cases) {
    const { failures } = grade(text, stacks, true);
    assert.ok(failures.some((f) => why.test(f)), `${name}: expected red matching ${why}, got ${failures.join(' | ') || 'green'}`);
  }
  // The template counts as a .ps root only while the mount code makes it one.
  assert.ok(grade(shape(), stacks, false).failures.some((f) => /outside both/.test(f)), 'template without the mount premise: expected red');
  const greens = [
    ['fixed shape', shape()],
    ['fixed shape with a font shorthand holding the stack', shape({ go: `font: 500 21px ${display};` })],
    ['fixed shape with the inherit rule spelled per root', shape({ inherit: '.ps :where(button, input, select, textarea), .ps-dialog :where(button, input, select, textarea) { font-family: inherit; }' })],
  ];
  for (const [name, text] of greens) {
    const { failures } = grade(text, stacks, true);
    assert.equal(failures.length, 0, `${name}: expected green, got ${failures.join(' | ')}`);
  }
  // Inline style and mount-code writes outrank every stylesheet rule, and a same-name @font-face swaps
  // the face behind the literal stack. Collected, not thrown, so a red run lists every fixture.
  const misses = [];
  const expectRed = (name, failures, why) => { if (!failures.some((f) => why.test(f))) misses.push(`${name}: expected red matching ${why}, got ${failures.join(' | ') || 'green'}`); };
  const expectGreen = (name, failures) => { if (failures.length) misses.push(`${name}: expected green, got ${failures.join(' | ')}`); };
  const FACE = (fam) => `@font-face { font-family: ${fam}; src: url(x.woff2) format('woff2'); }`;
  expectRed('inline style font-family on .ps-go', gradeInlineStyles('<button class="ps-go" style="font-family:var(--font-display)">go</button>'), /inline style/);
  expectRed('inline style font shorthand', gradeInlineStyles(`<p class='ps-hint' style='font: 16px var(--x)'>x</p>`), /inline style/);
  expectRed('inline style as an Astro expression', gradeInlineStyles('<p class="ps-hint" style={hint}>x</p>'), /inline style/);
  expectGreen('inline style without font', gradeInlineStyles('<p class="ps-hint" style="margin:0">x</p>'));
  expectRed('mount code el.style.fontFamily', gradeMountStyleWrites("start.style.fontFamily = 'Georgia';"), /font write/);
  expectRed('mount code el.style.font', gradeMountStyleWrites("start.style.font = '16px serif';"), /font write/);
  expectRed("mount code setProperty('font-family')", gradeMountStyleWrites("start.style.setProperty('font-family', 'serif');"), /font write/);
  expectRed('mount code setProperty with a computed name', gradeMountStyleWrites('start.style.setProperty(prop, v);'), /computed/);
  expectRed('mount code style[computed]', gradeMountStyleWrites('start.style[key] = v;'), /computed/);
  expectRed('mount code cssText with a font', gradeMountStyleWrites("start.style.cssText = 'font: 16px serif';"), /font write/);
  expectRed("mount code setAttribute('style') with a font", gradeMountStyleWrites("start.setAttribute('style', 'font-family: serif');"), /font write/);
  expectRed('mount code setAttribute through an unresolved name', gradeMountStyleWrites('start.setAttribute(name, v);'), /computed/);
  expectRed('mount code Object.assign onto a style', gradeMountStyleWrites('Object.assign(start.style, s);'), /computed/);
  expectRed('mount code markup string carrying a font', gradeMountStyleWrites('root.innerHTML = `<b style="font-family:serif">x</b>`;'), /font write/);
  expectGreen('mount code non-font writes', gradeMountStyleWrites("const A = 'data-x';\nhtml.setAttribute(A, '1');\nb.setAttribute('aria-label', 'x');\nb.style.opacity = '0';\n// el.style.fontFamily in a comment"));
  const faces = (rel, text) => gradeFontFaces([{ rel, text }, { rel: 'src/styles/fonts.css', text: FACE("'Sarabun'") }], stacks, 'src/styles/fonts.css').failures;
  expectRed("route @font-face named 'Mitr'", faces('src/play/x/style.css', FACE("'Mitr'")), /@font-face/);
  expectRed('route @font-face named Noto Sans Thai, unquoted', faces('src/play/x/style.css', `a{} ${FACE('Noto Sans Thai')}`), /@font-face/);
  expectRed('route <style> @font-face named Sarabun', faces('src/play/x/play.astro', `<style>${FACE('"sarabun"')}</style>`), /@font-face/);
  expectRed('route @import of a remote stylesheet', faces('src/play/x/style.css', "@import url('https://fonts.example/css?family=Mitr');"), /@import|stylesheet/);
  expectRed('allowed fonts file declaring no face', gradeFontFaces([{ rel: 'src/styles/fonts.css', text: 'a{}' }], stacks, 'src/styles/fonts.css').failures, /declares no @font-face/);
  expectRed('route @FONT-FACE named Mitr, upper-case at-rule (CSS at-rules are case-insensitive)', faces('src/play/x/style.css', FACE("'Mitr'").replace('@font-face', '@FONT-FACE')), /@font-face/i);
  expectRed('route @IMPORT, upper-case', faces('src/play/x/style.css', "@IMPORT url(x.css);"), /@import|stylesheet/i);
  expectGreen('route @font-face for an off-stack family', faces('src/play/x/style.css', FACE("'Bomb Digits'")));
  expectGreen("@font-face named 'Mitr' in the allowed fonts file", faces('src/styles/fonts.css', FACE("'Mitr'")));
  assert.equal(misses.length, 0, `\n${misses.join('\n')}`);
  assert.ok(templateIsPsRoot("root.classList.add('ps');\n  root.append(template.content.cloneNode(true));"));
  assert.ok(!templateIsPsRoot("root.append(template.content.cloneNode(true));"));
  assert.throws(() => readStack(':root { --font-display: a; --font-display: b; }', '--font-display'), /exactly once/);
  assert.throws(() => readStack(':root { }', '--font-sans'), /exactly once/);
  console.log(`ps-font-binding-check selftest: ${cases.length + 1} red + ${greens.length} green fixtures + inline/mount/@font-face + 2 mount-premise + 2 tokens cases ok`);
}

if (process.argv.includes('--selftest')) {
  selftest();
} else {
  const stacks = readSiteStacks(fs.readFileSync(TOKENS, 'utf8'));
  const screen = fs.readFileSync(SCREEN, 'utf8');
  const mount = fs.readFileSync(MOUNT, 'utf8');
  const { graded, failures } = grade(screen, stacks, templateIsPsRoot(mount));
  const sheets = [...stylesheetsUnder(path.join(repoRoot, 'src', 'play')), ...stylesheetsUnder(path.join(repoRoot, 'src', 'styles'))];
  const faces = gradeFontFaces(sheets, stacks, FONTS);
  failures.push(...gradeInlineStyles(screen), ...gradeMountStyleWrites(mount), ...faces.failures);
  if (failures.length) {
    for (const f of failures) console.error(`FAIL ${f}`);
    console.error(`ps-font-binding-check: ${failures.length} violation(s) over ${graded.length} graded rule(s)`);
    process.exit(1);
  }
  console.log(`ps-font-binding-check: ${graded.length} graded rule(s) all bound to a site stack; both roots bound, controls inherit, every control inside a root; no inline or mount-code font write; ${sheets.length} stylesheet file(s) under src/play and src/styles, ${faces.faces} @font-face, all ${faces.allowedFaces} site-stack faces in ${FONTS}`);
}
