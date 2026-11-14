// The projector screen of a prize-draw event (gh#304): reads the event the setup page stored, shows the
// step it is at, and walks it forward on the MC's taps. Admin mode has no round code on screen and no
// phone; QR mode (gh#308, gh#309) adds the join lobby and the round codes on top of the same walk.
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
//   5. The 3D reveal (gh#305). Once a step is COMMITTED, and only then, the step's game plays it through the
//      shared host (game-host.ts): a round's reveal, a card round's stored deal (face down, no rule yet) and
//      then its drawn rule, and the final. The host is handed committed facts only. While it presents, the
//      MC bar is empty, so nothing can step the event on; its first exit (settled, fallback, disposed) draws
//      the 2D view, which brings the MC's button back through render(), armed. Nothing on the resume or
//      take-up path mounts it: a refresh and a follower show the settled 2D view. Taking up another stored
//      state disposes the reveal on screen first, and a sequence number drops whatever that reveal calls
//      back afterwards.
//   6. The ladder final's lane picks (gh#305 item 2, owner pick B). The MC's step into the final stores the
//      slot layout with it (event.ts advance), so the prize slots are on screen while the finalists pick
//      (lanes.ts draws the frame). The MC taps a lane, then a name, in any order; a filled lane empties on a
//      tap. Each assignment is a write like every other (event.ts pickLane, a compare-and-set on `seen`), so
//      a reload comes back to the picks, another tab follows them, and a tab that is behind loses its pick and
//      takes the stored one up. Only which lane the next name lands on is this screen's own. The draw press
//      locks the stored picks.
//   7. The QR lobby (gh#308). While the setup page's lobby record is there (qr-event.ts), the screen shows
//      the join QR, the PIN and the joined count instead of any stored step, with no MC control; the start
//      stores the new event and drops the record, and the screen walks that event. The QR module is loaded
//      with import() and only for a lobby, so an admin-mode event never fetches lean-qr (ADR-0077).
//   8. The round code (gh#309, QR mode). A step with a code (a cut round's reveal, a card round's deal, the
//      final's result) draws the code card over its frame (reveal.ts, proj-code B), and the MC's only control
//      is the close: closing it is a reveal like the notice's (ADR-0057) and goes through render(), armed, and
//      the step's own button comes back. Which step's card was closed is this screen's own, never stored: a
//      reload or another tab shows the code again.
//
// Where the controls sit (gh#314 1a B): the MC's button at the play band's right end, off the projected
// frame; the notice's veil does not reach it there, so it is held disabled while the notice is open and
// rebuilt, armed, on the close path.
//
// No anchor element anywhere under src/play/prize-draw/ (ADR-0014, ADR-0055): the way out is the page
// chrome's exit control, outside this directory.

import { armAllButtons } from '../../games/_arm-gate.ts';
import {
  advance,
  cryptoRng,
  drawAndSave,
  encodeEvent,
  liveIds,
  pickLane,
  position,
  prepareCards,
  revealDrawn,
  type EventState,
  type Person,
  type Position,
  type Rng,
} from '../../prize-event/event.ts';
import { FINAL_SIZE } from '../../prize-draw/schedule.ts';
import { OLD_TAB_OPEN, REFUSED_BROWSER, type EventStore, type Loss, type PutResult, type Snapshot } from '../../prize-event/store.ts';
import { screenView, type ScreenView } from '../../prize-event/view.ts';
import { announce, fitFrame, renderScreen } from '../_prize-reveal/reveal.ts';
import { laneX, renderLanes } from './lanes.ts';
import { fitAll, writeName } from '../_prize-reveal/names-dom.ts';
import { startReveal, type HostOptions, type RevealHost } from '../_prize-reveal/game-host.ts';
import type { CommittedOutcome, GameId } from '../_prize-reveal/game-contract.ts';
import { joinLink, type Lobby } from '../../prize-event/qr-event.ts';

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
  /** Starts a committed step's 3D reveal (game-host.ts startReveal, on the browser by default). Tests pass
   *  a recording stand-in, or the real host over a fake page. */
  startReveal?: (options: HostOptions<GameId>) => RevealHost;
  /** The QR-mode lobby the setup page writes (qr-event.ts LOBBY_KEY), read on every render and followed on
   *  every change. Absent: no lobby, ever. */
  lobby?: LobbySource;
  /** Loads the QR module; import() of lobby-qr.ts by default, called only while a lobby is on screen. */
  loadQr?: () => Promise<QrModule>;
  /** The origin the join link names (location.origin). */
  joinOrigin?: string;
};

