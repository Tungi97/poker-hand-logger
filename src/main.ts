import './style.css';
import { app, commit, onRender, type View } from './store';
import { h } from './ui/dom';
import { renderHand } from './ui/hand-view';
import { renderHistory } from './ui/history-view';
import { closeOverlay, renderOverlay } from './ui/overlays';
import { renderSetup } from './ui/setup-view';

const root = document.getElementById('app')!;

const TABS: [View, string][] = [
  ['hand', 'Hand'],
  ['history', 'History'],
  ['setup', 'Setup'],
];

function render() {
  const scroll = window.scrollY;
  const view = !app.session ? renderSetup() : app.view === 'history' ? renderHistory() : app.view === 'setup' ? renderSetup() : renderHand();
  const nav = h(
    'nav',
    { class: 'tabs' },
    TABS.map(([v, label]) =>
      h(
        'button',
        {
          class: `tab${app.view === v ? ' on' : ''}`,
          disabled: !app.session && v !== 'setup',
          onClick: () => commit(() => (app.view = v)),
        },
        label,
        v === 'history' && app.session ? h('small', null, ` ${app.hands.filter((x) => x.sessionId === app.session!.id).length}`) : null,
      ),
    ),
  );
  root.replaceChildren(nav, view, ...[renderOverlay()].filter((x): x is HTMLElement => x != null));
  window.scrollTo(0, scroll);
}

onRender(render);
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeOverlay());
render();

// ask the browser not to evict saved hands under storage pressure
navigator.storage?.persist?.().catch(() => {});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
