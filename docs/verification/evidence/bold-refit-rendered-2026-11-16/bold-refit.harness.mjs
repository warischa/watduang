// Rendered proof of the prize-draw bold refit (the rendered counterpart of the width-model test bold-refit.test.mjs).
// A scripts/driver.mjs session script, NOT a test: it needs a built dist/ served on HARNESS_PORT and a headless
// Chrome on CDP_PORT, so the name keeps it out of the test glob.
//
//   CDP_PORT=9344 HARNESS_PORT=4344 HARNESS_RUNS=3 node scripts/driver.mjs <this file>
//
// Per run (fresh storage, 1920x1080 desktop viewport, motion not reduced):
//   1. the REAL setup page takes a 30-name roster (eleven band names + 19 short fillers) and a real mouse click on
//      its start button opens the REAL projector route;
//   2. the bold face is warmed with the same call main.ts makes (document.fonts.load('700 20px Sarabun')), so
//      the refit's promise resolves before the re-mark frame: the cached-face order the fix is about;
//   3. a real mouse click on the MC's reveal button runs the wave, and nothing resizes the page afterwards;
//   4. every passed chip (.pd-chip.in) is measured: the fit rule's own inequality at the render weight, the
//      chip's scrollWidth against its clientWidth, and the font Chrome actually used for the name.
// A mutation log records the field's mark and the band chips' fitted size, with the timestamp, so a refit that
// lands in the unmarked window is visible as a size change while the field has no pd-marked.

const PORT = process.env.HARNESS_PORT;
if (!PORT) throw new Error('HARNESS_PORT is required');
const BASE = `http://localhost:${PORT}`;
const RUNS = Number(process.env.HARNESS_RUNS || 3);
const FIT_SLACK = 1.02; // names-dom.ts FIT_SLACK, the slack the fit rule demands

