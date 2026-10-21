import { RANKS, SUITS, SUIT_SYMBOL, cardText, type Card } from '../core/cards';
import type { QuickSize } from '../core/engine';
import { num } from '../core/format';
import { commit } from '../store';
import { h, parseNum } from './dom';

interface CardsOverlay {
  kind: 'cards';
  title: string;
  count: number;
  picked: Card[];
  used: Set<Card>;
  onDone: (cards: Card[]) => void;
}

interface NumOverlay {
  kind: 'num';
  title: string;
  value: string;
  quick: QuickSize[];
  /** Amount must be greater than this. */
  above: number;
  /** Show a "." key; otherwise "00" (whole-chip stakes). */
  decimals?: boolean;
  onDone: (n: number) => void;
}

let overlay: CardsOverlay | NumOverlay | null = null;

export function openCards(o: Omit<CardsOverlay, 'kind' | 'picked'> & { picked?: Card[] }): void {
  overlay = { kind: 'cards', picked: [], ...o };
  commit();
}

export function openNumpad(o: Omit<NumOverlay, 'kind'>): void {
  overlay = { kind: 'num', ...o };
  commit();
}

export function closeOverlay(): boolean {
  if (!overlay) return false;
  overlay = null;
  commit();
  return true;
}

export function hasOverlay(): boolean {
  return overlay != null;
}

export function renderOverlay(): HTMLElement | null {
  if (!overlay) return null;
  const sheet = overlay.kind === 'cards' ? cardSheet(overlay) : numSheet(overlay);
  return h('div', { class: 'backdrop', onClick: (e: Event) => e.target === e.currentTarget && closeOverlay() }, sheet);
}

function cardSheet(o: CardsOverlay) {
  const toggle = (c: Card) => {
    o.picked = o.picked.includes(c) ? o.picked.filter((x) => x !== c) : [...o.picked, c];
    if (o.picked.length === o.count) {
      const cards = o.picked;
      overlay = null;
      o.onDone(cards);
    } else commit();
  };
  const slots = Array.from({ length: o.count }, (_, i) => {
    const c = o.picked[i];
    return h('span', { class: `slot ${c ? 'suit-' + c[1] : 'empty'}` }, c ? cardText(c, true) : '·');
  });
  return h(
    'div',
    { class: 'sheet' },
    h('div', { class: 'sheet-head' }, h('strong', null, o.title), h('div', { class: 'slots' }, slots)),
    h(
      'div',
      { class: 'card-grid' },
      SUITS.map((s) =>
        RANKS.map((r) => {
          const c = r + s;
          const picked = o.picked.includes(c);
          return h(
            'button',
            {
              class: `cell suit-${s}${picked ? ' picked' : ''}`,
              disabled: o.used.has(c) && !picked,
              onClick: () => toggle(c),
              'aria-label': c,
            },
            h('b', null, r),
            h('i', null, SUIT_SYMBOL[s]),
          );
        }),
      ),
    ),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn ghost', onClick: closeOverlay }, 'Cancel'),
      h('button', { class: 'btn ghost', disabled: !o.picked.length, onClick: () => ((o.picked = []), commit()) }, 'Clear'),
    ),
  );
}

function numSheet(o: NumOverlay) {
  const amount = parseNum(o.value);
  const ok = amount != null && amount > o.above;
  const set = (v: string) => {
    o.value = v;
    commit();
  };
  const press = (k: string) => {
    if (k === '⌫') set(o.value.slice(0, -1));
    else if (k === '.' && o.value.includes('.')) return;
    else if (k === '00' && !o.value) return;
    else set(o.value + k);
  };
  // quick sizes submit straight away; anything invalid just fills the display
  const pick = (n: number) => {
    if (!(n > o.above)) return set(num(n));
    overlay = null;
    o.onDone(n);
  };
  const submit = () => {
    if (!ok) return;
    overlay = null;
    o.onDone(amount!);
  };
  return h(
    'div',
    { class: 'sheet' },
    h('div', { class: 'sheet-head' }, h('strong', null, o.title), h('div', { class: 'num-display' }, o.value || '0')),
    [true, false].map((primary) => {
      const qs = o.quick.filter((q) => Boolean(q.primary) === primary);
      return qs.length
        ? h(
            'div',
            { class: `quick${primary ? ' primary' : ''}` },
            qs.map((q) =>
              h(
                'button',
                { class: 'btn small', onClick: () => pick(q.amount) },
                h('span', null, q.label),
                h('small', null, num(q.amount)),
              ),
            ),
          )
        : null;
    }),
    h(
      'div',
      { class: 'keypad' },
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', o.decimals === false ? '00' : '.', '0', '⌫'].map((k) =>
        h('button', { class: 'btn key', onClick: () => press(k) }, k),
      ),
    ),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn ghost', onClick: closeOverlay }, 'Cancel'),
      h('button', { class: 'btn primary', disabled: !ok, onClick: submit }, 'OK'),
    ),
  );
}