/** Where the lobby comes from: main.ts reads localStorage and follows its storage event. */
export type LobbySource = { read(): Lobby | null; subscribe(onChange: () => void): () => void };
type QrModule = { drawJoinQr(canvas: HTMLCanvasElement, text: string): void };

/** The waits before each new ask for a QR module that failed to load, doubling: about a minute in all. */
const QR_RETRY_MS = [1000, 2000, 4000, 8000, 16000, 32000];

// Copy with no board source yet (listed for the owner in the gh#304 evidence README).
const COPY = {
  reveal: 'เปิดผล',
  next: 'รอบต่อไป',
  cold: 'ยังไม่มีงานบนจอนี้ ตั้งค่างานแล้วกด เริ่มงาน',
  saveFailed: 'บันทึกผลไม่ได้ จึงยังไม่เปิดผล ลองกด เปิดผล อีกครั้ง',
  // Owner-approved (gh#313): the step forward did not store.
  nextFailed: 'บันทึกไม่ได้ จึงยังไม่ไปรอบต่อไป ลองกด รอบต่อไป อีกครั้ง',
  ok: 'ตกลง',
  // Owner-approved (gh#305 item 3 B): a card round's first press deals; the reveal label then draws the rule.
  deal: 'แจกไพ่',
  // Owner-approved (gh#305 item 2): the ladder final's hud line while the finalists pick lanes.
  lanePick: 'ให้ผู้เข้ารอบชิงเลือกเส้น แตะเส้นแล้วแตะชื่อ',
  // An empty lane's label: its number, as the picked frame draws it (design/Gh305GamePick.dc.html i2-lanes).
  lane: (lane: number): string => String(lane),
  // The QR lobby, board copy verbatim (design/Gh302Projector.dc.html, proj-lobby B, COPY APPROVED).
  scan: 'สแกนเพื่อเข้าร่วม',
  oneName: 'ใช้ชื่อเล่นหรือชื่อเรียก 1 เครื่อง 1 ชื่อ',
  pin: 'PIN',
  joined: (n: number): string => `เข้าร่วมแล้ว ${n} คน`,
};

/** The screens with a name field: under 640px they take the phone layout, names in two columns (gh#314
 *  item 5 B). The lane picks and the result take their own phone layouts (markField); the cold screen keeps
 *  the scaled frame. */
const FIELD_SCREENS = new Set(['round', 'reveal', 'final']);

/**
 * A layout that sets its names at another size may also give them another floor, as `--fit-floor` in its
 * stylesheet (the result's phone layout, design/Gh305AuditFrames.dc.html frame 2). The fit rule reads its
 * floor from the box (names-dom.ts fitName), so each box under `root` takes the floor its layout asks for, or
 * goes back to its surface's own floor when the layout asks none. Run before a fit. Needs computed styles, so
 * it does nothing outside a browser.
 */
export function layoutFloors(root: ParentNode): void {
  if (typeof getComputedStyle !== 'function') return;
  root.querySelectorAll<HTMLElement>('[data-fit-floor]').forEach((box) => {
    const own = box.getAttribute('data-fit-own') ?? box.getAttribute('data-fit-floor')!;
    box.setAttribute('data-fit-own', own);
    const asked = parseFloat(getComputedStyle(box).getPropertyValue('--fit-floor'));
    box.setAttribute('data-fit-floor', Number.isFinite(asked) ? String(asked) : own);
  });
}