// Names whose bold width at the regular-weight fitted size overflows their box room, found by measurement on
// this route at 1920px (README, "Choosing the name"). Each is a valid roster name (names.ts checkName: at most
// 12 clusters, allowed characters only), fits at 20px regular with the fit rule's slack, and needs 19px bold.
const BAND = [
  'ลศฟไษ๊ปมญขีะญ้ก็',
  'แทซัฟปีาซษึศญืฮ่ล',
  'ษิปีญึ้ฟยลิผ๋แป่ฝึคา',
  'ตษัะล็นพ๋หฮฟข้ฟั้ซ',
  'ทฟหืในวญ็ตษนิาญ',
  'ยฝืาบึญญื่ลึ๊ขัแปฉืฝ',
  'ผฟึญึาธโลฟญนึผ็๋ตื',
  'ไญ็๋ษะฝแญออพมิธิ',
  'ดศ็๊ญตตพัยะษห๋ทึถ็',
  'ห๋ยะซนฟแมญึฟฮฉ',
  'ฉืน็ลึ่ะฟน๋ญช๋ผผปศึ',
];
const FILLERS = Array.from({ length: 19 }, (_, i) => `ลูกค้า${i + 1}`);
const ROSTER = [...BAND, ...FILLERS];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function (session) {
  const click = async (selector, label) => {
    const at = await session.evaluate(`
      const els=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(e=>!${JSON.stringify(label ?? null)}||e.textContent.trim()===${JSON.stringify(label ?? null)});
      const e=els[0]; if(!e) return null; e.scrollIntoView({block:'center'});
      const r=e.getBoundingClientRect(); const x=r.left+r.width/2, y=r.top+r.height/2;
      const hit=document.elementFromPoint(x,y);
      return {x,y,disabled:!!e.disabled,hit:!!hit&&(hit===e||e.contains(hit))};`);
    const p = at.value;
    if (!p || p.disabled || !p.hit) throw new Error(`cannot click ${selector} ${label ?? ''}: ${JSON.stringify(at)}`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await session.cdp('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
    }
  };

  const runs = [];
  let attempts = 0;
  while (runs.filter((r) => !r.void).length < RUNS && attempts < RUNS + 4) {
    attempts += 1;
    await session.setWidth(1920, 1080, false);
    await session.nav(`${BASE}/game/prize-draw/`);
    await session.cdp('Storage.clearDataForOrigin', { origin: BASE, storageTypes: 'all' });
    await session.nav(`${BASE}/game/prize-draw/`);
    await session.evaluate(`
      const ta=document.getElementById('pd-names');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(ta, ${JSON.stringify(ROSTER.join('\n'))});
      ta.dispatchEvent(new Event('input',{bubbles:true}));
      const ev=document.getElementById('pd-event');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(ev,'bold-refit');
      ev.dispatchEvent(new Event('input',{bubbles:true}));
      return true;`);
    await click('#pd-start');
    await sleep(3000);
    const pre = (
      await session.evaluate(`
      return { path: location.pathname, field: !!document.querySelector('.pd-field'), chips: document.querySelectorAll('.pd-chip').length,
        innerWidth, innerHeight, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        bundle: [...document.scripts].map(s=>s.src.split('/').pop()).filter(n=>n.startsWith('play.astro')) };`)
    ).value;
    if (!pre || pre.path !== '/game/prize-draw/play/' || !pre.field) throw new Error(`projector not reached: ${JSON.stringify(pre)}`);
    if (pre.innerWidth !== 1920 || pre.reduced) throw new Error(`void run, wrong viewport/motion: ${JSON.stringify(pre)}`);

    // Warm the bold face exactly as main.ts asks for it, then prove it is loaded before the press.
    const font = (
      await session.evaluate(`
      const before = document.fonts.check('700 20px Sarabun','ก');
      await document.fonts.load('700 20px Sarabun','ก');
      await document.fonts.ready;
      const faces=[...document.fonts].filter(f=>f.family.replace(/["']/g,'')==='Sarabun').map(f=>({weight:f.weight,status:f.status}));
      return { checkBefore: before, checkAfter: document.fonts.check('700 20px Sarabun','ก'), faces };`)
    ).value;

    // The mutation log: the field's mark, and the fitted size of every band chip, per mutation. It watches the
    // frame, not the field: the reveal press rebuilds the field, and a log on the old one would see nothing.
    await session.evaluate(`
      const t0=performance.now(); const BAND=new Set(${JSON.stringify(BAND)});
      window.__log=[];
      const frame=document.getElementById('pd-frame');
      const snap=(why)=>{ const field=frame.querySelector('.pd-field');
        window.__log.push({ t:Math.round(performance.now()-t0), why, marked:field?field.classList.contains('pd-marked'):null,
          display:field?(field.style.display||''):null,
          sizes:field?[...field.querySelectorAll('.pd-chip')].filter(c=>BAND.has(c.firstElementChild.textContent)).map(c=>c.style.fontSize||''):[] }); };
      new MutationObserver(()=>snap('mut')).observe(frame,{attributes:true,attributeFilter:['class','style'],subtree:true,childList:true});
      snap('start'); return true;`);

    await click('.pd-mc button', 'เปิดผล');
    // Wait for the wave to reach its marked end state, then let every transition and late refit land.
    let marked = false;
    for (let i = 0; i < 100 && !marked; i++) {
      await sleep(100);
      marked = (await session.evaluate(`return document.querySelector('.pd-field')?.classList.contains('pd-marked') ?? false;`)).value;
    }
    await sleep(4000);

    const m = (
      await session.evaluate(`
      const FIT_SLACK=${FIT_SLACK}; const BAND=new Set(${JSON.stringify(BAND)});
      const field=document.querySelector('.pd-field');
      const chips=[...field.querySelectorAll('.pd-chip.in')].map(chip=>{
        const run=chip.firstElementChild; const cs=getComputedStyle(chip);
        const room=chip.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
        const rect=run.getBoundingClientRect();
        return { name:run.textContent, band:BAND.has(run.textContent), fontSize:chip.style.fontSize, weight:cs.fontWeight,
          wrapped:chip.classList.contains('nm-wrap'), clientWidth:chip.clientWidth, scrollWidth:chip.scrollWidth, room,
          runOffsetWidth:run.offsetWidth, runRectWidth:Math.round(rect.width*100)/100,
          fitDemand:Math.round(run.offsetWidth*FIT_SLACK*100)/100, spill:run.offsetWidth-room,
          fitOk: run.offsetWidth*FIT_SLACK<=room };});
      return { marked: field.classList.contains('pd-marked'), screen: document.getElementById('pd-frame')?.getAttribute('data-screen'),
        innerWidth, chips, log: window.__log };`)
    ).value;

    // The font Chrome actually painted the first band chip's name in (CDP CSS domain).
    let platform = null;
    await session.cdp('DOM.enable');
    await session.cdp('CSS.enable');
    const doc = await session.cdp('DOM.getDocument', { depth: 1 });
    const q = await session.cdp('DOM.querySelectorAll', { nodeId: doc.result.root.nodeId, selector: '.pd-chip.in .nm' });
    for (const nodeId of q.result?.nodeIds ?? []) {
      const text = await session.cdp('DOM.getOuterHTML', { nodeId });
      if (BAND.some((b) => text.result.outerHTML.includes(b))) {
        const pf = await session.cdp('CSS.getPlatformFontsForNode', { nodeId });
        platform = pf.result?.fonts ?? pf;
        break;
      }
    }

    const inChips = m.chips;
    const bandChips = inChips.filter((c) => c.band);
    if (!bandChips.length || !m.marked) {
      runs.push({ void: true, why: !m.marked ? 'field never marked' : 'no band chip passed round 1', pre });
      continue;
    }
    runs.push({
      void: false,
      pre,
      font,
      platform,
      chipsPassed: inChips.length,
      bandPassed: bandChips.length,
      // The brief's literal metric: the worst scrollWidth - clientWidth over every passed chip.
      maxScrollOver: Math.max(...inChips.map((c) => c.scrollWidth - c.clientWidth)),
      // The fit rule's own inequality at the render weight: how many passed chips break it, and the worst spill.
      fitViolations: inChips.filter((c) => !c.fitOk && !c.wrapped).length,
      maxSpillPx: Math.max(...inChips.map((c) => c.spill)),
      band: bandChips,
      log: m.log,
    });
  }
  return { base: BASE, runsWanted: RUNS, attempts, voidRuns: runs.filter((r) => r.void).length, runs };
}
