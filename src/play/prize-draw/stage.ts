// The projector screen of a prize-draw event (gh#304): reads the event the setup page stored, shows the
// step it is at, and walks it forward on the MC's taps. Admin mode only in this ticket, so there is no
// round code on screen and no phone; QR mode (gh#308, gh#309) adds both on top of the same walk.
//
// The walk is src/prize-event/event.ts's, never re-implemented here. This file owns four things:
//   1. When to draw. A ready step draws on the MC's tap through drawAndSave, which STORES the draw
//      before handing it back; only then is it revealed. A refresh lands on the stored step and shows
//      the stored draw: nothing on the resume path can draw (gh#304: never draws again).
//   2. Every reveal of a control goes through show(), which arms the region it shows (ADR-0017, and
//      ADR-0057: closing the notice is a reveal too, because it uncovers the MC's button). The route's
//      arm-reveal-paths test enumerates show()'s callers, which is a set this file owns.
//   3. What a storage failure looks like: the notice, and the step stays ready.
//   4. Two screens on one stored event (two tabs, a duplicated projector tab). Each round is drawn at most
//      once across all of them, and a screen that is behind never writes. The stored text is the event's
//      version (event.ts readEvent): `seen` is the text this screen last read or wrote, and it changes in
//      exactly two places, save() and adopt(), each followed by a render. Every press runs inside
//      event.ts withEventLock, the exclusive Web Lock every writer of the key takes (the setup page too),
//      and acts only when the control pressed was rendered at the current `seen` AND storage still holds
//      `seen`. Otherwise the press is dropped, and if storage moved this screen takes the stored state up.
//      A press queued at the lock while a storage event re-rendered the screen is therefore dropped, never
//      replayed on the new step. A storage event from another tab makes this screen follow at once, and
//      every take-up re-renders through render(), which arms, even when the stored state reads the same.
//      No Web Locks (an insecure context, an old browser) means no event: the screen shows the cold
//      message and never writes. A refused lock request drops that one press and leaves the button live.
//
// No anchor element anywhere under src/play/prize-draw/ (ADR-0014, ADR-0055): the way out is the page
// chrome's exit control, outside this directory.

import { armAllButtons } from '../../games/_arm-gate.ts';
import {
  STORAGE_KEY,
  advance,
  cryptoRng,
  drawAndSave,
  encodeEvent,
  position,
  readEvent,
  revealDrawn,
  withEventLock,
  type EventState,
  type EventTx,
  type Rng,
} from '../../prize-event/event.ts';
import { screenView } from '../../prize-event/view.ts';
import { announce, fitFrame, renderScreen } from '../_prize-reveal/reveal.ts';
import { fitAll } from '../_prize-reveal/names-dom.ts';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export type StageDeps = {
  doc: Document;
  /** The route's root (markup.html #app) and its empty live region (#pd-live). */
  root: HTMLElement;
  live: HTMLElement;
  /** null when the browser refuses storage outright: the screen then has no event to show. */
  storage: Store | null;
  rng?: Rng;
  /** Whether the room asked for reduced motion: the reveal then fades to its end state (ADR-0046). */
  reducedMotion: boolean;
  /** Runs a callback on the next frame (the reveal's wave starts there); absent in tests. */
  nextFrame?: (cb: () => void) => void;
  /** Runs a callback once the bold name face has loaded: a reveal is the first screen that sets names in
   *  bold, so names fitted before that face arrived were measured in a fallback; absent in tests. */
  whenBoldLoaded?: (cb: () => void) => void;
  /** The browser's Web Locks manager, shared by every tab of this origin. Null or absent where there is none,
   *  and then the screen has no event: no writer may run without the lock (event.ts withEventLock). */
  locks?: Pick<LockManager, 'request'> | null;
  /** Subscribes to changes another tab made to storage (the window's storage event): the key that changed,
   *  null when storage was cleared. Absent in tests that have one screen. */
  onStorage?: (changed: (key: string | null) => void) => void;
};

