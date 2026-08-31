// The round rule is NOT defined here. It lives in src/games/pinocchio-luck.ts, where a test can
// reach it (src/games/pinocchio-luck.test.mjs), and this file is its only caller — one game, one
// implementation. Everything still in this file is presentation: DOM, WebGL, sound, and timing.
import {
  PHASE,
  QUESTIONS,
  liveRng,
  makeMatch,
  advanceTurn,
  rerollAllSafe,
  resolveChoice,
  getLoser,
  currentPlayer as currentPlayerOf,
} from '../../games/pinocchio-luck.ts';
// ADR-0017's ghost-tap gate: the second contact of a double-tap aimed at the screen that just went
// away must not land on the control that replaced it. On this route that control is an ANSWER — the
// tap that decides whether a player's nose grows — so the gate is not cosmetic here.
import { armAllButtons } from '../../games/_arm-gate.ts';

(()=>{'use strict';
const panel=document.querySelector('#panel'),roundTag=document.querySelector('#roundTag'),announcer=document.querySelector('#announcer'),app=document.querySelector('#app'),stageFrame=document.querySelector('#stageFrame');
const fxRng={next:()=>Math.random()};
let game=null,setupCount=4,setupNames=[],transitionEpoch=0,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||new URLSearchParams(location.search).has('reduced');
app.dataset.reducedMotion=String(reduced);

// currentPlayer is exported without a default state; the render functions below all mean "the
// current match", so the default is restored here rather than at ~20 call sites.
function currentPlayer(state=game){return currentPlayerOf(state)}

// The two round transitions the page owns. advanceTurn and rerollAllSafe hold the rule; everything
// added here is presentation — sound, camera shake, and the redraw.
function continueTurn(){
  if(!game||game.phase!==PHASE.TURN_RESULT)return;
  transitionEpoch++;
  advanceTurn(game);
  render();
}

function resetAllSafe(){
  if(game?.phase!==PHASE.ALL_SAFE)return;
  rerollAllSafe(game);
  transitionEpoch++;
  sounds.tier();
  visual.celebrate=.8;
  render();
}

function announce(text){
  announcer.textContent='';
  requestAnimationFrame(()=>announcer.textContent=text);
}
function esc(value){
  return String(value).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function setSetupCount(value){
  const n=Number(value);
  if(!Number.isInteger(n)||n<2||n>10)return;
  document.querySelectorAll('.name-input').forEach((el,i)=>setupNames[i]=el.value);
  setupCount=n;
  while(setupNames.length<n)setupNames.push('');
  setupNames.length=n;
  renderSetup();
}

function setupMarkup(){
  return `<div class="view">
    <p class="kicker">เกมปาร์ตี้เครื่องเดียว · 2–10 คน</p>
    <h2 class="headline">ใครจมูกยาวสุด คนนั้นแพ้</h2>
    <p class="support">ตอบคำถามคนละข้อ ถ้าโดนหลอก จมูกน้องจะยาวขึ้น</p>
    <div class="setup-row">
      <div>
        <strong>จำนวนผู้เล่น</strong>
        <div class="tiny" style="text-align:left;margin-top:2px">ส่งเครื่องต่อกันทีละคน</div>
      </div>
      <div class="stepper">
        <button type="button" id="minus" data-act="count-down" aria-label="ลดจำนวนผู้เล่น">−</button>
        <label><span class="sr-only">จำนวนผู้เล่น</span><input id="count" inputmode="numeric" value="${setupCount}" aria-describedby="countError"></label>
        <button type="button" id="plus" data-act="count-up" aria-label="เพิ่มจำนวนผู้เล่น">+</button>
      </div>
    </div>
    <p id="countError" class="sr-only">กรอกจำนวนเต็มตั้งแต่ 2 ถึง 10</p>
    <div class="names">
      ${Array.from({length:setupCount},(_,i)=>`
        <label class="name-field">
          <span>${i+1}</span>
          <input class="name-input" maxlength="28" autocomplete="off" value="${esc(setupNames[i]||'')}" placeholder="ผู้เล่น ${i+1}" aria-label="ชื่อผู้เล่น ${i+1}">
        </label>
      `).join('')}
    </div>
    <button class="primary" id="start" type="button" data-act="start">สุ่มคิว แล้วเริ่มเกม</button>
    <p class="tiny">คำตอบถูก/ผิดและแต้มจมูกจะสุ่มใหม่ทุกเกม</p>
  </div>`;
}

function renderSetup(){
  game=null;
  roundTag.textContent='ตั้งวง';
  visual.targetNose=0;
  panel.innerHTML=setupMarkup();
  validateCount();
  // Setup is armed like every other screen (ADR-0017). Two things made it look unarmable and
  // neither does any more:
  // (1) roster-bridge.ts seeds a saved group by clicking [data-act="start"] right after this module
  //     runs, and .click() on a `disabled` button dispatches nothing at all. Its drive() unlocks the
  //     control for that one programmatic call and restores what it found, so seeding survives;
  // (2) validateCount() owns #start's `disabled`, and the gate's blanket re-enable would fight it,
  //     offering a roster of one as startable. Handing validateCount to the gate as its onArm makes
  //     the owner run last: the window still disables every setup button for its 400ms, and when it
  //     closes #start goes back to whatever the live count says. Excepting #start from the gate was
  //     the rejected option — it would leave the one button a ghost tap most wants with no guard.
  // Read the size of what (2) fixes correctly: an invalid count was never a REACHABLE start —
  // startMatch() re-runs validateCount() and returns on false. What the hook closes is a button
  // that looks pressable when it is not, and the aria-invalid state next to it. An affordance, not
  // an exploit; weigh the next change to this seam on that basis.
  armPanel(countSteppers(),validateCount);
}

// Reads the live #count field. Returns FALSE when the field is absent rather than assuming a missing
// field is a valid one — the caller uses this to decide whether a round may start.
function validateCount(){
  const count=document.querySelector('#count'),start=document.querySelector('#start');
  if(!count||!start)return false;
  const v=Number(count.value),valid=Number.isInteger(v)&&v>=2&&v<=10;
  count.setAttribute('aria-invalid',String(!valid));
  document.querySelector('#countError')?.classList.toggle('sr-only',valid);
  start.disabled=!valid;
  return valid;
}

function startMatch(){
  if(!validateCount())return;
  document.querySelectorAll('.name-input').forEach((el,i)=>setupNames[i]=el.value);
  game=makeMatch(setupNames.slice(0,setupCount),liveRng);
  sounds.click(620);
  visual.targetNose=0;
  render();
}

function renderPass(){
  const p=currentPlayer();
  visual.targetNose=p.nose;
  panel.innerHTML=`<div class="view pass-card">
    <p class="kicker">ส่งเครื่องให้คนนี้</p>
    <div class="player-orb" aria-hidden="true">${esc(p.name.slice(0,1))}</div>
    <h2 class="headline">${esc(p.name)}</h2>
    <p class="privacy-note"><span aria-hidden="true">◉</span> คำถามจะยังไม่เปิดจนกว่าจะพร้อม</p>
    <button class="primary" id="ready" type="button" data-act="ready">พร้อมแล้ว</button>
  </div>`;
}

function revealQuestion(){
  if(!game||game.phase!==PHASE.PASS)return;
  game.phase=PHASE.QUESTION;
  sounds.click(720);
  render();
}

function renderQuestion(){
  const p=currentPlayer(),q=QUESTIONS.find(x=>x.id===p.assignedQuestionId);
  if(new URLSearchParams(location.search).has('qa'))panel.dataset.qaCorrect=p.assignedCorrectChoice;
  panel.innerHTML=`<div class="view">
    <div class="question-count">
      <span>ตาของ <strong>${esc(p.name)}</strong></span>
      <span>${game.currentTurnIndex+1} / ${game.players.length}</span>
    </div>
    <h2 class="question">${esc(q.prompt)}</h2>
    <div class="answers">
      <button class="answer" type="button" data-act="answer" data-arg="A" data-choice="A">
        <span class="answer-letter">A</span>
        <span class="answer-text">${esc(q.optionA)}</span>
      </button>
      <button class="answer" type="button" data-act="answer" data-arg="B" data-choice="B">
        <span class="answer-letter">B</span>
        <span class="answer-text">${esc(q.optionB)}</span>
      </button>
      <button class="answer" type="button" data-act="answer" data-arg="C" data-choice="C">
        <span class="answer-letter">C</span>
        <span class="answer-text">${esc(q.optionC)}</span>
      </button>
    </div>
  </div>`;
}

function answer(choice){
  if(!resolveChoice(game,choice))return;
  transitionEpoch++;
  const epoch=transitionEpoch,p=currentPlayer();
  visual.reaction=p.wasCorrect?'good':'bad';
  visual.reactionTime=0;
  visual.targetNose=p.nose;
  if(p.wasCorrect){
    sounds.success();
    spawnParticles('sparkle',28);
  }else{
    sounds.wrong();
    sounds.ratchet(p.nose);
    addTrauma(.92);
    spawnParticles('wood',40);
  }
  renderReveal();
  // 30ms was the mockup's reduced-motion value, and it cut the reveal screen before anyone could read
  // it — including the nose the line above just started growing. Reduced motion is a request about
  // motion, not about time, so the beat is kept and only the wrong-answer hold is trimmed.
  const delay=p.wasCorrect?450:(reduced?700:960);
  setTimeout(()=>{
    if(epoch!==transitionEpoch||game.phase!==PHASE.REVEAL)return;
    game.phase=PHASE.TURN_RESULT;
    render();
  },delay);
}

function renderReveal(){
  const p=currentPlayer(),good=p.wasCorrect;
  panel.innerHTML=`<div class="view result ${good?'good':'bad'}">
    <div class="result-symbol" aria-hidden="true">${good?'✓':'!'}</div>
    <h2 class="headline">${good?'รอดแบบงง ๆ !':'โป๊ะแตก! จมูกเริ่มยาวแล้ว'}</h2>
    ${good?'<p class="support">คำตอบนี้ดันตรงกับที่ระบบสุ่มไว้พอดี จมูกสั้นเท่าเดิม</p>':'<p class="support">หุ่นไม้กำลังกลั้นไม่อยู่… จมูกพุ่งออกมาแล้ว!</p>'}
    <p class="locked-note">ล็อกคำตอบแล้ว · กำลังประมวลผล</p>
  </div>`;
  announce(good?'ตอบถูก จมูกไม่ยาว':'ตอบผิด จมูกกำลังยาว');
}

function renderTurnResult(){
  const p=currentPlayer(),good=p.wasCorrect;
  visual.targetNose=p.nose;
  panel.innerHTML=`<div class="view result ${good?'good':'bad'}">
    <div class="result-symbol" aria-hidden="true">${good?'✓':'↗'}</div>
    <h2 class="headline">${good?'จมูกเท่าเดิม':'ยาวขึ้น +'+p.nose+' ขั้น!'}</h2>
    ${good?'<div class="growth" style="color:var(--green)">0</div>':`<div class="growth pop">+${p.nose}</div>`}
    <p class="support">${good?'ดวงแข็งมาก รอดไปได้อีกหนึ่งคน':'แต้มนี้ถูกหยิบออกจากกองแล้ว ไม่มีใครได้ซ้ำแน่นอน'}</p>
    <button class="primary" id="next" type="button" data-act="next">${game.currentTurnIndex===game.players.length-1?'ดูผลสรุปทั้งวง ❯':'ส่งต่อให้คนถัดไป ❯'}</button>
  </div>`;
  announce(`${p.name} จมูก ${p.nose} ขั้น`);
}

function renderAllSafe(){
  visual.targetNose=0;
  spawnParticles('sparkle',35);
  panel.innerHTML=`<div class="view result good">
    <div class="all-safe" aria-hidden="true">🎉 ✓ ✓ ✓ 🎉</div>
    <h2 class="headline">เอ้า… รอดหมดทั้งวง!</h2>
    <p class="support">ทุกคนดวงแข็งได้แต้ม 0 จึงยังไม่มีผู้แพ้ ต้องสุ่มคำถามและคำตอบใหม่ให้ครบทุกคน</p>
    <button class="primary" id="reroll" type="button" data-act="reroll">สุ่มใหม่ทั้งกลุ่ม</button>
    <p class="tiny">คิวเดิม · จมูกยัง 0 · กองแต้ม 1–10 ถูกสับใหม่</p>
  </div>`;
  announce('ทุกคนตอบถูก ยังไม่มีผู้แพ้ ต้องเล่นใหม่ทั้งกลุ่ม');
}

function renderResults(){
  const loser=getLoser(game),standing=game.players.slice().sort((a,b)=>b.nose-a.nose);
  visual.targetNose=loser.nose;
  if(!visual.resultBurst){
    visual.resultBurst=true;
    sounds.fanfare();
    spawnParticles('confetti',80);
  }
  panel.innerHTML=`<div class="view result bad">
    <p class="kicker">ผลการตัดสิน</p>
    <h2 class="headline">${esc(loser.name)} จมูกยาวที่สุด!</h2>
    <p class="support">แพ้ไปด้วยจมูกยาว <strong>${loser.nose} ขั้น</strong> — โดนล้อเป็นเกียรติประจำวง!</p>
    <ol class="standings">
      ${standing.map((p,i)=>`
        <li class="standing ${p.id===loser.id?'loser':''}">
          <span>${p.id===loser.id?'🪵':`#${i+1}`}</span>
          <strong>${esc(p.name)}${p.id===loser.id?' (แพ้!)':''}</strong>
          <span class="nose-score ${p.nose===0?'zero':''}">${p.nose} ขั้น</span>
        </li>
      `).join('')}
    </ol>
    <button class="primary" id="replay" type="button" data-act="replay">เล่นใหม่ชื่อเดิม</button>
    <button class="secondary" id="edit" type="button" data-act="edit-names">แก้ไขรายชื่อ</button>
  </div>`;
  announce(`${loser.name} แพ้ จมูกยาว ${loser.nose} ขั้น`);
}

function replayMatch(){
  if(!game)return;
  game=makeMatch(game.players.map(p=>p.name),liveRng);
  visual.resultBurst=false;
  visual.targetNose=0;
  sounds.click(640);
  render();
}

function editNames(){
  if(!game)return;
  setupCount=game.players.length;
  setupNames=game.players.map(p=>p.name);
  visual.resultBurst=false;
  renderSetup();
}

// Every screen below is mounted by replacing #panel's innerHTML, so the gate is re-armed on each
// reveal — a single call at module init would arm the setup screen and nothing a player ever taps
// into. #panel is the SAME node across screens, so the previous gate is cancelled first; otherwise
// each render would leave another pointerdown listener on it, still flipping `disabled` on buttons
// that left the document several screens ago.
let disarmPanel=null;
function armPanel(except=[],onArm){
  if(disarmPanel)disarmPanel();
  disarmPanel=armAllButtons(panel,except,onArm);
}

// The roster steppers, excepted from the gate. _arm-gate.ts records why the exception exists and it
// is per CONTROL, not per game: the 400ms window assumes the gated control has no legitimate
// sub-500ms follow-up tap, and #minus/#plus are the one pair on this screen a single player taps
// repeatedly — their own handler re-renders #panel, so gating them would disable the button under
// the finger on every step and a player walking 2 to 10 would wait 400ms nine times. Same list
// timebomb, dice-loser, power-meter and freeze-tap's rapidTapControls() keep, and the same ruling
// short-stick's +/- re-render seam got. Re-queried per call: renderSetup() replaces #panel
// wholesale, so a cached reference would name a detached node.
function countSteppers(){
  return [document.querySelector('#minus'),document.querySelector('#plus')].filter(Boolean);
}

function render(){
  delete panel.dataset.qaCorrect;
  // Setup arms itself inside renderSetup(), because three of its four reveal sites never pass
  // through here: setSetupCount(), editNames() and module init all call it directly.
  if(!game)return renderSetup();
  roundTag.textContent=`รอบ ${game.rerollRound} · ${game.currentTurnIndex+1}/${game.players.length}`;
  if(game.phase===PHASE.PASS)renderPass();
  else if(game.phase===PHASE.QUESTION)renderQuestion();
  else if(game.phase===PHASE.REVEAL)renderReveal();
  else if(game.phase===PHASE.TURN_RESULT)renderTurnResult();
  else if(game.phase===PHASE.ALL_SAFE)renderAllSafe();
  else if(game.phase===PHASE.RESULTS)renderResults();
  armPanel();
}

class SoundSynth{
  constructor(){
    this.ctx=null;
    this.enabled=localStorageSafe('pinocchio-sound')!=='off';
  }
  ensure(){
    if(!this.enabled)return null;
    const C=window.AudioContext||window.webkitAudioContext;
    if(!C)return null;
    if(!this.ctx)this.ctx=new C();
    if(this.ctx.state==='suspended')this.ctx.resume();
    return this.ctx;
  }
  tone(freq,dur=.1,type='sine',vol=.12,delay=0,end=freq){
    const c=this.ensure();if(!c)return;
    const t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();
    o.type=type;
    o.frequency.setValueAtTime(freq,t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+dur);
    g.gain.setValueAtTime(vol,t);
    g.gain.exponentialRampToValueAtTime(.001,t+dur);
    o.connect(g);g.connect(c.destination);
    o.start(t);o.stop(t+dur+.02);
  }
  click(f=520){this.tone(f,.07,'sine',.14,0,220)}
  ratchet(count=5){
    const steps=Math.min(count,8);
    for(let i=0;i<steps;i++){
      this.tone(380+i*65,.04,'sawtooth',.08,i*.06,550+i*70);
    }
  }
  success(){
    [523,659,784,1046].forEach((f,i)=>this.tone(f,.32,'sine',.14,i*.045,f));
    this.tone(1318,.45,'triangle',.12,.18,1318);
  }
  wrong(){
    this.tone(185,.55,'sawtooth',.22,0,42);
    this.tone(98,.48,'triangle',.18,.07,35);
  }
  tier(){
    [320,440,580,880].forEach((f,i)=>this.tone(f,.28,'sine',.11,i*.05,f*1.1));
  }
  fanfare(){
    [392,523,659,784,1046].forEach((f,i)=>this.tone(f,.45,'triangle',.15,i*.075,f));
  }
}

function localStorageSafe(key,value){
  try{
    if(value!==undefined)localStorage.setItem(key,value);
    return localStorage.getItem(key);
  }catch{return null}
}

const sounds=new SoundSynth(),soundBtn=document.querySelector('#soundBtn');
function syncSound(){
  soundBtn.setAttribute('aria-pressed',String(sounds.enabled));
  soundBtn.setAttribute('aria-label',sounds.enabled?'ปิดเสียง':'เปิดเสียง');
  soundBtn.textContent=sounds.enabled?'♪':'×';
}
function toggleSound(){
  sounds.enabled=!sounds.enabled;
  localStorageSafe('pinocchio-sound',sounds.enabled?'on':'off');
  if(sounds.enabled)sounds.click();
  syncSound();
}
syncSound();

// THE ONLY EVENT WIRING IN THIS FILE. Every control is delegated off the document through data-act,
// so the panel's innerHTML re-renders cannot orphan a handler and there is no on-attribute for
// the CSP to block (ADR-0005). The keys here and the data-act values in the markup above are one
// closed set — src/play/pinocchio-luck/handlers.test.mjs checks it in both directions.
const ACTIONS={
  'count-down':()=>setSetupCount(setupCount-1),
  'count-up':()=>setSetupCount(setupCount+1),
  start:startMatch,
  ready:revealQuestion,
  answer:(arg)=>answer(arg),
  next:()=>{sounds.click(520);continueTurn()},
  reroll:resetAllSafe,
  replay:replayMatch,
  'edit-names':editNames,
  sound:toggleSound,
};

document.addEventListener('click',(event)=>{
  const target=event.target instanceof Element?event.target.closest('[data-act]'):null;
  if(!target)return;
  const run=ACTIONS[target.dataset.act];
  if(run)run(target.dataset.arg);
});
// The count field is not a click target, so it gets the same delegation on its own two events.
document.addEventListener('input',(event)=>{
  if(event.target instanceof Element&&event.target.id==='count')validateCount();
});
document.addEventListener('change',(event)=>{
  if(event.target instanceof Element&&event.target.id==='count'&&validateCount()){
    setSetupCount(Number(event.target.value));
  }
});

const visual={
  targetNose:0,
  nose:0,
  noseVelocity:0,
  reaction:'neutral',
  reactionTime:9,
  trauma:0,
  celebrate:0,
  resultBurst:false,
  particles:[],
  motes:[]
};

function addTrauma(n){if(!reduced)visual.trauma=Math.min(1,visual.trauma+n)}

function spawnParticles(type,count){
  if(reduced)count=Math.min(count,8);
  for(let i=0;i<count;i++){
    const a=fxRng.next()*Math.PI*2,s=.6+fxRng.next()*2.2;
    visual.particles.push({
      type,
      x:-.2+(fxRng.next()-.5)*.3,
      y:.35+(fxRng.next()-.5)*.2,
      z:.8+(fxRng.next()-.5)*.4,
      vx:Math.cos(a)*s,
      vy:.6+fxRng.next()*2.0,
      vz:(fxRng.next()-.5)*1.6,
      life:.65+fxRng.next()*1.2,
      max:1.85,
      size:.04+fxRng.next()*.07,
      color:type==='sparkle'?[.35,1,.75]:type==='confetti'?[[1,.3,.35],[1,.82,.22],[.28,.85,.95],[.75,.35,.95],[.4,1,.5]][i%5]:[.88,.52,.22]
    });
  }
}

// Initialize ambient theatrical dust motes
for(let i=0;i<18;i++){
  visual.motes.push({
    x:(fxRng.next()-.5)*4.5,
    y:-1.2+fxRng.next()*2.8,
    z:(fxRng.next()-.5)*3.5,
    vy:.08+fxRng.next()*.18,
    size:.025+fxRng.next()*.035,
    phase:fxRng.next()*Math.PI*2
  });
}

function initGL(){
  const canvas=document.querySelector('#gameCanvas');
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,premultipliedAlpha:false})||canvas.getContext('experimental-webgl');
  if(!gl){
    app.classList.add('no-webgl');
    return null;
  }

  const VS=`
    attribute vec3 aPos, aNormal;
    uniform mat4 uModel, uViewProj;
    varying vec3 vWorld, vNormal;
    void main(){
      vec4 w = uModel * vec4(aPos, 1.0);
      vWorld = w.xyz;
      vNormal = normalize(mat3(uModel) * aNormal);
      gl_Position = uViewProj * w;
    }
  `;

  const FS=`
    precision mediump float;
    uniform vec3 uBase, uCamera;
    uniform float uAlpha, uGlow, uMat;
    varying vec3 vWorld, vNormal;
    void main(){
      vec3 N = normalize(vNormal);
      vec3 V = normalize(uCamera - vWorld);
      
      // Warm key spotlight from upper left
      vec3 L_key = normalize(vec3(-0.45, 0.95, 0.75));
      vec3 H_key = normalize(L_key + V);
      float diff_key = max(dot(N, L_key), 0.0);
      
      // Warm theatrical footlight uplight
      vec3 L_up = normalize(vec3(0.0, -0.9, 0.45));
      float diff_up = max(dot(N, L_up), 0.0) * 0.42;
      
      // Cool magenta/violet theatrical rim light
      vec3 L_rim = normalize(vec3(0.55, 0.25, -0.85));
      float rim = pow(1.0 - max(dot(N, V), 0.0), 2.8) * 0.35;
      
      // Material-specific surface details
      vec3 surfaceColor = uBase;
      if(uMat > 0.5 && uMat < 1.5){
        // Wood grain banding
        float grain = sin(vWorld.y * 24.0 + sin(vWorld.x * 14.0 + vWorld.z * 12.0) * 1.8) * 0.5 + 0.5;
        surfaceColor = mix(uBase * 0.9, uBase * 1.12, grain * 0.35);
      }
      
      float spec = pow(max(dot(N, H_key), 0.0), uMat > 1.5 ? 45.0 : 18.0) * (uMat > 1.5 ? 0.65 : 0.28);
      
      vec3 ambient = surfaceColor * 0.38;
      vec3 keyLight = surfaceColor * diff_key * vec3(1.05, 0.98, 0.88);
      vec3 footLight = surfaceColor * diff_up * vec3(1.0, 0.65, 0.3);
      vec3 rimLight = vec3(0.7, 0.45, 0.85) * rim;
      
      vec3 c = ambient + keyLight + footLight + rimLight + vec3(spec) + surfaceColor * uGlow * 1.4;
      c = c / (c + vec3(0.65));
      gl_FragColor = vec4(pow(c, vec3(0.92)), uAlpha);
    }
  `;

  function shader(type,src){
    const s=gl.createShader(type);
    gl.shaderSource(s,src);
    gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));
    return s;
  }

  const prog=gl.createProgram();
  gl.attachShader(prog,shader(gl.VERTEX_SHADER,VS));
  gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,FS));
  gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  const loc={
    aPos:gl.getAttribLocation(prog,'aPos'),
    aNormal:gl.getAttribLocation(prog,'aNormal'),
    model:gl.getUniformLocation(prog,'uModel'),
    vp:gl.getUniformLocation(prog,'uViewProj'),
    base:gl.getUniformLocation(prog,'uBase'),
    camera:gl.getUniformLocation(prog,'uCamera'),
    alpha:gl.getUniformLocation(prog,'uAlpha'),
    glow:gl.getUniformLocation(prog,'uGlow'),
    mat:gl.getUniformLocation(prog,'uMat')
  };

  function mesh(p,n,i){
    const m={count:i.length,p:gl.createBuffer(),n:gl.createBuffer(),i:gl.createBuffer()};
    gl.bindBuffer(gl.ARRAY_BUFFER,m.p);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(p),gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,m.n);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(n),gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.i);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(i),gl.STATIC_DRAW);
    return m;
  }

  function sphere(lat=14,lon=18){
    const p=[],n=[],i=[];
    for(let y=0;y<=lat;y++)for(let x=0;x<=lon;x++){
      const ph=y/lat*Math.PI,th=x/lon*Math.PI*2;
      const v=[Math.cos(th)*Math.sin(ph),Math.cos(ph),Math.sin(th)*Math.sin(ph)];
      p.push(...v);n.push(...v);
    }
    for(let y=0;y<lat;y++)for(let x=0;x<lon;x++){
      const a=y*(lon+1)+x,b=a+lon+1;
      i.push(a,a+1,b,b,a+1,b+1);
    }
    return mesh(p,n,i);
  }

  function quad(p,n,i,a,b,c,d,no){
    const k=p.length/3;
    p.push(...a,...b,...c,...d);
    for(let q=0;q<4;q++)n.push(...no);
    i.push(k,k+1,k+2,k,k+2,k+3);
  }

  function box(){
    const p=[],n=[],i=[];
    quad(p,n,i,[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5],[0,1,0]);
    quad(p,n,i,[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5],[0,-1,0]);
    quad(p,n,i,[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[0,0,1]);
    quad(p,n,i,[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[0,0,-1]);
    quad(p,n,i,[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[1,0,0]);
    quad(p,n,i,[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-1,0,0]);
    return mesh(p,n,i);
  }

  function cylinder(seg=20){
    const p=[],n=[],i=[];
    for(let k=0;k<=seg;k++){
      const a=k/seg*Math.PI*2,x=Math.cos(a),z=Math.sin(a);
      p.push(x,-1,z,x,1,z);
      n.push(x,0,z,x,0,z);
    }
    for(let k=0;k<seg;k++){
      const a=k*2,b=a+2;
      i.push(a,b,a+1,b,b+1,a+1);
    }
    return mesh(p,n,i);
  }

  const meshes={sphere:sphere(),box:box(),cylinder:cylinder()};

  function mul(a,b){
    const o=new Float32Array(16);
    for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
    return o;
  }
  function id(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])}
  function tr(x=0,y=0,z=0){const m=id();m[12]=x;m[13]=y;m[14]=z;return m}
  function sc(x=1,y=x,z=x){const m=id();m[0]=x;m[5]=y;m[10]=z;return m}
  function rz(a){const m=id(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[1]=s;m[4]=-s;m[5]=c;return m}
  function ry(a){const m=id(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m}
  function rx(a){const m=id(),c=Math.cos(a),s=Math.sin(a);m[5]=c;m[6]=s;m[9]=-s;m[10]=c;return m}
  function chain(...m){return m.reduce((a,b)=>mul(a,b),id())}

  function perspective(fov,aspect,near,far){
    const f=1/Math.tan(fov/2),m=new Float32Array(16);
    m[0]=f/aspect;m[5]=f;m[10]=(far+near)/(near-far);m[11]=-1;m[14]=2*far*near/(near-far);
    return m;
  }
  function lookAt(e,t,u=[0,1,0]){
    let z=norm([e[0]-t[0],e[1]-t[1],e[2]-t[2]]),x=norm(cross(u,z)),y=cross(z,x),m=id();
    m[0]=x[0];m[1]=y[0];m[2]=z[0];
    m[4]=x[1];m[5]=y[1];m[6]=z[1];
    m[8]=x[2];m[9]=y[2];m[10]=z[2];
    m[12]=-dot(x,e);m[13]=-dot(y,e);m[14]=-dot(z,e);
    return m;
  }
  function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
  function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
  function norm(a){const l=Math.hypot(...a)||1;return a.map(v=>v/l)}

  function draw(which,model,color,alpha=1,glow=0,mat=1.0){
    const m=meshes[which];
    gl.bindBuffer(gl.ARRAY_BUFFER,m.p);
    gl.vertexAttribPointer(loc.aPos,3,gl.FLOAT,false,0,0);
    gl.enableVertexAttribArray(loc.aPos);
    gl.bindBuffer(gl.ARRAY_BUFFER,m.n);
    gl.vertexAttribPointer(loc.aNormal,3,gl.FLOAT,false,0,0);
    gl.enableVertexAttribArray(loc.aNormal);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.i);
    gl.uniformMatrix4fv(loc.model,false,model);
    gl.uniform3fv(loc.base,color);
    gl.uniform1f(loc.alpha,alpha);
    gl.uniform1f(loc.glow,glow);
    gl.uniform1f(loc.mat,mat);
    gl.drawElements(gl.TRIANGLES,m.count,gl.UNSIGNED_SHORT,0);
  }

  return{gl,canvas,loc,draw,mul,tr,sc,rz,ry,rx,chain,perspective,lookAt};
}

let renderer;
try{renderer=initGL()}catch(e){console.error(e);app.classList.add('no-webgl')}

function drawScene(time,dt){
  // ADR-0046, reduce rather than remove. The nose GROWING is this game's mechanic, the way the fuse
  // was timebomb's: the mockup snapped it to length in a single frame under reduced motion, which
  // answers the accessibility request by deleting the one thing the player came to see. It still
  // travels here, on a gentler approach with no spring overshoot — every other motion in this scene
  // (idle bob, arm swing, feather sway, blink, camera trauma) stays switched off below.
  const noseTarget=.34+visual.targetNose*.125,stiff=reduced?Math.min(1,dt*5):Math.min(1,dt*8.5);
  visual.nose+=(noseTarget-visual.nose)*stiff;
  visual.reactionTime+=dt;
  visual.celebrate=Math.max(0,visual.celebrate-dt);

  const bob=reduced?0:Math.sin(time*1.8)*.035+(visual.reaction==='good'&&visual.reactionTime<.75?Math.sin(visual.reactionTime*16)*.085:0);
  const bad=visual.reaction==='bad'&&visual.reactionTime<.85?Math.sin(visual.reactionTime*36)*(1-visual.reactionTime/.85)*.065:0;
  const jawDrop=visual.reaction==='bad'&&visual.reactionTime<.95?Math.sin(Math.min(1,visual.reactionTime/.4)*Math.PI/2)*.16:0;

  document.documentElement.style.setProperty('--fallback-nose',`${34+visual.targetNose*14}px`);
  if(!renderer)return;

  const {gl,canvas,loc,draw,chain,tr,sc,rz,ry,rx,perspective,lookAt}=renderer;
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
  const w=Math.max(2,Math.round(rect.width*dpr)),h=Math.max(2,Math.round(rect.height*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}

  gl.viewport(0,0,w,h);
  gl.clearColor(0,0,0,0);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(gl.getParameter(gl.CURRENT_PROGRAM));
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  const eye=[0,.15,7.2],vp=renderer.mul(perspective((h>w?49:41)*Math.PI/180,w/h,.1,50),lookAt(eye,[0,.25,0]));
  gl.uniformMatrix4fv(loc.vp,false,vp);
  gl.uniform3fv(loc.camera,eye);

  const root=chain(tr(-.44+bad,bob,0),ry(.42));

  const skin=[.96,.75,.54],hairColor=[.09,.08,.11],white=[.98,.98,.96],shirtY=[.99,.86,.34];
  const HX=-.5,HY=.25; // head center

  // --- BODY: YELLOW SHIRT, BLACK VEST, RED SHORTS ---
  draw('sphere',chain(root,tr(HX,-.62,0),sc(.17,.2,.16)),skin,1,0,1.0);
  draw('sphere',chain(root,tr(HX,-1.08,0),sc(.6,.5,.44)),shirtY,1,0,0.0);
  draw('sphere',chain(root,tr(HX-.34,-1.06,-.08),sc(.38,.48,.42)),[.13,.15,.21],1,0,0.0);
  draw('sphere',chain(root,tr(HX+.34,-1.06,-.08),sc(.38,.48,.42)),[.13,.15,.21],1,0,0.0);
  draw('sphere',chain(root,tr(HX,-1.48,0),sc(.56,.26,.4)),[.85,.2,.22],1,0,0.0);
  draw('sphere',chain(root,tr(HX+.06,-1.32,.42),sc(.055,.055,.04)),[1,.85,.25],1,.3,2.0);

  // Crisp white pointed collar
  draw('sphere',chain(root,tr(HX+.27,-.76,.28),rz(-.4),sc(.26,.05,.2)),white,1,0,0.0);
  draw('sphere',chain(root,tr(HX-.27,-.76,.28),rz(.4),sc(.26,.05,.2)),white,1,0,0.0);

  // Big puffed cyan bow tie
  draw('sphere',chain(root,tr(HX+.26,-.88,.36),rz(-.25),sc(.25,.17,.11)),[.2,.66,.9],1,.1,0.0);
  draw('sphere',chain(root,tr(HX-.26,-.88,.36),rz(.25),sc(.25,.17,.11)),[.2,.66,.9],1,.1,0.0);
  draw('sphere',chain(root,tr(HX,-.88,.42),sc(.12,.11,.1)),[.16,.58,.84],1,.15,0.0);
  draw('sphere',chain(root,tr(HX,-1.04,.38),sc(.15,.14,.08)),[.18,.55,.8],1,.1,0.0);

  // --- JOINTED WOODEN ARMS WITH WHITE GLOVES ---
  const armSwing=reduced?0:Math.sin(time*1.8+.9)*.05;
  // left arm
  draw('sphere',chain(root,tr(HX-.56,-.9,0),sc(.13,.13,.12)),shirtY,1,0,0.0);
  draw('cylinder',chain(root,tr(HX-.66,-1.08,.05),rz(.42+armSwing),sc(.075,.17,.075)),shirtY,1,0,0.0);
  draw('sphere',chain(root,tr(HX-.73,-1.2,.08),sc(.09)),skin,1,0,1.0);
  draw('cylinder',chain(root,tr(HX-.75,-1.32,.1),rz(.1+armSwing),sc(.062,.12,.062)),skin,1,0,1.0);
  draw('sphere',chain(root,tr(HX-.77,-1.44,.12),sc(.13,.14,.12)),white,1,0,0.0);
  // right arm
  draw('sphere',chain(root,tr(HX+.56,-.9,0),sc(.13,.13,.12)),shirtY,1,0,0.0);
  draw('cylinder',chain(root,tr(HX+.66,-1.08,.08),rz(-.42-armSwing),sc(.075,.17,.075)),shirtY,1,0,0.0);
  draw('sphere',chain(root,tr(HX+.73,-1.2,.12),sc(.09)),skin,1,0,1.0);
  draw('cylinder',chain(root,tr(HX+.75,-1.32,.14),rz(-.1-armSwing),sc(.062,.12,.062)),skin,1,0,1.0);
  draw('sphere',chain(root,tr(HX+.77,-1.44,.16),sc(.13,.14,.12)),white,1,0,0.0);

  // --- CARVED WOODEN HEAD (features sit ON the surface) ---
  draw('sphere',chain(root,tr(HX,HY,0),sc(.82,.95,.8)),skin,1,0,1.0);
  draw('sphere',chain(root,tr(HX+.05,-.38,.26),sc(.36,.32,.34)),skin,1,0,1.0);

  // Carved ear (screen-left side)
  draw('sphere',chain(root,tr(HX-.78,.28,.02),sc(.13,.19,.1)),skin,1,0,1.0);
  draw('sphere',chain(root,tr(HX-.84,.28,.08),sc(.07,.11,.06)),[.85,.6,.45],1,0,1.0);

  // Rosy apple cheeks
  draw('sphere',chain(root,tr(HX+.4,HY-.24,.66),sc(.12,.08,.05)),[.95,.52,.48],1,.08,0.0);
  draw('sphere',chain(root,tr(HX-.38,HY-.26,.66),sc(.11,.075,.05)),[.95,.52,.48],1,.08,0.0);

  // --- BIG ROUND BOYISH BLUE EYES (set lower, larger iris) ---
  const blink=!reduced&&Math.sin(time*.72)>0.982?.07:1;
  const eyeWide=visual.reaction==='bad'&&visual.reactionTime<.75?1.3:1.0;
  const eyeSquint=visual.reaction==='good'&&visual.reactionTime<.75?.55:1.0;
  const eyeY=blink*eyeWide*eyeSquint;
  for(const [ex,ez] of [[HX+.3,.66],[HX-.28,.68]]){
    draw('sphere',chain(root,tr(ex,HY+.14,ez),sc(.15,.185*eyeY,.09)),white,1,0,2.0);
    draw('sphere',chain(root,tr(ex+.02,HY+.13,ez+.07),sc(.105,.145*eyeY,.05)),[.22,.56,.9],1,.05,2.0);
    draw('sphere',chain(root,tr(ex+.03,HY+.13,ez+.11),sc(.062,.095*eyeY,.03)),[.05,.05,.06],1,0,2.0);
    draw('sphere',chain(root,tr(ex+.06,HY+.18,ez+.13),sc(.026,.03,.015)),[1,1,1],1,.9,2.0);
  }

  // Thin soft boyish eyebrows, a little above the eyes
  const browAngle=visual.reaction==='bad'?.3:(visual.reaction==='good'?-.15:.04);
  const browLift=visual.reaction==='bad'&&visual.reactionTime<.75?.06:0;
  draw('box',chain(root,tr(HX+.31,HY+.38+browLift,.63),rz(-browAngle),sc(.19,.038,.05)),hairColor,1,0,2.0);
  draw('box',chain(root,tr(HX-.29,HY+.38+browLift,.63),rz(browAngle),sc(.19,.038,.05)),hairColor,1,0,2.0);

  // --- BIG OPEN GRIN WITH TONGUE, UPTURNED CORNERS (widens into shock when wrong) ---
  const my=HY-.46,jd=jawDrop+.09;
  draw('sphere',chain(root,tr(HX+.12,my-jd*.4,.6),sc(.22,.08+jd*.5,.08)),[.45,.1,.13],1,0,0.0);
  draw('sphere',chain(root,tr(HX+.12,my-jd*.55-.04,.64),sc(.13,.05+jd*.15,.06)),[.94,.44,.5],1,.05,0.0);
  draw('sphere',chain(root,tr(HX+.12,my+.08-jd*.06,.63),sc(.24,.08,.1)),skin,1,0,1.0);
  // smile corner ticks
  draw('sphere',chain(root,tr(HX+.33,my+.04,.62),sc(.035,.026,.05)),[.45,.1,.13],1,0,0.0);
  draw('sphere',chain(root,tr(HX-.09,my+.04,.62),sc(.035,.026,.05)),[.45,.1,.13],1,0,0.0);

  // --- GLOSSY BLACK HAIR: SMOOTH SWOOP ACROSS THE FOREHEAD (ref style) ---
  draw('sphere',chain(root,tr(HX-.45,.55,-.25),sc(.45,.5,.5)),hairColor,1,0,2.0);
  draw('sphere',chain(root,tr(HX-.05,.98,.4),rz(-.12),sc(.5,.17,.3)),hairColor,1,0,2.0);
  draw('sphere',chain(root,tr(HX+.34,.84,.5),rz(-.45),sc(.24,.11,.16)),hairColor,1,0,2.0);
  draw('sphere',chain(root,tr(HX-.62,.8,.3),sc(.2,.22,.18)),hairColor,1,0,2.0);

  // --- YELLOW ALPINE HAT (tapered crown) WITH THIN BLUE BAND & FEATHER ---
  draw('sphere',chain(root,tr(HX,1.16,0),rz(.12),sc(1.02,.07,.86)),[.98,.78,.16],1,0,1.0);
  draw('sphere',chain(root,tr(HX-.02,1.24,0),rz(.12),sc(.62,.09,.53)),[.16,.42,.8],1,.1,0.0);
  draw('sphere',chain(root,tr(HX-.05,1.48,0),rz(.12),sc(.55,.32,.48)),[.98,.78,.16],1,0,1.0);
  draw('sphere',chain(root,tr(HX-.08,1.74,0),rz(.12),sc(.32,.18,.28)),[.98,.78,.16],1,0,1.0);
  // Bouncy scarlet feather
  const featherSway=reduced?0:Math.sin(time*2.6)*.1+bob*1.2;
  draw('cylinder',chain(root,tr(HX-.5,1.75+featherSway*.2,-.05),rz(.55+featherSway),sc(.045,.34,.045)),[.9,.16,.16],1,.15,0.0);
  draw('sphere',chain(root,tr(HX-.72,2.02+featherSway*.35,-.05),rz(.55+featherSway),sc(.11,.24,.05)),[.94,.22,.2],1,.15,0.0);
  draw('sphere',chain(root,tr(HX-.85,2.2+featherSway*.45,-.05),sc(.07,.12,.04)),[.98,.6,.2],1,.25,0.0);

  // Marionette strings to head and both gloves
  draw('cylinder',chain(root,tr(HX,4.1,0),sc(.01,2.6,.01)),[.92,.87,.72],.4,.15,0.0);
  draw('cylinder',chain(root,tr(HX-.77,1.3,.12),sc(.008,2.7,.008)),[.92,.87,.72],.32,.15,0.0);
  draw('cylinder',chain(root,tr(HX+.77,1.3,.16),sc(.008,2.7,.008)),[.92,.87,.72],.32,.15,0.0);

  // --- THE COMEDIC NOSE (grows from the face front, out to screen-right) ---
  const nx=HX+.01,ny=HY-.16,nz=.7,noseLen=visual.nose; // centered between the eyes; midway between eyes and mouth
  const NA=.6,ndx=Math.cos(NA),ndz=Math.sin(NA); // local angle; ~horizontal after root ry(.42)
  draw('cylinder',chain(root,tr(nx+ndx*.03,ny,nz+ndz*.03),ry(-NA),rz(-Math.PI/2),sc(.17,.05,.17)),[.88,.64,.46],1,0,1.0);
  draw('cylinder',chain(root,tr(nx+ndx*noseLen/2,ny,nz+ndz*noseLen/2),ry(-NA),rz(-Math.PI/2),sc(.13,noseLen/2,.13)),skin,1,0,1.0);
  // Growth rings
  if(noseLen>.8)draw('cylinder',chain(root,tr(nx+ndx*noseLen*.4,ny,nz+ndz*noseLen*.4),ry(-NA),rz(-Math.PI/2),sc(.145,.025,.145)),[.85,.6,.42],1,0,1.0);
  if(noseLen>1.3)draw('cylinder',chain(root,tr(nx+ndx*noseLen*.72,ny,nz+ndz*noseLen*.72),ry(-NA),rz(-Math.PI/2),sc(.145,.025,.145)),[.85,.6,.42],1,0,1.0);
  // Sprouting leaves at high growth (>=5)
  if(visual.targetNose>=5&&noseLen>.7)
    draw('sphere',chain(root,tr(nx+ndx*noseLen*.55,ny+.15,nz+ndz*noseLen*.55),ry(-NA),rz(.75),sc(.07,.15,.03)),[.3,.8,.35],1,.15,0.0);
  if(visual.targetNose>=8&&noseLen>1.1)
    draw('sphere',chain(root,tr(nx+ndx*noseLen*.82,ny-.13,nz+ndz*noseLen*.82),ry(-NA),rz(-.75),sc(.06,.13,.03)),[.3,.8,.35],1,.15,0.0);
  // Rounded wooden tip
  draw('sphere',chain(root,tr(nx+ndx*noseLen,ny,nz+ndz*noseLen),sc(.17,.16,.16)),[.95,.68,.5],1,.1,1.0);

  // --- STAGE FLOOR & GOLDEN FOOTLIGHTS ---
  // Wooden Stage Apron Planks
  draw('box',chain(tr(-.4,-1.42,-.2),sc(7.5,.18,2.2)),[.28,.1,.14],1,0,1.0);
  draw('box',chain(tr(-.4,-1.31,.65),sc(7.5,.04,.12)),[.48,.22,.15],1,0,1.0);
  // 7 Warm Golden Footlight Domes
  for(let i=0;i<7;i++){
    const fx=-2.7+i*.9;
    draw('sphere',chain(tr(fx,-1.28,.7),sc(.11,.08,.11)),[.25,.18,.12],1,0,0.0);
    draw('sphere',chain(tr(fx,-1.21,.7),sc(.095,.095,.095)),[1,.78,.32],1,.75,2.0);
  }

  // --- PARTICLES & AMBIENT MOTES (ALPHA BLEND PASS) ---
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);

  // Soft puppet shadow on the stage planks
  draw('sphere',chain(tr(-.45,-1.3,.25),sc(1.15,.025,.55)),[.05,.02,.04],.4,0,0.0);

  // Floating ambient stage dust motes
  for(const m of visual.motes){
    const my=m.y+(time*m.vy)%2.8;
    const mx=m.x+Math.sin(time*1.2+m.phase)*.12;
    draw('sphere',chain(tr(mx,my,m.z),sc(m.size)),[1,.9,.6],.35+.15*Math.sin(time*2.5+m.phase),.6,2.0);
  }

  // Active explosion particles
  for(const p of visual.particles){
    const shape=p.type==='wood'?'box':'sphere';
    draw(shape,chain(tr(p.x,p.y,p.z),sc(p.size)),p.color,Math.max(0,p.life/p.max),p.type==='sparkle'?1.0:.15,2.0);
  }

  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

let last=performance.now();
function frame(now){
  const dt=Math.min(.05,(now-last)/1000);
  last=now;

  for(let i=visual.particles.length-1;i>=0;i--){
    const p=visual.particles[i];
    p.life-=dt;
    if(p.life<=0){visual.particles.splice(i,1);continue}
    p.x+=p.vx*dt;
    p.y+=p.vy*dt;
    p.z+=p.vz*dt;
    p.vy-=2.1*dt;
  }

  if(visual.trauma>0){
    visual.trauma=Math.max(0,visual.trauma-dt*2.2);
    const s=visual.trauma*visual.trauma*12;
    stageFrame.style.transform=`translate(${(fxRng.next()-.5)*s}px,${(fxRng.next()-.5)*s}px)`;
  }else{
    stageFrame.style.transform='';
  }

  drawScene(now/1000,dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// The mockup's in-page self-test runner was removed on lift: it ran on every page load, and its
// assertions now live in src/games/pinocchio-luck.test.mjs, against the same exported functions.

setupNames=Array(setupCount).fill('');
renderSetup();
})();
