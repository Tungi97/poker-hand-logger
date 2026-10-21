// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Tap budget: the brief wants a hand logged in ~15-20 s at the table.
 * At roughly 0.6 s per deliberate tap that is about 25-30 taps per hand.
 */
const TAP_BUDGET = 30;
/** A four-street multiway hand with showdown, like example 2. */
const LONG_HAND_BUDGET = 40;

let taps = 0;
let copied = '';

function tap(el: HTMLElement | null | undefined, what: string) {
  if (!el || (el as HTMLButtonElement).disabled) throw new Error(`Can't tap ${what}`);
  taps++;
  el.click();
}

const btn = (text: string, sel = 'button') =>
  [...document.querySelectorAll<HTMLButtonElement>(sel)].find((b) => b.textContent?.trim() === text && !b.disabled);
const press = (text: string) => tap(btn(text), text);
const chip = (pos: string) =>
  tap(
    [...document.querySelectorAll<HTMLButtonElement>('.chip')].find((b) => b.querySelector('.chip-pos')?.textContent === pos),
    pos,
  );
const cards = (...cs: string[]) => cs.forEach((c) => tap(document.querySelector(`.cell[aria-label="${c}"]`), c));
const quick = (label: string) =>
  tap([...document.querySelectorAll<HTMLButtonElement>('.quick .btn')].find((b) => b.querySelector('span')?.textContent === label), label);
const type = (digits: string) => {
  for (const k of digits) tap(btn(k, '.key'), k);
  press('OK');
};

function setInput(el: HTMLInputElement, v: string) {
  el.value = v;
  el.dispatchEvent(new Event('change'));
}

beforeAll(async () => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => void (copied = t) } });
  await import('../src/main');
});

describe('taps per hand', () => {
  it('example 1 fits the tap budget', async () => {
    // one-off session setup is not counted
    tap(btn('utg', '.field .pill'), 'utg');
    press('Log hands ▸');
    taps = 0;

    tap(document.querySelector('.cards-btn'), 'hero cards');
    cards('Qc', 'Jc');
    press('Raise'); // utg is already selected as next to act
    quick('3x'); // 15
    chip('btn');
    press('Call 15');
    press('Flop ▸');
    cards('Th', 'Tc', '2h');
    press('Check');
    press('Bet');
    type('15');
    press('Raise');
    type('75');
    press('Call 60'); // round closes, turn picker opens
    cards('5d');
    press('Bet');
    type('150');
    press('Fold');
    press('Copy');
    await new Promise((r) => setTimeout(r, 0));

    expect(copied).toBe(['hero utg r 15 QcJc btn c', '40 flop Th Tc 2h. x b 15 r 75 c', '190 turn 5d b 150 f'].join('\n'));
    console.log(`example 1: ${taps} taps`);
    expect(taps).toBeLessThanOrEqual(TAP_BUDGET);
  });

  it('example 2 fits the tap budget', async () => {
    press('Next hand ▸'); // hero card picker opens by itself (counted from here)
    taps = 1;
    cards('As', 'Kd');
    // hero moved utg -> bb with the button; put hero back on the hijack and label the button
    tap(btn('hj', '.hero-block .pill'), 'hj');
    press('Setup');
    const btnSeat = [...document.querySelectorAll('.seat')].find((s) => s.querySelector('.seat-pos')?.textContent === 'btn')!;
    setInput(btnSeat.querySelector('input')!, 'chris');
    const [sb, bb] = [...document.querySelectorAll<HTMLInputElement>('.grid3 input')];
    setInput(sb, '2');
    setInput(bb, '3');
    press('Hand');
    taps -= 3; // hj pill, Setup, Hand: only needed because the test changes seats mid-session

    press('Raise');
    type('15');
    chip('hj');
    press('Raise');
    type('55');
    chip('btn');
    press('Call 55');
    chip('utg');
    press('Call 40'); // closes preflop: flop picker opens
    cards('Ad', '7d', '6s');
    press('Check');
    press('Check');
    press('Bet');
    type('60');
    press('Fold');
    press('Call 60');
    cards('3s');
    press('Check');
    press('Bet');
    tap(btn('2', '.key'), '2');
    tap(btn('00', '.key'), '00');
    press('OK');
    press('Call 200');
    cards('Qs');
    press('Check');
    press('Check');
    cards('7h', '6h');
    press('Copy');
    await new Promise((r) => setTimeout(r, 0));

    expect(copied).toBe(
      [
        'utg r 15 hero hj AsKd r 55 chris btn c utg c',
        '170 flop Ad 7d 6s. x x chris b 60 f c',
        '290 turn 3s. x chris b 200 c',
        '690 river Qs x chris x',
        'chris shows 7h6h',
      ].join('\n'),
    );
    console.log(`example 2: ${taps} taps`);
    expect(taps).toBeLessThanOrEqual(LONG_HAND_BUDGET);
  });
});