type Read = { raw: string | null; state: EventState | null };

// Copy with no board source yet (listed for the owner in the gh#304 evidence README).
const COPY = {
  reveal: 'เปิดผล',
  next: 'รอบต่อไป',
  cold: 'ยังไม่มีงานบนจอนี้ ตั้งค่างานแล้วกด เริ่มงาน',
  saveFailed: 'บันทึกผลไม่ได้ จึงยังไม่เปิดผล ลองกด เปิดผล อีกครั้ง',
  ok: 'ตกลง',
};

export type StageHandle = {
  current(): EventState | null;
  refit(): void;
  /** Read-only, for tests: the stored text this screen holds, and the one its mounted control was rendered
   *  at (null without a control). Equal after every render; a press acts only while they are. */
  version(): { seen: string | null; token: string | null };
};

export function mountStage(deps: StageDeps): StageHandle {
  const { doc, root, live } = deps;
  const locks = deps.locks ?? null;
  // Fail closed: without Web Locks this screen could only write unlocked, so it reads nothing either and
  // shows the cold screen, the same as a browser that refuses storage.
  const storage = locks ? deps.storage : null;
  const rng = deps.rng ?? cryptoRng();
  const read = (): Read => (storage ? readEvent(storage) : { raw: null, state: null });
  const first = read();
  let state: EventState | null = first.state;
  /** The stored text this screen last read or wrote: its version of the event. */
  let seen: string | null = first.raw;

  const viewport = doc.createElement('div');
  viewport.className = 'pd-viewport';
  // The 1920x1080 board frame, scaled as a whole to the screen. Controls stay OUT of it, in the MC bar
  // below and the notice, at real pixels: a scaled control would shrink under the tap floor on any screen
  // smaller than the projector.
  const scaled = doc.createElement('div');
  scaled.className = 'pd-scaled';
  const frame = doc.createElement('div');
  frame.className = 'pd-frame';
  frame.id = 'pd-frame';
  scaled.appendChild(frame);
  const mc = doc.createElement('div');
  mc.className = 'pd-mc';
  viewport.append(scaled, mc);

  const notice = doc.createElement('div');
  notice.className = 'pd-notice';
  notice.setAttribute('role', 'alertdialog');
  notice.setAttribute('aria-modal', 'true');
  notice.setAttribute('aria-labelledby', 'pd-notice-text');
  notice.hidden = true;
  const card = doc.createElement('div');
  card.className = 'pd-notice-card';
  const noticeText = doc.createElement('p');
  noticeText.id = 'pd-notice-text';
  noticeText.textContent = COPY.saveFailed;
  const close = doc.createElement('button');
  close.type = 'button';
  close.className = 'pd-go';
  close.textContent = COPY.ok;
  card.append(noticeText, close);
  notice.appendChild(card);
  root.replaceChildren(viewport, notice);

  /** The one way a control becomes visible on this screen: un-hide the region, then arm it. */
  const show = (region: HTMLElement): void => {
    region.hidden = false;
    armAllButtons(region);
  };

  /** Write inside the lock; on success the written text becomes this screen's version. */
  const save = (tx: EventTx, next: EventState): boolean => {
    if (!tx.write(next)) return false;
    seen = encodeEvent(next);
    return true;
  };

  const key = (s: EventState): string => JSON.stringify(position(s));

  /** The `seen` the mounted control was rendered at; null while no control is mounted. */
  let mounted: string | null = null;

  /** The MC's button for the step `s` is at. A press only acts on the step, and the stored text, it was
   *  rendered at: a failed reveal-save moves the step on screen ahead of `seen`, so both are checked. */
  const control = (s: EventState): HTMLElement | null => {
    const pos = position(s);
    if (pos.kind === 'final' && pos.at === 'revealed') return null;
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'pd-go';
    button.textContent = pos.at === 'revealed' ? COPY.next : COPY.reveal;
    const builtFor = key(s);
    const token = seen;
    button.addEventListener('click', () => {
      if (token !== seen || !state || key(state) !== builtFor) return;
      request(token, builtFor);
    });
    return button;
  };

  const render = (wave: boolean): void => {
    if (!state) {
      const message = doc.createElement('p');
      message.className = 'pd-cold';
      message.textContent = COPY.cold;
      frame.replaceChildren(message);
      frame.setAttribute('data-screen', 'cold');
      mc.replaceChildren();
      mounted = null;
      live.textContent = COPY.cold;
      show(viewport);
      return;
    }
    const view = screenView(state);
    renderScreen(frame, view, doc);
    const button = control(state);
    if (button) mc.replaceChildren(button);
    else mc.replaceChildren();
    mounted = button ? seen : null;
    announce(live, view, doc);
    const field = frame.querySelector<HTMLElement>('.pd-field');
    if (field && view.kind === 'reveal') {
      if (deps.reducedMotion) field.classList.add('pd-fade');
      else if (wave && deps.nextFrame) {
        // Rendered with its end state so names were fitted bold; the wave runs from unmarked to marked.
        field.classList.remove('pd-marked');
        deps.nextFrame(() => field.classList.add('pd-marked'));
      }
    }
    if (view.kind === 'reveal') deps.whenBoldLoaded?.(() => fitAll(frame));
    show(viewport);
  };

  const press = (tx: EventTx, s: EventState): void => {
    const pos = position(s);
    if (pos.at === 'ready') {
      const drawn = drawAndSave(s, rng, (next) => save(tx, next));
      if (!drawn.ok) {
        show(notice);
        return;
      }
      // Drawn and stored: the reveal itself is a second write. If that one fails, a refresh lands on the
      // stored draw and reveals it again, which shows the same result.
      state = revealDrawn(drawn.state);
      save(tx, state);
      render(true);
    } else if (pos.at === 'drawn') {
      state = revealDrawn(s);
      save(tx, state);
      render(true);
    } else {
      state = advance(s);
      save(tx, state);
      render(false);
    }
  };

  /** Take up what is stored. Always re-renders, so the mounted control is rebuilt at the new `seen`: a
   *  control left at the old text would drop every later press. The wave runs only when the state moved. */
  const adopt = (now: Read): void => {
    const moved = now.state && state ? encodeEvent(now.state) !== encodeEvent(state) : now.state !== state;
    seen = now.raw;
    state = now.state;
    render(moved);
  };

  /** One press, inside the lock: act only if the control was rendered at `seen` and storage still holds it. */
  const step = (tx: EventTx, token: string | null, builtFor: string): void => {
    const now = tx.read();
    if (now.raw !== seen) {
      adopt(now);
      return;
    }
    if (token !== seen || !state || key(state) !== builtFor) return;
    press(tx, state);
  };

  // A press waiting on the lock: further taps on this screen are dropped until it has run or been refused.
  let busy = false;
  const request = (token: string | null, builtFor: string): void => {
    if (busy) return;
    busy = true;
    void withEventLock(locks, storage, (tx) => {
      try {
        step(tx, token, builtFor);
      } finally {
        busy = false;
      }
    }).then((ran) => {
      // Refused (the browser would not grant the lock): nothing ran or was written; the next tap asks again.
      if (!ran) busy = false;
    });
  };

  deps.onStorage?.((changed) => {
    if (!storage || (changed !== null && changed !== STORAGE_KEY)) return;
    const now = read();
    if (now.raw !== seen) adopt(now);
  });

  close.addEventListener('click', () => {
    notice.hidden = true;
    // Closing the notice uncovers the MC's button: a reveal (ADR-0057), armed like any other.
    show(viewport);
  });

  if (deps.doc.defaultView) {
    const win = deps.doc.defaultView;
    const refit = (): void => fitFrame(scaled, viewport);
    win.addEventListener('resize', refit);
    deps.nextFrame?.(refit);
  }

  render(false);
  return { current: () => state, refit: () => fitAll(frame), version: () => ({ seen, token: mounted }) };
}
