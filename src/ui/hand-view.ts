import { cardText } from '../core/cards';
import {
  BOARD_COUNT,
  effectiveStack,
  quickSizes,
  replay,
  startingEffective,
  usedCards,
  validate,
  type Act,
  type ActionEvent,
  type BoardStreet,
  type Hand,
  type HandEvent,
  type Table,
} from '../core/engine';
import { LEAK_TAGS, formatHand, num, safeFormat } from '../core/format';
import { PREFLOP_ORDER, buttonForSeatAt, type Pos } from '../core/positions';
import { app, commit, createHand, isBlank, persist, snapshotSeats, upsertHand } from '../store';
import { copyText, h, toast } from './dom';
import { openCards, openNumpad } from './overlays';

/** Player tapped out of turn (skipping = folding whoever is in between). */
let selected: Pos | null = null;
/** The current hand was opened from history, so "next hand" must not move the button. */
let editingOld = false;

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function hand(): Hand {
  if (!app.current) app.current = createHand(app.session!);
  return app.current;
}

/** Stakes like 0.5/1 need a "." key; whole-chip stakes get "00" instead. */
function hasDecimals(): boolean {
  const { sb, bb } = hand().stakes;
  return !Number.isInteger(sb) || !Number.isInteger(bb);
}

function formatOpts() {
  return { verbose: app.session!.verbose, spacedBoard: app.session!.spacedBoard };
}

function nameOf(hd: Hand, p: Pos): string {
  return p === hd.heroPos ? 'hero' : (hd.labels[p] ?? '');
}

function who(hd: Hand, p: Pos): string {
  const n = nameOf(hd, p);
  return n ? `${n} ${p}` : p;
}

function pushEvent(e: HandEvent): void {
  const hd = hand();
  const err = validate({ ...hd, events: [...hd.events, e] });
  if (err) {
    toast(err);
    commit();
    return;
  }
  selected = null;
  commit(() => hd.events.push(e));
  const t = replay(hd);
  if (!t.complete && t.roundClosed && t.nextStreet) dealPrompt(t.nextStreet);
  // heads-up river showdown: the villain is about to table their hand
  else if (t.complete && t.street === 'river' && t.players.length === 2) {
    const villain = t.players.find((p) => p !== hd.heroPos);
    if (villain && !hd.showdown.length) pickShowdown(villain);
  }
}

function dealPrompt(street: BoardStreet): void {
  const hd = hand();
  openCards({
    title: `${cap(street)}`,
    count: BOARD_COUNT[street],
    used: usedCards(hd),
    onDone: (cards) => pushEvent({ kind: 'board', street, cards }),
  });
}

function pickHeroCards(): void {
  const hd = hand();
  const used = usedCards(hd);
  hd.heroCards.forEach((c) => used.delete(c));
  openCards({
    title: 'Hero cards',
    count: 2,
    used,
    onDone: (cards) => commit(() => (hd.heroCards = cards)),
  });
}

function doAct(t: Table, p: Pos, act: Act): void {
  const hd = hand();
  if (act === 'b' || act === 'r') {
    openNumpad({
      decimals: hasDecimals(),
      title: `${who(hd, p)} ${act === 'b' ? 'bets' : `raises to (> ${num(t.currentBet)})`}`,
      value: '',
      quick: quickSizes(t, p, hd.stakes.bb),
      above: t.currentBet,
      onDone: (amount) => pushEvent({ kind: 'action', pos: p, act, amount }),
    });
  } else if (act === 'allin') {
    const stack = hd.stacks[p];
    const behind = stack == null ? undefined : stack - (t.totalContrib[p] ?? 0) + t.contribOf(p);
    openNumpad({
      decimals: hasDecimals(),
      title: `${who(hd, p)} all-in for (street total)`,
      value: behind != null && behind > t.contribOf(p) ? num(behind) : '',
      quick: [],
      above: t.contribOf(p),
      onDone: (amount) => pushEvent({ kind: 'action', pos: p, act, amount }),
    });
  } else {
    pushEvent({ kind: 'action', pos: p, act });
  }
}

/**
 * Tapping a player who already acted this street takes back their last action (and
 * anything after it on this street), then selects them to act again. That also
 * revives a player who was skipped (folded) by mistake.
 */
