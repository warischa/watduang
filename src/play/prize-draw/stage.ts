// The projector screen of a prize-draw event (gh#304): reads the event the setup page stored, shows the
// step it is at, and walks it forward on the MC's taps. Admin mode only in this ticket, so there is no
// round code on screen and no phone; QR mode (gh#308, gh#309) adds both on top of the same walk.
//
// The walk is src/prize-event/event.ts's, never re-implemented here. This file owns four things:
//   1. When to draw. A ready step draws on the MC's tap through drawAndSave, which hands the draw back only
//      once the store has COMMITTED it, already revealed, in one transaction; only then is it shown. A
//      refresh lands on the stored step and shows the stored draw: nothing on the resume path can draw
//      (gh#304: never draws again). A failed or aborted transaction shows nothing of the draw.
//   2. Every reveal of a control goes through show(), which arms the region it shows (ADR-0017, and
//      ADR-0057: closing the notice is a reveal too, because it uncovers the MC's button). The route's
//      arm-reveal-paths test enumerates show()'s callers, which is a set this file owns.
//   3. What a storage failure looks like: the notice, and the step stays where the store has it.
//   4. Two screens on one stored event (two tabs, a duplicated projector tab). Each round is drawn at most
//      once across all of them, and a screen that is behind never writes. The stored text is the event's
//      version (store.ts): `seen` is the text this screen last read or wrote, and it changes in exactly two
//      places, save() and adopt(), each followed by a render. A press acts only when the control pressed
//      was rendered at the current `seen`, and its write is a compare-and-set on `seen` (store.ts put): when
//      the store holds anything else, nothing is written and this screen takes the stored state up instead.
//      A press whose write is still in flight when this screen takes up a newer state is dropped on return,
//      never applied over it. Another tab's commit (store.ts subscribe) makes this screen load and follow,
//      and every take-up re-renders through render(), which arms, even when the stored state reads the same.
//      A refused browser (store.ts: no usable IndexedDB) has no event: the screen says why, never writes.
//
// No anchor element anywhere under src/play/prize-draw/ (ADR-0014, ADR-0055): the way out is the page
// chrome's exit control, outside this directory.

import { armAllButtons } from '../../games/_arm-gate.ts';
import {
  advance,
  cryptoRng,
  drawAndSave,
  encodeEvent,
  position,
  revealDrawn,
  type EventState,
  type Rng,
} from '../../prize-event/event.ts';
import { OLD_TAB_OPEN, REFUSED_BROWSER, type EventStore, type Loss, type PutResult, type Snapshot } from '../../prize-event/store.ts';
import { screenView } from '../../prize-event/view.ts';
import { announce, fitFrame, renderScreen } from '../_prize-reveal/reveal.ts';
import { fitAll } from '../_prize-reveal/names-dom.ts';

export type StageDeps = {
  doc: Document;
  /** The route's root (markup.html #app) and its empty live region (#pd-live). */
  root: HTMLElement;
  live: HTMLElement;
  /** The event store, opening (store.ts openEventStore). Resolves null in a refused browser: the screen then
   *  has no event and shows REFUSED_BROWSER. */
  store: Promise<EventStore | null>;
  rng?: Rng;
  /** Whether the room asked for reduced motion: the reveal then fades to its end state (ADR-0046). */
  reducedMotion: boolean;
  /** Runs a callback on the next frame (the reveal's wave starts there); absent in tests. */
  nextFrame?: (cb: () => void) => void;
  /** Reloads the page (location.reload). Called once, when a newer version of this code takes the database
   *  over (store.ts onSuperseded, 'superseded'): the event is stored, so the reload resumes it on the newer
   *  code. A reloaded page that still cannot open the store shows REFUSED_BROWSER and never reloads, since
   *  only an opened store can be superseded. Absent: the screen refuses instead. A revoked store never
   *  reloads: the screen says OLD_TAB_OPEN. */
  reload?: () => void;
  /** Runs a callback once the bold name face has loaded: a reveal is the first screen that sets names in
   *  bold, so names fitted before that face arrived were measured in a fallback; absent in tests. */
  whenBoldLoaded?: (cb: () => void) => void;
};

// Copy with no board source yet (listed for the owner in the gh#304 evidence README).
const COPY = {
  reveal: 'เปิดผล',
  next: 'รอบต่อไป',
  cold: 'ยังไม่มีงานบนจอนี้ ตั้งค่างานแล้วกด เริ่มงาน',
  saveFailed: 'บันทึกผลไม่ได้ จึงยังไม่เปิดผล ลองกด เปิดผล อีกครั้ง',
  // Owner-approved (gh#313): the step forward did not store.
  nextFailed: 'บันทึกไม่ได้ จึงยังไม่ไปรอบต่อไป ลองกด รอบต่อไป อีกครั้ง',
  ok: 'ตกลง',
};

export type StageHandle = {
  current(): EventState | null;
  refit(): void;
  /** Read-only, for tests: the stored text this screen holds, the one its mounted control was rendered at
   *  (null without a control), and whether a press is waiting on its write. Equal after every render; a
   *  press acts only while they are. */
  version(): { seen: string | null; token: string | null; busy: boolean };
  /** Settles once the store has opened and the first state is on screen. */
  ready: Promise<void>;
};

