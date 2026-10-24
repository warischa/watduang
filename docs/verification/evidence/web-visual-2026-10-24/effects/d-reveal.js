// PROTOTYPE for measurement only (gh#288 Phase 0). Placeholder values, not design (ADR-0033).
// D: below-the-fold blocks fade and rise once on first view. Nothing above the fold is touched, so LCP
// cannot wait on it; the class is added by script, so without JS every block is simply visible.
const st = document.createElement('style');
st.textContent = '.proto-reveal{opacity:0;transform:translateY(16px);transition:opacity .45s ease-out,transform .45s ease-out}.proto-reveal.is-in{opacity:1;transform:none}@media (prefers-reduced-motion:reduce){.proto-reveal{transform:none;transition:opacity .2s linear}}';
document.head.appendChild(st);
const els = [...document.querySelectorAll('main section, .game-card, a.tile')].filter((e) => e.getBoundingClientRect().top > innerHeight);
const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }, { rootMargin: '0px 0px -10% 0px' });
for (const e of els) { e.classList.add('proto-reveal'); io.observe(e); }
return els.length;