function rewindTo(p: Pos): void {
  const hd = hand();
  const actionsBy = (events: HandEvent[]) =>
    replay({ ...hd, events }).log.actions.filter((a) => a.pos === p).length;
  const n = actionsBy(hd.events);
  const events = [...hd.events];
  const removed: string[] = [];
  while (events.at(-1)?.kind === 'action' && actionsBy(events) >= n) {
    const e = events.pop() as ActionEvent;
    removed.unshift(`${e.pos} ${e.act}${e.amount != null ? ' ' + num(e.amount) : ''}`);
  }
  if (!removed.length || actionsBy(events) >= n) return;
  selected = p;
  commit(() => {
    hd.events = events;
    if (!replay(hd).complete) hd.showdown = [];
  });
  toast(`Undid ${removed.join(', ')}`);
}

function undo(): void {
  const hd = hand();
  selected = null;
  commit(() => {
    if (hd.showdown.length) hd.showdown.pop();
    else if (hd.events.length) {
      const e = hd.events.pop()!;
      if (e.kind === 'board') delete hd.potOverrides[e.street];
    } else hd.heroCards = [];
  });
}

function setHeroPos(p: Pos): void {
  const s = app.session!;
  const hd = hand();
  commit(() => {
    s.buttonSeat = buttonForSeatAt(s.heroSeat, p, s.tableSize);
    hd.heroPos = p;
    snapshotSeats(s, hd);
  });
}

async function copyCurrent(): Promise<void> {
  const hd = hand();
  if (validate(hd)) return toast('Hand has errors, undo first');
  if (!isBlank(hd)) upsertHand(hd);
  commit();
  toast((await copyText(formatHand(hd, formatOpts()))) ? 'Copied ✓' : 'Copy failed');
}

function nextHand(): void {
  const s = app.session!;
  const hd = hand();
  commit(() => {
    if (!isBlank(hd)) upsertHand(hd);
    if (s.autoRotate && !editingOld && !isBlank(hd)) s.buttonSeat = (s.buttonSeat % s.tableSize) + 1;
    app.current = createHand(s);
    editingOld = false;
    selected = null;
  });
  pickHeroCards();
}

/** Open a saved hand in the editor. */
export function editHand(id: string): void {
  const saved = app.hands.find((x) => x.id === id);
  if (!saved) return;
  commit(() => {
    const cur = app.current;
    if (cur && !isBlank(cur) && cur.id !== id) upsertHand(cur);
    app.current = structuredClone(saved);
    app.view = 'hand';
    editingOld = true;
    selected = null;
  });
}

export function startNewHand(): void {
  editingOld = false;
  selected = null;
  app.current = createHand(app.session!);
}

function lastActionText(t: Table, p: Pos): string {
  const a = t.log.actions.filter((x) => x.pos === p).at(-1);
  if (!a) return '';
  return a.amount != null && a.act !== 'c' ? `${a.act} ${num(a.amount)}` : a.act;
}

function chip(t: Table, hd: Hand, p: Pos, actor: Pos | null) {
  const due = t.isDue(p);
  const acted = t.log.actions.some((a) => a.pos === p);
  const cls = ['chip'];
  if (p === hd.heroPos) cls.push('hero');
  if (t.folded.has(p)) cls.push('folded');
  if (t.allIn.has(p)) cls.push('allin');
  if (p === actor) cls.push('active');
  else if (due) cls.push('due');
  return h(
    'button',
    {
      class: cls.join(' '),
      disabled: !due && !acted,
      onClick: () => (due ? ((selected = p), commit()) : rewindTo(p)),
    },
    h('span', { class: 'chip-pos' }, p),
    h('span', { class: 'chip-name' }, nameOf(hd, p) || ' '),
    h('span', { class: 'chip-act' }, t.allIn.has(p) ? 'all-in' : lastActionText(t, p) || ' '),
  );
}