/** A committed outcome some 3D game plays (a step with no game reveals in 2D and never reaches the host). */
type Presented = CommittedOutcome & { game: GameId };

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
  // The 3D layer: the host fills it over the frame while a committed step presents, and empties it on exit.
  const layer3d = doc.createElement('div');
  layer3d.className = 'pd-3d';
  // The ladder final's lane picks: real pixels like the MC bar, empty on every other screen.
  const picks = doc.createElement('div');
  picks.className = 'pd-picks';
  viewport.append(scaled, layer3d, picks, mc);

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

  // A stored deal leaves the position as it was, so the key carries it too: a control built before the deal
  // must not act on the dealt step.
  const key = (s: EventState): string => JSON.stringify([position(s), s.prepared?.game === 'cards' ? s.prepared.code : null]);

  /** A ready card round with no stored deal: its press deals, it draws nothing. */
  const dealsFirst = (s: EventState): boolean => {
    const pos = position(s);
    return pos.kind === 'round' && pos.at === 'ready' && s.setup.games.rounds[pos.round - 1] === 'cards' && !s.prepared;
  };
  /** The stored slot layout of a ready ladder final, or null on any other step. */
  const slotsOf = (s: EventState): readonly number[] | null => (s.prepared?.game === 'ladder' ? s.prepared.slotRanks : null);
  /** A ready ladder final with its slot layout stored: its press locks the lane picks and draws. */
  const picksLanes = (s: EventState): boolean => {
    const pos = position(s);
    return pos.kind === 'final' && pos.at === 'ready' && s.setup.games.final === 'ladder' && slotsOf(s) !== null;
  };

  /** The stored lane picks of a ready ladder final (`picks[lane]`, a finalist id or null); empty elsewhere. */
  const picksOf = (s: EventState): readonly (string | null)[] =>
    s.prepared?.game === 'ladder' ? s.prepared.picks : Array.from({ length: FINAL_SIZE }, () => null);
  /** The stored picks once all five lanes hold a different finalist, else null. */
  const lockedPicks = (s: EventState): string[] | null => {
    const at = picksOf(s);
    return at.every((id) => id !== null) && new Set(at).size === FINAL_SIZE ? (at as string[]) : null;
  };
  /** The lane the next name lands on: this screen's own, never stored. `nextOf` is the event it belongs to. */
  let nextLane: number | null = 0;
  let nextOf: string | null = null;
  /** Another screen, another event, or a lane filled meanwhile (a pick of this tab or another) moves the
   *  next lane to the first empty one. */
  const syncLanes = (s: EventState): void => {
    const at = picksOf(s);
    const empty = at.indexOf(null);
    const first = empty === -1 ? null : empty;
    if (!picksLanes(s) || nextOf !== s.eventKey) nextLane = first;
    else if (nextLane === null || at[nextLane] !== null) nextLane = first;
    nextOf = picksLanes(s) ? s.eventKey : null;
  };

  const people = (s: EventState): Person[] => {
    const byId = new Map(s.setup.people.map((p) => [p.id, p]));
    return liveIds(s).map((id) => byId.get(id)!);
  };

  /** The reveal on screen, if a 3D game is presenting one; `revealSeq` numbers reveals, so a callback from a
   *  reveal that is no longer the current one is dropped. */
  let active: RevealHost | null = null;
  let revealSeq = 0;
  const begin = deps.startReveal ?? ((options: HostOptions<GameId>): RevealHost => startReveal(options));

  /** Dispose the reveal on screen, if any, without letting it draw: the caller renders. */
  const stopReveal = (): void => {
    revealSeq++;
    const host = active;
    active = null;
    host?.dispose();
  };

  /** The `seen` the mounted control was rendered at; null while no control is mounted. */
  let mounted: string | null = null;

  /** The step whose code card the MC closed on this screen (QR mode), as event key and step key. */
  let codeClosed: string | null = null;
  const stepId = (s: EventState): string => `${s.eventKey}|${key(s)}`;
  /** The view of `s` as this screen draws it: without the code card once the MC has closed it. */
  const shownView = (s: EventState): ScreenView => {
    const view = screenView(s);
    if (view.kind === 'final' || !view.code || codeClosed !== stepId(s)) return view;
    const closed = { ...view };
    delete closed.code;
    return closed;
  };
  const codeOpen = (s: EventState): boolean => {
    const view = shownView(s);
    return view.kind !== 'final' && view.code !== undefined;
  };

  /** The MC's button for the step `s` is at. A press only acts on the step, and the stored text, it was
   *  rendered at: a failed reveal-save moves the step on screen ahead of `seen`, so both are checked. */
  const control = (s: EventState): HTMLElement | null => {
    const pos = position(s);
    if (codeOpen(s)) return closeCode(s);
    if (pos.kind === 'final' && pos.at === 'revealed') return null;
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'pd-go';
    button.textContent = pos.at === 'revealed' ? COPY.next : dealsFirst(s) ? COPY.deal : COPY.reveal;
    // The ladder draw waits for five picks, and no press acts while the notice is open (the button sits
    // outside its veil); the arm gate keeps a control disabled by its caller disabled.
    if (picksLanes(s)) button.disabled = lockedPicks(s) === null;
    if (!notice.hidden) button.disabled = true;
    const builtFor = key(s);
    const token = seen;
    button.addEventListener('click', () => {
      if (!notice.hidden || token !== seen || !state || key(state) !== builtFor) return;
      request(token, builtFor);
    });
    return button;
  };

  /** The code card's close: the MC's one control while a code is up. It writes nothing; the render it
   *  makes runs the reveal's wave the card covered and brings the step's own button back, armed. */
  const closeCode = (s: EventState): HTMLElement => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'pd-go';
    button.textContent = COPY.ok;
    if (!notice.hidden) button.disabled = true;
    const builtFor = key(s);
    const token = seen;
    button.addEventListener('click', () => {
      if (!notice.hidden || busy || token !== seen || !state || key(state) !== builtFor) return;
      codeClosed = stepId(state);
      render(true);
    });
    return button;
  };

  /** The lane-pick frame for the picks on screen (lanes.ts), slots from the stored layout. */
  const paintLaneFrame = (s: EventState): void => {
    const view = screenView(s);
    const finalists = people(s);
    renderLanes(
      frame,
      {
        eventName: s.setup.eventName,
        dots: view.kind === 'final' ? view.dots : [],
        prizes: s.setup.prizes,
        slotRanks: slotsOf(s) ?? [],
        names: finalists.map((p) => p.name),
        plates: picksOf(s).map((id) => (id === null ? null : finalists.findIndex((p) => p.id === id))),
        next: nextLane,
        laneLabel: COPY.lane,
        // Broken at its own space so the line ends left of rail 1 at 1920 (owner pick PD-307-03,
        // design/Gh305AuditFrames.dc.html frame 3); the stylesheet keeps each half on one line.
        picking: COPY.lanePick.replace(' ', '\n'),
      },
      doc,
    );
  };

  /**
   * The ladder final's lane picks (design/Gh305GamePick.dc.html i2-lanes B): one control over each lane's
   * plate, then a row of the finalists not yet on a lane (names through the name sink). A tap on an empty
   * lane makes it the one the next name lands on (this screen only); a tap on a filled lane empties it, and a
   * tap on a name places it on the next lane, each as a stored write (request). Every tap repaints the frame
   * and the controls and re-arms the viewport (ADR-0057), a write once it is stored: controls move under the
   * finger, and the fifth pick reveals a live draw button.
   */
  const paintPicks = (s: EventState): void => {
    if (!picksLanes(s)) {
      picks.replaceChildren();
      return;
    }
    const builtFor = key(s);
    const token = seen;
    const finalists = people(s);
    const byId = new Map(finalists.map((p) => [p.id, p]));
    const live = (): boolean => !busy && !active && notice.hidden && token === seen && !!state && key(state) === builtFor;
    const repaint = (): void => {
      if (!state) return;
      paintLaneFrame(state);
      paintControls(state);
      show(viewport);
    };
    const lanes = picksOf(s);
    const laneButtons = lanes.map((id, lane) => {
      const b = doc.createElement('button');
      b.type = 'button';
      // An empty lane is marked: the phone layout draws the control itself as the lane (play.css).
      b.className = id === null ? 'pd-lane empty' : 'pd-lane';
      b.style.setProperty('--lane-x', `${laneX(lane)}px`);
      b.setAttribute('aria-pressed', String(nextLane === lane));
      const label = doc.createElement('span');
      label.textContent = COPY.lane(lane + 1);
      b.appendChild(label);
      const person = id === null ? undefined : byId.get(id);
      if (person) {
        const name = doc.createElement('span');
        writeName(name, person.name);
        b.appendChild(name);
      }
      b.addEventListener('click', () => {
        if (!live() || !state) return;
        nextLane = lane;
        if (id === null) repaint();
        else request(token, builtFor, pickLane(state, lane, null));
      });
      return b;
    });
    const row = doc.createElement('div');
    row.className = 'pd-names';
    for (const person of finalists) {
      if (lanes.includes(person.id)) continue;
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'pd-name';
      const name = doc.createElement('span');
      writeName(name, person.name);
      b.appendChild(name);
      b.addEventListener('click', () => {
        if (!live() || !state || nextLane === null) return;
        request(token, builtFor, pickLane(state, nextLane, person.id));
      });
      row.appendChild(b);
    }
    picks.replaceChildren(...laneButtons, row);
  };

  /** The controls for the step `s` is at: the lane picks (ladder final only) and the MC's button. */
  const paintControls = (s: EventState): void => {
    paintPicks(s);
    const button = control(s);
    if (button) mc.replaceChildren(button);
    else mc.replaceChildren();
    mounted = button ? seen : null;
  };

  /** Mark whether the screen on the frame has a name field, is the ladder's lane picks, or is the final
   *  result: each takes its own phone layout under 640px (play.css). */
  const markField = (): void => {
    const screen = frame.getAttribute('data-screen');
    if (screen !== null && FIELD_SCREENS.has(screen)) viewport.setAttribute('data-field', '');
    else viewport.removeAttribute('data-field');
    if (screen === 'lanes') viewport.setAttribute('data-lanes', '');
    else viewport.removeAttribute('data-lanes');
    if (screen === 'result') viewport.setAttribute('data-result', '');
    else viewport.removeAttribute('data-result');
  };

  /** Fit every name on the frame at the floors its layout asks for (layoutFloors). */
  const fitFrameNames = (): void => {
    layoutFloors(frame);
    fitAll(frame);
  };

  /**
   * Present a committed step through its 3D game. The MC bar and the lane picks empty first, so nothing
   * steps the event on while it plays. The host draws the 2D view once, on its first exit, and render()
   * brings the controls back armed; the 2D wave runs only when no 3D game ran (a fallback before mount).
   */
  const present = (s: EventState, game: GameId, outcome: Presented): void => {
    stopReveal();
    const seq = ++revealSeq;
    mc.replaceChildren();
    picks.replaceChildren();
    mounted = null;
    let ran = false;
    let exited = false;
    const step = outcome.kind === 'final' ? 'final' : `${outcome.kind}${outcome.round}:${outcome.code}`;
    const host = begin({
      container: layer3d,
      game,
      input: { key: `${s.eventKey}:${step}`, eventName: s.setup.eventName, outcome, people: people(s) },
      render2D: () => {
        if (seq !== revealSeq || exited) return;
        exited = true;
        active = null;
        render(!ran);
      },
      onState: (now) => {
        if (seq === revealSeq && now === 'running') ran = true;
      },
    });
    if (seq === revealSeq && !exited) active = host;
  };

  /** What a committed press revealed: the deal it stored, or the round or final it drew. Null for a step
   *  forward, which reveals nothing. */
  const revealed = (before: Position, next: EventState): CommittedOutcome | null => {
    if (before.at === 'revealed') return null;
    if (next.prepared?.game === 'cards' && next.at === 'ready') return { kind: 'deal', ...next.prepared };
    // A stored lane pick leaves the final ready: it reveals nothing, and the lane frame repaints.
    if (next.at === 'ready') return null;
    if (next.final) return { kind: 'final', prizes: next.setup.prizes, ...next.final };
    return { kind: 'round', ...next.rounds[next.rounds.length - 1]! };
  };

  /** After a committed press: only now may a 3D game play what it revealed. A step with no game, and a step
   *  forward, render at once; a presented step renders on the host's first exit (present). */
  const showCommitted = (before: Position, next: EventState): void => {
    const shown = revealed(before, next);
    if (shown && shown.game !== null) present(next, shown.game, shown as Presented);
    else render(before.at !== 'revealed');
  };

  /** The lobby to show, if any: never over a screen that can hold no event (refused, revoked, reloading). */
  const lobbyNow = (): Lobby | null => (ending === null ? (deps.lobby?.read() ?? null) : null);
  /** The lobby on screen: which event it shows, and the texts a count update rewrites in place. */
  let lobbyOn: { key: string; canvas: HTMLCanvasElement; ev: HTMLElement; count: HTMLElement } | null = null;
  const loadQr = deps.loadQr ?? ((): Promise<QrModule> => import('./lobby-qr.ts'));
  /** Set by the first render: a lobby change before it waits for the store, which renders it. */
  let painted = false;

  /**
   * Draw the join QR on `canvas` once the QR module has loaded, then show its card. A load that fails (a
   * dropped chunk) is asked for again after each wait in QR_RETRY_MS, while this canvas is still the lobby's;
   * once they run out the card stays hidden. The PIN alone does not admit a phone (the join page needs the
   * event id the QR carries), so an empty card is never shown as if it were a code; a reload starts again.
   */
  const drawQr = (canvas: HTMLCanvasElement, qrCard: HTMLElement, link: string, attempt = 0): void => {
    void loadQr()
      .then(
        (qr) => {
          if (lobbyOn?.canvas !== canvas) return;
          qr.drawJoinQr(canvas, link);
          qrCard.removeAttribute('data-pending');
        },
        () => {
          const wait = QR_RETRY_MS[attempt];
          if (lobbyOn?.canvas !== canvas || wait === undefined) return;
          setTimeout(() => {
            if (lobbyOn?.canvas === canvas) drawQr(canvas, qrCard, link, attempt + 1);
          }, wait);
        },
      )
      // A module that loaded but could not draw leaves the card hidden; asking again would fail the same way.
      .catch(() => {});
  };

  /**
   * The QR lobby (design/Gh302Projector.dc.html proj-lobby B): event name, the scan heading and its hint,
   * the join QR, the PIN and the joined count. No control, so the MC bar empties. The QR module loads here
   * and only here; it draws once per event, and a count update rewrites the texts and keeps the canvas.
   * The QR card is hidden (its place kept) until the code is on it: drawQr.
   */
  const renderLobby = (lobby: Lobby): void => {
    const key = `${lobby.eventId}:${lobby.pin}`;
    if (lobbyOn && lobbyOn.key === key && frame.getAttribute('data-screen') === 'lobby') {
      lobbyOn.ev.textContent = lobby.eventName;
      lobbyOn.count.textContent = COPY.joined(lobby.joined);
      return;
    }
    const el = (tag: string, className: string, text?: string): HTMLElement => {
      const node = doc.createElement(tag);
      node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const top = el('div', 'pd-top');
    const ev = el('span', 'pd-ev', lobby.eventName);
    top.appendChild(ev);
    const grid = el('div', 'pd-lobby');
    const left = el('div', 'pd-lobby-l');
    left.append(el('h2', 'pd-lh', COPY.scan), el('div', 'pd-jh', COPY.oneName));
    const qrCard = el('div', 'pd-qrcard');
    qrCard.setAttribute('data-pending', '');
    const canvas = doc.createElement('canvas');
    canvas.className = 'pd-qr';
    canvas.setAttribute('aria-hidden', 'true');
    qrCard.appendChild(canvas);
    const right = el('div', 'pd-lobby-r');
    const count = el('div', 'pd-jc', COPY.joined(lobby.joined));
    right.append(el('div', 'pd-pk', COPY.pin), el('div', 'pd-pv', lobby.pin), count);
    grid.append(left, qrCard, right);
    frame.replaceChildren(top, grid);
    frame.setAttribute('data-screen', 'lobby');
    mc.replaceChildren();
    picks.replaceChildren();
    mounted = null;
    lobbyOn = { key, canvas, ev, count };
    live.textContent = `${COPY.scan} ${COPY.pin} ${lobby.pin}`;
    markField();
    show(viewport);
    drawQr(canvas, qrCard, joinLink(deps.joinOrigin ?? doc.defaultView?.location.origin ?? '', lobby.eventId, lobby.pin));
  };

  const render = (wave: boolean): void => {
    painted = true;
    const lobby = lobbyNow();
    if (lobby) {
      renderLobby(lobby);
      return;
    }
    lobbyOn = null;
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
      picks.replaceChildren();
      mounted = null;
      live.textContent = text;
      markField();
      show(viewport);
      return;
    }
    const view = shownView(state);
    syncLanes(state);
    if (picksLanes(state)) paintLaneFrame(state);
    else renderScreen(frame, view, doc);
    paintControls(state);
    markField();
    // The result's names were fitted before the mark reached its phone layout, at the projector's floors.
    if (view.kind === 'result') fitFrameNames();
    announce(live, view, doc);
    const field = frame.querySelector<HTMLElement>('.pd-field');
    if (field && view.kind === 'reveal') {
      if (deps.reducedMotion) field.classList.add('pd-fade');
      else if (wave && deps.nextFrame) {
        // Rendered with its end state so names were fitted bold, and that fit computed the marked style. The
        // wave is ONE style change, unmarked to marked, so the unmarked style must be computed first without a
        // transition of its own: a marked -> unmarked change would run one per name, and the re-mark would
        // cancel them all in their delays (gh#314 1d, measured in Chrome). So the field leaves rendering while
        // it drops the mark (a flush at display none keeps no style to start from), comes back unmarked (a
        // second flush), and only the next frame marks it.
        field.style.setProperty('display', 'none');
        field.classList.remove('pd-marked');
        void field.offsetWidth;
        field.style.setProperty('display', '');
        void field.offsetWidth;
        deps.nextFrame(() => field.classList.add('pd-marked'));
      }
    }
    if (view.kind === 'reveal') deps.whenBoldLoaded?.(fitFrameNames);
    show(viewport);
  };

  /** Take up what is stored. Always re-renders, so the mounted control is rebuilt at the new `seen`: a
   *  control left at the old text would drop every later press. The wave runs only when the state moved. */
  const adopt = (now: Snapshot, wave = true): void => {
    const moved = now.state && state ? encodeEvent(now.state) !== encodeEvent(state) : now.state !== state;
    // Whatever was presenting belongs to the state being replaced: it goes, and draws nothing.
    stopReveal();
    seen = now.raw;
    state = now.state;
    epoch++;
    render(wave && moved);
  };

  /**
   * One press on the step `s`, rendered at the stored text `token`, or one lane pick (`pick`, the state
   * pickLane made from `s`). Every write is a compare-and-set on `token`, and the screen changes only once
   * the store has answered. A draw is committed together with its reveal, so what the room sees is exactly
   * what is stored.
   */
  const press = async (db: EventStore, token: string | null, s: EventState, pick?: EventState): Promise<void> => {
    const g = generation;
    const pos = position(s);
    let result: PutResult | null = null;
    const put = async (next: EventState): Promise<boolean> => {
      result = await db.put(token, next);
      return result.ok;
    };
    let next: EventState;
    if (pick) {
      next = pick;
      await put(next);
    } else if (pos.at === 'ready' && dealsFirst(s)) {
      // A card round's first press: the deal is stored, still ready; the rule waits for the next press.
      next = prepareCards(s, rng);
      await put(next);
    } else if (pos.at === 'ready') {
      // A ladder final locks its stored picks here (drawNext reads them); without all five nothing is written.
      if (picksLanes(s) && !lockedPicks(s)) return;
      const drawn = await drawAndSave(s, rng, (d) => put(revealDrawn(d)));
      next = drawn.ok ? revealDrawn(drawn.state) : s;
    } else if (pos.at === 'drawn') {
      next = revealDrawn(s);
      await put(next);
    } else {
      // The step into a ladder final also draws and stores its slot layout (event.ts advance).
      next = advance(s, rng);
      await put(next);
    }
    const r = result as PutResult | null;
    // The store stopped while the write ran (the stop already rendered), or this screen took up a newer
    // stored state meanwhile (that state stands).
    if (g !== generation || store !== db || seen !== token || !r) return;
    if (r.ok) {
      save(r.raw, next);
      showCommitted(pos, next);
    } else if (r.reason === 'stale') adopt(r.now);
    // A pick that did not store shows nothing of it: the screen stays on the stored picks, re-armed. No copy
    // exists for a failed pick, so it opens no notice.
    else if (pick) render(false);
    // Not stored: the screen stays on the step the store holds, a step forward included, so a reload never
    // lands behind what the room saw. The notice names the step that failed.
    else {
      noticeText.textContent = pos.at === 'revealed' ? COPY.nextFailed : COPY.saveFailed;
      // The MC's button is outside the veil: held disabled until the close path rebuilds it.
      for (const b of mc.querySelectorAll('button')) b.disabled = true;
      show(notice);
    }
  };

  // A press waiting on its write: further taps on this screen are dropped until it has answered.
  let busy = false;
  const request = (token: string | null, builtFor: string, pick?: EventState): void => {
    if (busy || !store || !state || key(state) !== builtFor) return;
    busy = true;
    void press(store, token, state, pick).then(
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
    // Closing the notice gives the MC's button back, rebuilt live: a reveal (ADR-0057), armed like any other.
    // Only the screen now showing gets its controls: a lobby that arrived under the notice has none, and the
    // event it replaced must not put its button over it.
    if (state && !lobbyOn) paintControls(state);
    show(viewport);
  });

  if (deps.doc.defaultView) {
    const win = deps.doc.defaultView;
    let narrow: boolean | null = null;
    const refit = (): void => {
      fitFrame(scaled, viewport);
      // The lane controls sit over the plates of the scaled frame: they take the same scale and offset.
      fitFrame(picks, viewport);
      // Names are fitted at their layout's size, so crossing the phone break refits them (gh#314 item 5).
      const now = win.innerWidth < 640;
      if (narrow !== null && now !== narrow) fitFrameNames();
      narrow = now;
    };
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
  // The lobby record changed (the setup page created its QR event, a count moved, or the start stored the
  // event and dropped the record): show what is there now. A change that neither shows nor ends a lobby is
  // not this screen's.
  deps.lobby?.subscribe(() => {
    if (!painted || (!lobbyNow() && !lobbyOn)) return;
    stopReveal();
    render(false);
  });

  return {
    current: () => state,
    refit: fitFrameNames,
    version: () => ({ seen, token: mounted, busy }),
    ready,
  };
}
