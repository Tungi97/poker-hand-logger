// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';

let copied = '';

function buttons(selector = 'button'): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>(selector)];
}

function click(text: string, selector = 'button') {
  const b = buttons(selector).find((x) => x.textContent?.trim() === text && !x.disabled);
  if (!b) throw new Error(`No enabled button "${text}" (${selector})`);
  b.click();
}

function chip(pos: string) {
  const b = buttons('.chip').find((x) => x.querySelector('.chip-pos')?.textContent === pos);
  if (!b) throw new Error(`No chip ${pos}`);
  b.click();
}

function cards(...cs: string[]) {
  for (const c of cs) document.querySelector<HTMLButtonElement>(`.cell[aria-label="${c}"]`)!.click();
}

function amount(n: string) {
  for (const k of n) click(k, '.key');
  click('OK');
}

function change(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('change'));
}

const preview = () => document.getElementById('preview')!.textContent;

beforeAll(async () => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async (t: string) => void (copied = t) },
  });
  await import('../src/main');
});

describe('UI smoke test', () => {
  it('logs example 2 from the brief by tapping through it', async () => {
    // Setup: 2/3, hero on the hijack, villain "chris" on the button, unspaced flop
    const [sb, bb] = [...document.querySelectorAll<HTMLInputElement>('.grid3 input')];
    change(sb, '2');
    change(bb, '3');
    click('hj', '.field .pill');
    const btnSeat = [...document.querySelectorAll('.seat')].find((s) => s.querySelector('.seat-pos')?.textContent === 'btn')!;
    change(btnSeat.querySelector('input')!, 'Chris');
    document.querySelectorAll<HTMLInputElement>('.toggle input')[1].click();
    expect(buttons().some((b) => b.textContent === 'me')).toBe(false);
    click('Log hands ▸');

    document.querySelector<HTMLButtonElement>('.cards-btn')!.click();
    cards('As', 'Kd');

    chip('utg');
    click('Raise');
    expect(buttons('.quick.primary .btn').map((b) => b.querySelector('span')!.textContent)).toEqual(['2.5x', '3x', '4x']);
    // a quick size submits straight away: 3x the 3 big blind
    buttons('.quick.primary .btn')[1].click();
    expect(document.querySelector('.backdrop')).toBeNull();
    expect(preview()).toBe('utg r 9 hero hj AsKd');
    click('↶ Undo');
    chip('utg');
    click('Raise');
    amount('15');
    chip('hj');
    click('Raise');
    amount('55');
    chip('btn');
    click('Call 55');
    // tapping btn again takes the call back; tapping skipped co revives co
    chip('btn');
    expect(preview()).toBe('utg r 15 hero hj AsKd r 55');
    chip('btn');
    click('Call 55');
    chip('co');
    expect(document.querySelector('.pad-head b')?.textContent).toBe('co');
    expect(preview()).toBe('utg r 15 hero hj AsKd r 55');
    chip('btn');
    click('Call 55');
    chip('utg');
    click('Call 40');
    // blinds are skipped = folded, the round closes and the flop picker opens
    cards('Ad', '7d', '6s');

    click('Check');
    click('Check');
    click('Bet');
    amount('60');
    click('Fold');
    click('Call 60'); // closes the round: turn picker opens by itself
    cards('3s');

    click('Check');
    click('Bet');
    amount('200');
    click('Call 200');
    cards('Qs');

    click('Check');
    click('Check');
    expect(document.querySelector('.pad-head')?.textContent).toBe('Hand complete');

    cards('7h', '6h');

    const golden = [
      'utg r 15 hero hj AsKd r 55 chris btn c utg c',
      '170 flop Ad7d6s. x x chris b 60 f c',
      '290 turn 3s. x chris b 200 c',
      '690 river Qs x chris x',
      'chris shows 7h6h',
    ].join('\n');
    expect(preview()).toBe(golden);

    click('Copy');
    await new Promise((r) => setTimeout(r, 0));
    expect(copied).toBe(golden);
  });

  it('lets me set the effective stack and puts it first', () => {
    click('eff ?');
    amount('300');
    expect(preview().split('\n')[0]).toBe('eff 300 (100bb)');
    click('↺');
    expect(preview()).not.toContain('eff');
  });

  it('undoes the last thing logged', () => {
    click('↶ Undo'); // showdown
    click('↶ Undo'); // river check
    expect(preview()).toContain('690 river Qs x');
    expect(preview()).not.toContain('shows');
  });

  it('saves to history and starts the next hand with the button moved', () => {
    click('Next hand ▸');
    click('Cancel'); // hero card picker opens automatically
    expect(document.querySelector('.hero-block .pill.on')?.textContent).toBe('lj'); // hj -> lj in 9-max
    click('History 1', '.tab');
    expect(document.querySelectorAll('.hist').length).toBe(1);
    expect(document.querySelector('.hist .preview')?.textContent).toContain('690 river Qs x');
  });
});