function infoBar(t: Table, hd: Hand) {
  const { sb, bb, currency } = hd.stakes;
  const start = startingEffective(hd, t);
  const left = effectiveStack(hd, t);
  const bits = [`${num(sb)}/${num(bb)} ${currency}`.trim(), `${hd.tableSize}-max`];
  if (left != null && t.street !== 'preflop' && t.potStart > 0) bits.push(`spr ${num(Math.round((left / t.potStart) * 10) / 10)}`);
  const editEff = () =>
    openNumpad({
      decimals: hasDecimals(),
      title: 'Effective stack',
      value: start != null ? num(start) : '',
      quick: [],
      above: 0,
      onDone: (n) => commit(() => (hd.effOverride = n)),
    });
  return h(
    'div',
    { class: 'infobar' },
    h('span', null, bits.join(' · ')),
    h(
      'span',
      { class: 'row' },
      h(
        'button',
        { class: `btn small${hd.effOverride != null ? ' set' : ''}`, onClick: editEff },
        start != null ? `eff ${num(start)} (${num(Math.round((start / bb) * 10) / 10)}bb)` : 'eff ?',
      ),
      hd.effOverride != null
        ? h('button', { class: 'btn small ghost', title: 'Back to auto', onClick: () => commit(() => delete hd.effOverride) }, '↺')
        : null,
      h('button', { class: 'btn small', onClick: undo, disabled: isBlank(hd) && !hd.showdown.length }, '↶ Undo'),
    ),
  );
}

function heroBlock(hd: Hand) {
  const cards = [0, 1].map((i) => {
    const c = hd.heroCards[i];
    return h('span', { class: `slot ${c ? 'suit-' + c[1] : 'empty'}` }, c ? cardText(c, true) : '?');
  });
  return h(
    'section',
    { class: 'block hero-block' },
    h(
      'div',
      { class: 'row between' },
      h('button', { class: 'cards-btn', onClick: pickHeroCards, 'aria-label': 'Pick hero cards' }, cards),
      hd.events.length ? h('span', { class: 'muted' }, `hero ${hd.heroPos}`) : null,
    ),
    hd.events.length
      ? null
      : h(
          'div',
          { class: 'pos-row' },
          PREFLOP_ORDER[hd.tableSize].map((p) =>
            h('button', { class: `pill${p === hd.heroPos ? ' on' : ''}`, onClick: () => setHeroPos(p) }, p),
          ),
        ),
  );
}

function streetBlock(t: Table, hd: Hand, actor: Pos | null) {
  const board = t.boardCards;
  const shown = t.order.filter((p) => !t.folded.has(p) || t.log.actions.some((a) => a.pos === p));
  const potBtn =
    t.street === 'preflop'
      ? null
      : h(
          'button',
          {
            class: 'btn small',
            onClick: () =>
              openNumpad({
                decimals: hasDecimals(),
                title: `${t.street} pot`,
                value: num(t.potStart),
                quick: [],
                above: 0,
                onDone: (n) => commit(() => (hd.potOverrides[t.street as BoardStreet] = n)),
              }),
          },
          `pot ${num(t.potStart)} ✎`,
        );
  return h(
    'section',
    { class: 'block' },
    h(
      'div',
      { class: 'row between' },
      h('strong', { class: 'street' }, cap(t.street)),
      h('span', { class: 'board' }, board.map((c) => h('span', { class: `mini suit-${c[1]}` }, cardText(c, true)))),
      potBtn,
    ),
    h('div', { class: 'muted small-text' }, `in pot ${num(t.pot)}${t.currentBet ? ` · bet ${num(t.currentBet)}` : ''}`),
    h('div', { class: 'chips' }, shown.map((p) => chip(t, hd, p, actor))),
  );
}

function pickShowdown(p: Pos): void {
  const hd = hand();
  const used = usedCards(hd);
  hd.showdown.find((s) => s.pos === p)?.cards.forEach((c) => used.delete(c));
  openCards({
    title: `${who(hd, p)} shows`,
    count: 2,
    used,
    onDone: (cards) =>
      commit(() => {
        hd.showdown = [...hd.showdown.filter((s) => s.pos !== p), { pos: p, cards }];
      }),
  });
}

function showdownBlock(t: Table, hd: Hand) {
  if (!t.complete || t.players.length < 2) return null;
  const villains = t.players.filter((p) => p !== hd.heroPos);
  return h(
    'section',
    { class: 'block' },
    h('strong', null, 'Showdown'),
    h(
      'div',
      { class: 'pos-row' },
      villains.map((p) => {
        const s = hd.showdown.find((x) => x.pos === p);
        return h(
          'button',
          { class: `pill${s ? ' on' : ''}`, onClick: () => pickShowdown(p) },
          `${nameOf(hd, p) || p} ${s ? s.cards.map((c) => cardText(c, true)).join('') : 'shows…'}`,
        );
      }),
    ),
  );
}

