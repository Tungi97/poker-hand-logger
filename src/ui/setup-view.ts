import { PREFLOP_ORDER, buttonForSeatAt, positionOfSeat, type TableSize } from '../core/positions';
import { app, commit, createHand, emptySeats, newSession, snapshotSeats, type Session } from '../store';
import { h, parseNum } from './dom';
import { startNewHand } from './hand-view';

/** Keep a not-yet-saved current hand in sync with the table setup. */
function syncCurrent(s: Session) {
  const cur = app.current;
  if (!cur || cur.sessionId !== s.id || app.hands.some((x) => x.id === cur.id)) return;
  if (cur.events.length === 0) {
    const fresh = createHand(s);
    Object.assign(cur, { stakes: fresh.stakes, tableSize: fresh.tableSize, heroPos: fresh.heroPos });
  }
  snapshotSeats(s, cur);
}

function update(fn: (s: Session) => void) {
  const s = app.session!;
  commit(() => {
    fn(s);
    syncCurrent(s);
  });
}

function numInput(value: number | undefined, set: (n: number | undefined) => void, placeholder = '') {
  return h('input', {
    class: 'input',
    type: 'text',
    inputmode: 'decimal',
    value: value ?? '',
    placeholder,
    onChange: (e: Event) => update(() => set(parseNum((e.target as HTMLInputElement).value))),
  });
}

function field(label: string, control: Node) {
  return h('label', { class: 'field' }, h('span', null, label), control);
}

export function renderSetup(): HTMLElement {
  if (!app.session) app.session = newSession();
  const s = app.session;
  const heroPos = positionOfSeat(s.heroSeat, s.buttonSeat, s.tableSize);
  const sizes: TableSize[] = [6, 9];

  return h(
    'main',
    { class: 'view' },
    h(
      'section',
      { class: 'block' },
      h('strong', null, 'Session'),
      h(
        'div',
        { class: 'grid3' },
        field('SB', numInput(s.stakes.sb, (n) => n != null && (s.stakes.sb = n))),
        field('BB', numInput(s.stakes.bb, (n) => n != null && (s.stakes.bb = n))),
        field(
          'Currency',
          h('input', {
            class: 'input',
            type: 'text',
            value: s.stakes.currency,
            onChange: (e: Event) => update(() => (s.stakes.currency = (e.target as HTMLInputElement).value.trim())),
          }),
        ),
      ),
      field(
        'Table',
        h(
          'div',
          { class: 'pos-row' },
          sizes.map((n) =>
            h(
              'button',
              {
                class: `pill${s.tableSize === n ? ' on' : ''}`,
                onClick: () =>
                  update(() => {
                    s.tableSize = n;
                    s.seats = emptySeats(n, s.seats);
                    s.heroSeat = Math.min(s.heroSeat, n);
                    s.buttonSeat = Math.min(s.buttonSeat, n);
                  }),
              },
              n === 6 ? '6-max' : '9-max full ring',
            ),
          ),
        ),
      ),
      field('My stack (optional)', numInput(s.heroStack, (n) => (s.heroStack = n), 'for eff. stack / SPR')),
      field(
        'My position now',
        h(
          'div',
          { class: 'pos-row' },
          PREFLOP_ORDER[s.tableSize].map((p) =>
            h(
              'button',
              {
                class: `pill${p === heroPos ? ' on' : ''}`,
                onClick: () => update(() => (s.buttonSeat = buttonForSeatAt(s.heroSeat, p, s.tableSize))),
              },
              p,
            ),
          ),
        ),
      ),
      h(
        'label',
        { class: 'toggle' },
        h('input', { type: 'checkbox', checked: s.autoRotate, onChange: () => update(() => (s.autoRotate = !s.autoRotate)) }),
        ' move the button one seat each new hand',
      ),
      h(
        'label',
        { class: 'toggle' },
        h('input', { type: 'checkbox', checked: s.spacedBoard, onChange: () => update(() => (s.spacedBoard = !s.spacedBoard)) }),
        ' space flop cards ("Th Tc 2h" vs "ThTc2h")',
      ),
    ),
    h(
      'section',
      { class: 'block' },
      h('strong', null, 'Seats'),
      h('p', { class: 'muted small-text' }, 'Seats go clockwise. Labels follow the seat as the button moves.'),
      s.seats.map((seat, i) => {
        const n = i + 1;
        const isHero = n === s.heroSeat;
        // hero's seat is fixed; "My position now" moves the button instead
        return h(
          'div',
          { class: `seat${isHero ? ' hero' : ''}` },
          h('span', { class: 'seat-no' }, `${n}`),
          h('span', { class: 'seat-pos' }, positionOfSeat(n, s.buttonSeat, s.tableSize)),
          isHero
            ? h('span', { class: 'seat-hero' }, 'hero')
            : h('input', {
                class: 'input',
                type: 'text',
                placeholder: 'villain label',
                value: seat.label,
                autocapitalize: 'off',
                onChange: (e: Event) => update(() => (seat.label = (e.target as HTMLInputElement).value.trim().toLowerCase())),
              }),
          isHero ? null : numInput(seat.stack, (v) => (seat.stack = v), 'stack')
        );
      }),
    ),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn primary big', onClick: () => commit(() => (app.view = 'hand')) }, 'Log hands ▸'),
      h(
        'button',
        {
          class: 'btn big',
          onClick: () =>
            confirm('Start a new session? Saved hands stay in history (all sessions).') &&
            commit(() => {
              app.session = newSession(s);
              startNewHand();
            }),
        },
        'New session',
      ),
    ),
  );
}
