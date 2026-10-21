import { cardText } from '../core/cards';
import type { Hand } from '../core/engine';
import { safeFormat } from '../core/format';
import { app, commit } from '../store';
import { copyText, download, h, toast } from './dom';
import { editHand } from './hand-view';

function opts() {
  return { verbose: app.session!.verbose, spacedBoard: app.session!.spacedBoard };
}

function visibleHands(): Hand[] {
  const s = app.session!;
  return app.hands
    .filter((x) => app.showAllSessions || x.sessionId === s.id)
    .sort((a, b) => a.createdAt - b.createdAt);
}

const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const date = (ts: number) => new Date(ts).toISOString().slice(0, 10);

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(hands: Hand[]): string {
  const head = ['n', 'date', 'time', 'stakes', 'table', 'hero_pos', 'hero_cards', 'board', 'tags', 'comment', 'note'];
  const rows = hands.map((x, i) => [
    i + 1,
    date(x.createdAt),
    time(x.createdAt),
    `${x.stakes.sb}/${x.stakes.bb} ${x.stakes.currency}`.trim(),
    `${x.tableSize}-max`,
    x.heroPos,
    x.heroCards.join(''),
    x.events.flatMap((e) => (e.kind === 'board' ? e.cards : [])).join(' '),
    x.tags.join('; '),
    x.comment,
    safeFormat(x, opts()),
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

function backup() {
  const { session, hands } = app;
  download(`hand-logger-backup-${date(Date.now())}.json`, JSON.stringify({ version: 1, session, hands }, null, 1), 'application/json');
}

/** Merges hands from a backup file; hands already here (same id) are kept as they are. */
function restore() {
  const input = h('input', { type: 'file', accept: 'application/json,.json' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as { hands?: Hand[] };
      if (!Array.isArray(data.hands)) throw new Error('no hands in file');
      const known = new Set(app.hands.map((x) => x.id));
      const added = data.hands.filter((x) => x && x.id && Array.isArray(x.events) && !known.has(x.id));
      commit(() => {
        app.hands.push(...added);
        app.showAllSessions = true;
      });
      toast(`Restored ${added.length} hand${added.length === 1 ? '' : 's'}`);
    } catch (err) {
      toast(`Restore failed: ${(err as Error).message}`);
    }
  });
  input.click();
}

const allText = (hands: Hand[]) => hands.map((x) => safeFormat(x, opts())).join('\n\n');

export function renderHistory(): HTMLElement {
  const hands = visibleHands();
  const stamp = date(Date.now());
  const item = (x: Hand, i: number) =>
    h(
      'article',
      { class: 'block hist' },
      h(
        'div',
        { class: 'row between muted' },
        h(
          'span',
          null,
          `#${i + 1} · ${time(x.createdAt)} · ${x.heroPos} ${x.heroCards.map((c) => cardText(c, true)).join('')}`,
        ),
        h('span', null, x.tags.join(', ')),
      ),
      h('pre', { class: 'preview' }, safeFormat(x, opts())),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'btn small primary',
            onClick: async () => toast((await copyText(safeFormat(x, opts()))) ? 'Copied ✓' : 'Copy failed'),
          },
          'Copy',
        ),
        h('button', { class: 'btn small', onClick: () => editHand(x.id) }, 'Edit'),
        h(
          'button',
          {
            class: 'btn small danger',
            onClick: () => confirm('Delete this hand?') && commit(() => (app.hands = app.hands.filter((y) => y.id !== x.id))),
          },
          'Delete',
        ),
      ),
    );

  return h(
    'main',
    { class: 'view' },
    h(
      'section',
      { class: 'block' },
      h('div', { class: 'row between' }, h('strong', null, `${hands.length} hand${hands.length === 1 ? '' : 's'}`),
        h(
          'label',
          { class: 'toggle' },
          h('input', {
            type: 'checkbox',
            checked: app.showAllSessions,
            onChange: () => commit(() => (app.showAllSessions = !app.showAllSessions)),
          }),
          ' all sessions',
        ),
      ),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'btn primary',
            disabled: !hands.length,
            onClick: async () => toast((await copyText(allText(hands))) ? 'Copied all ✓' : 'Copy failed'),
          },
          'Copy all',
        ),
        h(
          'button',
          { class: 'btn', disabled: !hands.length, onClick: () => download(`hands-${stamp}.txt`, allText(hands) + '\n', 'text/plain') },
          '.txt',
        ),
        h(
          'button',
          { class: 'btn', disabled: !hands.length, onClick: () => download(`hands-${stamp}.csv`, toCsv(hands), 'text/csv') },
          '.csv',
        ),
      ),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn small ghost', disabled: !app.hands.length, onClick: backup }, 'Backup (.json)'),
        h('button', { class: 'btn small ghost', onClick: restore }, 'Restore'),
      ),
    ),
    hands.length ? [...hands].reverse().map((x) => item(x, hands.indexOf(x))) : h('p', { class: 'muted center' }, 'No hands yet.'),
  );
}
