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
import { screenView } from '../../prize-event/view.ts';
import { announce, fitFrame, renderScreen } from '../_prize-reveal/reveal.ts';
import { laneX, renderLanes } from './lanes.ts';
import { fitAll, writeName } from '../_prize-reveal/names-dom.ts';
import { startReveal, type HostOptions, type RevealHost } from '../_prize-reveal/game-host.ts';
import type { CommittedOutcome, GameId } from '../_prize-reveal/game-contract.ts';

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
  // Owner-approved (gh#305 item 3 B): a card round's first press deals; the reveal label then draws the rule.
  deal: 'แจกไพ่',
  // Owner-approved (gh#305 item 2): the ladder final's hud line while the finalists pick lanes.
  lanePick: 'ให้ผู้เข้ารอบชิงเลือกเส้น แตะเส้นแล้วแตะชื่อ',
  // An empty lane's label: its number, as the picked frame draws it (design/Gh305GamePick.dc.html i2-lanes).
  lane: (lane: number): string => String(lane),
};

/** The screens with a name field: under 640px they take the phone layout, names in two columns (gh#314
 *  item 5 B). The lane picks take their own phone layout (markField); the result and the cold screen keep the
 *  scaled frame. */
const FIELD_SCREENS = new Set(['round', 'reveal', 'final']);

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

  /** The MC's button for the step `s` is at. A press only acts on the step, and the stored text, it was
   *  rendered at: a failed reveal-save moves the step on screen ahead of `seen`, so both are checked. */
  const control = (s: EventState): HTMLElement | null => {
    const pos = position(s);
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
        picking: COPY.lanePick,
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

  /** Mark whether the screen on the frame has a name field, or is the ladder's lane picks: each takes its
   *  own phone layout under 640px (play.css). */
  const markField = (): void => {
    const screen = frame.getAttribute('data-screen');
    if (screen !== null && FIELD_SCREENS.has(screen)) viewport.setAttribute('data-field', '');
    else viewport.removeAttribute('data-field');
    if (screen === 'lanes') viewport.setAttribute('data-lanes', '');
    else viewport.removeAttribute('data-lanes');
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
      picks.replaceChildren();
      mounted = null;
      live.textContent = text;
      markField();
      show(viewport);
      return;
    }
    const view = screenView(state);
    syncLanes(state);
    if (picksLanes(state)) paintLaneFrame(state);
    else renderScreen(frame, view, doc);
    paintControls(state);
    markField();
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
    if (state) paintControls(state);
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
      if (narrow !== null && now !== narrow) fitAll(frame);
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
  return {
    current: () => state,
    refit: () => fitAll(frame),
    version: () => ({ seen, token: mounted, busy }),
    ready,
  };
}