export function mountStage(deps: StageDeps): StageHandle {
  const { doc, root, live } = deps;
  const rng = deps.rng ?? cryptoRng();
  /** Null until the store has opened and been read, and for good once it stopped or was refused. */
  let store: EventStore | null = null;
  /** Why this screen holds no event for good: refused browser, revoked store, or a reload under way. */
  let ending: 'refused' | 'revoked' | 'reloading' | null = null;
  /** Counts terminal stops. Every continuation after an await checks it, with the store it started on, and
   *  renders nothing once the store it started on has stopped. */
  let generation = 0;
  let unsubscribe: (() => void) | null = null;
  let reloaded = false;
  let state: EventState | null = null;
  /** The stored text this screen last read or wrote: its version of the event. */
  let seen: string | null = null;
  /** Counts save() and adopt(): a load that started before one of them is older than what is on screen. */
  let epoch = 0;

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

  /** A committed write: its text becomes this screen's version. The caller renders. */
  const save = (raw: string, next: EventState): void => {
    seen = raw;
    state = next;
    epoch++;
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
      // No event: none is stored, this browser cannot hold one (store.ts, refused browsers), an old tab holds
      // another one (revoked), or the page is reloading onto a newer version (blank, no copy).
      const text =
        ending === 'refused' ? REFUSED_BROWSER : ending === 'revoked' ? OLD_TAB_OPEN : ending === 'reloading' ? '' : COPY.cold;
      const message = doc.createElement('p');
      message.className = 'pd-cold';
      message.textContent = text;
      frame.replaceChildren(message);
      frame.setAttribute('data-screen', ending ?? 'cold');
      mc.replaceChildren();
      mounted = null;
      live.textContent = text;
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

  /** Take up what is stored. Always re-renders, so the mounted control is rebuilt at the new `seen`: a
   *  control left at the old text would drop every later press. The wave runs only when the state moved. */
  const adopt = (now: Snapshot, wave = true): void => {
    const moved = now.state && state ? encodeEvent(now.state) !== encodeEvent(state) : now.state !== state;
    seen = now.raw;
    state = now.state;
    epoch++;
    render(wave && moved);
  };

  /**
   * One press on the step `s`, rendered at the stored text `token`. Every write is a compare-and-set on
   * `token`, and the screen changes only once the store has answered. A draw is committed together with its
   * reveal, so what the room sees is exactly what is stored.
   */
  const press = async (db: EventStore, token: string | null, s: EventState): Promise<void> => {
    const g = generation;
    const pos = position(s);
    let result: PutResult | null = null;
    const put = async (next: EventState): Promise<boolean> => {
      result = await db.put(token, next);
      return result.ok;
    };
    let next: EventState;
    if (pos.at === 'ready') {
      const drawn = await drawAndSave(s, rng, (d) => put(revealDrawn(d)));
      next = drawn.ok ? revealDrawn(drawn.state) : s;
    } else if (pos.at === 'drawn') {
      next = revealDrawn(s);
      await put(next);
    } else {
      next = advance(s);
      await put(next);
    }
    const r = result as PutResult | null;
    // The store stopped while the write ran (the stop already rendered), or this screen took up a newer
    // stored state meanwhile (that state stands).
    if (g !== generation || store !== db || seen !== token || !r) return;
    if (r.ok) {
      save(r.raw, next);
      render(pos.at !== 'revealed');
    } else if (r.reason === 'stale') adopt(r.now);
    // Not stored: the screen stays on the step the store holds, a step forward included, so a reload never
    // lands behind what the room saw. The notice names the step that failed.
    else {
      noticeText.textContent = pos.at === 'revealed' ? COPY.nextFailed : COPY.saveFailed;
      show(notice);
    }
  };

  // A press waiting on its write: further taps on this screen are dropped until it has answered.
  let busy = false;
  const request = (token: string | null, builtFor: string): void => {
    if (busy || !store || !state || key(state) !== builtFor) return;
    busy = true;
    void press(store, token, state).then(
      () => (busy = false),
      () => (busy = false),
    );
  };

  /** Another tab committed: load, and take the stored state up if it moved. When this screen applied a
   *  write while the load ran, the answer may be older or newer than what is on screen and cannot be told
   *  apart, so it is not used: the screen loads again rather than drop the notice. */
  const follow = async (db: EventStore): Promise<void> => {
    for (;;) {
      const g = generation;
      const at = epoch;
      const now = await db.load();
      if (g !== generation || store !== db || !now) return;
      if (at === epoch) {
        if (now.raw !== seen) adopt(now);
        return;
      }
    }
  };

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

  /** The store stopped for good (store.ts onSuperseded): nothing on this screen may reach it again. The
   *  event, its version and the controls go; the screen reloads onto a newer version once, or says why. */
  const end = (why: Loss): void => {
    generation++;
    store = null;
    unsubscribe?.();
    unsubscribe = null;
    notice.hidden = true;
    const reload = why === 'superseded' && deps.reload && !reloaded ? deps.reload : null;
    ending = why === 'revoked' ? 'revoked' : reload ? 'reloading' : 'refused';
    adopt({ raw: null, state: null }, false);
    if (reload) {
      reloaded = true;
      reload();
    }
  };

  const ready = deps.store
    .then(async (opened) => {
      if (!opened) {
        // Fail closed: nothing can be read, so nothing is shown or written, and the screen says why.
        ending = 'refused';
        render(false);
        return;
      }
      const g = generation;
      // Set before the first load: a store that stopped already (during its move) says so at once.
      opened.onSuperseded(end);
      if (g !== generation) return;
      const first = await opened.load();
      if (g !== generation) return;
      if (!first) {
        ending = 'refused';
        render(false);
        return;
      }
      store = opened;
      adopt(first, false);
      unsubscribe = opened.subscribe(() => void follow(opened));
    })
    .catch(() => {
      ending = 'refused';
      render(false);
    });
  return {
    current: () => state,
    refit: () => fitAll(frame),
    version: () => ({ seen, token: mounted, busy }),
    ready,
  };
}
