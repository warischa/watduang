// gh269 real-route hook, injected by the harness AFTER the real first-screen sampler, so its rAF
// callbacks follow the sampler's in every frame. Inert unless the URL hash carries gh269=<mech>,<order>.
//
// It puts a stylesheet-only reveal at the replay's point on a real route (croc-bite): inside a frame
// callback that runs after the sampler's, immediately before the route's own open task. To place the
// open task there it holds the roster lock (the one the legacy-list migration takes before the open)
// from document start, and releases it from the reveal callback ('real') or 300ms later ('pos').
// The harness seeds a legacy list key so the migration really takes that lock.
(() => {
  const m = /gh269=(\w+),(\w+)/.exec(location.hash);
  if (!m) return;
  const [, mech, order] = m;
  // document.documentElement can still be null when an on-new-document script runs, so it is read
  // lazily and the observer watches the document node itself.
  const attr = (n) => document.documentElement?.getAttribute(n) ?? null;
  const has = (n) => Boolean(document.documentElement?.hasAttribute(n));
  const A = 'data-player-screen';
  const P = 'data-player-screen-pending';
  const H = 'data-render-hold';
  const t = () => performance.now();
  const log = { mech, order, events: [], entries: [], frames: 0, gl: null, openAt: null, done: false, tagged: { leaf: 0, open: 0 } };
  window.__cal = log;
  const rec = () => window.__watduangFirstScreen;
  const mark = (name, extra = {}) => log.events.push({ name, at: t(), samples: rec()?.samples ?? null, stopped: rec()?.stopped ?? null,
    hold: attr(H), screen: attr(A), pending: attr(P), frames: log.frames, ...extra });

  const fresh = (kind) => { try { return document.createElement('canvas').getContext(kind) ? 'live' : 'null'; } catch (e) { return 'throw'; } };
  log.gl = { webgl: fresh('webgl'), webgl2: fresh('webgl2'), '2d': fresh('2d') };

  let release = null;
  navigator.locks.request('watduang:roster', () => { try { mark('lock-held'); } catch {} return new Promise((r) => { release = r; }); });

  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      log.entries.push({ id: e.identifier, renderTime: e.renderTime, loadTime: e.loadTime, paintTime: e.paintTime ?? null,
        presentationTime: e.presentationTime ?? null, seenAt: t() });
    }
  }).observe({ type: 'element', buffered: true });

  const ownText = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const tag = () => {
    const h1 = document.querySelector('#screen-setup h1');
    if (h1 && !h1.hasAttribute('elementtiming')) { h1.setAttribute('elementtiming', 'leaf'); log.tagged.leaf += 1; }
    for (const e of document.querySelectorAll('.ps *')) {
      if (!e.hasAttribute('elementtiming') && ownText(e)) { e.setAttribute('elementtiming', 'open'); log.tagged.open += 1; }
    }
  };

  let armed = false;
  const reveal = () => {
    mark('reveal-start', { setupOpacity: getComputedStyle(document.getElementById('screen-setup')).opacity });
    const rule = '#app #screen-setup.setup-overlay { opacity: 1 !important; visibility: visible !important; transform: none !important; }';
    if (mech === 'insert') {
      const s = [...document.styleSheets].find((x) => { try { return x.cssRules && !x.ownerNode?.id?.startsWith?.('__'); } catch { return false; } });
      s.insertRule(rule, s.cssRules.length);
    } else if (mech === 'adopt') {
      const s = new CSSStyleSheet();
      s.replaceSync(rule);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, s];
    } else throw new Error('unknown mech ' + mech);
    mark('reveal', { setupOpacity: getComputedStyle(document.getElementById('screen-setup')).opacity });
  };
  const arm = () => {
    if (armed) return;
    armed = true;
    // From a task: the chain's first callback is queued after the sampler's for the next frame, and
    // each re-registration keeps that order. Two settle frames, then the reveal frame.
    setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
      reveal();
      if (!release) { mark('no-lock'); return; }
      if (order === 'real') release();
      else if (order === 'pos') setTimeout(release, 300);
      mark('released-or-scheduled');
    }))), 0);
  };

  new MutationObserver((rs) => {
    tag();
    if (attr(A) === 'open' && log.openAt === null) { log.openAt = t(); mark('open-seen'); setTimeout(() => { log.done = true; }, 1500); }
    if (has(P) && attr(A) !== 'open') arm();
  }).observe(document, { attributes: true, childList: true, subtree: true });

  const fr = () => { log.frames += 1; if (!log.done) requestAnimationFrame(fr); };
  requestAnimationFrame(fr);
})();