function notesBlock(hd: Hand) {
  const toggle = (tag: string) =>
    commit(() => (hd.tags = hd.tags.includes(tag) ? hd.tags.filter((x) => x !== tag) : [...hd.tags, tag]));
  return h(
    'section',
    { class: 'block' },
    h(
      'div',
      { class: 'pos-row' },
      LEAK_TAGS.map((tag) => h('button', { class: `pill tag${hd.tags.includes(tag) ? ' on' : ''}`, onClick: () => toggle(tag) }, tag)),
    ),
    h('input', {
      class: 'input',
      type: 'text',
      placeholder: 'comment (optional)',
      value: hd.comment,
      enterkeyhint: 'done',
      onInput: (e: Event) => {
        hd.comment = (e.target as HTMLInputElement).value;
        commitQuiet();
      },
      onChange: () => commit(),
    }),
  );
}

/** Save and refresh the preview without re-rendering (keeps input focus). */
function commitQuiet() {
  const preview = document.getElementById('preview');
  if (preview) preview.textContent = safeFormat(hand(), formatOpts());
  persist();
}

function previewBlock(hd: Hand) {
  const s = app.session!;
  return h(
    'section',
    { class: 'block' },
    h('pre', { id: 'preview', class: 'preview' }, safeFormat(hd, formatOpts()) || 'Tap through the hand…'),
    h(
      'label',
      { class: 'toggle' },
      h('input', { type: 'checkbox', checked: s.verbose, onChange: () => commit(() => (s.verbose = !s.verbose)) }),
      ' verbose (full words, ♠♥♦♣)',
    ),
  );
}

function actionPad(t: Table, hd: Hand, actor: Pos | null) {
  let pad: HTMLElement | null = null;
  if (t.complete) {
    pad = h('div', { class: 'pad-head' }, h('span', null, 'Hand complete'));
  } else if (!actor) {
    const next = t.nextStreet!;
    pad = h('button', { class: 'btn primary wide', onClick: () => dealPrompt(next) }, `Deal ${next} ▸`);
  } else {
    const toCall = t.toCall(actor);
    const head = h(
      'div',
      { class: 'pad-head' },
      h('span', null, h('b', null, who(hd, actor)), toCall ? ` · to call ${num(toCall)}` : ''),
      t.nextStreet && t.street === 'preflop'
        ? h('button', { class: 'btn small', onClick: () => dealPrompt('flop') }, 'Flop ▸')
        : null,
    );
    const btn = (label: string, act: Act, cls = '', disabled = false) =>
      h('button', { class: `btn act ${cls}`, disabled, onClick: () => doAct(t, actor, act) }, label);
    pad = h(
      'div',
      null,
      head,
      h(
        'div',
        { class: 'acts' },
        btn('Fold', 'f', 'fold', toCall === 0),
        toCall ? btn(`Call ${num(toCall)}`, 'c', 'call') : btn('Check', 'x', 'call'),
        t.currentBet ? btn('Raise', 'r', 'raise') : btn('Bet', 'b', 'raise'),
        btn('All-in', 'allin', 'shove'),
      ),
    );
  }
  return h(
    'div',
    { class: 'dock' },
    pad,
    h(
      'div',
      { class: 'acts two' },
      h('button', { class: 'btn primary big', onClick: copyCurrent }, 'Copy'),
      h('button', { class: 'btn big', onClick: nextHand }, 'Next hand ▸'),
    ),
  );
}

export function renderHand(): HTMLElement {
  const hd = hand();
  let t: Table;
  try {
    t = replay(hd);
  } catch (err) {
    return h(
      'main',
      { class: 'view' },
      h('p', null, `This hand can't be replayed: ${(err as Error).message}`),
      h('button', { class: 'btn', onClick: undo }, '↶ Undo last event'),
    );
  }
  const actor = selected && t.isDue(selected) ? selected : t.toAct;
  return h(
    'main',
    { class: 'view hand-view' },
    infoBar(t, hd),
    heroBlock(hd),
    streetBlock(t, hd, actor),
    showdownBlock(t, hd),
    previewBlock(hd),
    notesBlock(hd),
    actionPad(t, hd, actor),
  );
}

export { pickHeroCards };
