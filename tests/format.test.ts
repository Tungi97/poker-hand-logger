import { describe, expect, it } from 'vitest';
import { formatHand } from '../src/core/format';
import { a, board, makeHand } from './helpers';

// The two example notes from BRIEF.md, built the way the UI builds them.
const example1 = makeHand({
  stakes: { sb: 5, bb: 5, currency: 'CHF' },
  heroPos: 'utg',
  heroCards: ['Qc', 'Jc'],
  events: [
    a('utg', 'r', 15),
    a('btn', 'c'), // utg1..co are skipped = folded
    board('flop', 'Th Tc 2h'), // blinds never acted = folded
    a('utg', 'x'),
    a('btn', 'b', 15),
    a('utg', 'r', 75),
    a('btn', 'c'),
    board('turn', '5d'),
    a('utg', 'b', 150),
    a('btn', 'f'),
  ],
});

// Pot 170 = 3 x 55 + 5 in blinds, so this hand was played at 2/3.
const example2 = makeHand({
  stakes: { sb: 2, bb: 3, currency: 'CHF' },
  heroPos: 'hj',
  heroCards: ['As', 'Kd'],
  labels: { btn: 'chris' },
  events: [
    a('utg', 'r', 15),
    a('hj', 'r', 55),
    a('btn', 'c'),
    a('utg', 'c'),
    board('flop', 'Ad 7d 6s'),
    a('utg', 'x'),
    a('hj', 'x'),
    a('btn', 'b', 60),
    a('utg', 'f'),
    a('hj', 'c'),
    board('turn', '3s'),
    a('hj', 'x'),
    a('btn', 'b', 200),
    a('hj', 'c'),
    board('river', 'Qs'),
    a('hj', 'x'),
    a('btn', 'x'),
  ],
  showdown: [{ pos: 'btn', cards: ['7h', '6h'] }],
});

describe('golden notes from BRIEF.md', () => {
  it('example 1', () => {
    expect(formatHand(example1)).toBe(
      ['hero utg r 15 QcJc btn c', '40 flop Th Tc 2h. x b 15 r 75 c', '190 turn 5d b 150 f'].join('\n'),
    );
  });

  it('example 2 (unspaced flop; labelled villain named on every street)', () => {
    expect(formatHand(example2, { spacedBoard: false })).toBe(
      [
        'utg r 15 hero hj AsKd r 55 chris btn c utg c',
        '170 flop Ad7d6s. x x chris b 60 f c',
        '290 turn 3s. x chris b 200 c',
        '690 river Qs x chris x',
        'chris shows 7h6h',
      ].join('\n'),
    );
  });

  it('6-max gives the same text', () => {
    expect(formatHand({ ...example1, tableSize: 6 })).toBe(formatHand(example1));
    expect(formatHand({ ...example2, tableSize: 6 })).toBe(formatHand(example2));
  });
});

describe('verbose', () => {
  it('example 1', () => {
    expect(formatHand(example1, { verbose: true })).toBe(
      [
        'hero utg (Q♣J♣) raises to 15, btn calls 15',
        '40 flop T♥ T♣ 2♥. hero checks, btn bets 15, hero raises to 75, btn calls 75',
        '190 turn 5♦. hero bets 150, btn folds',
      ].join('\n'),
    );
  });

  it('example 2 uses labels and suit symbols', () => {
    expect(formatHand(example2, { verbose: true })).toBe(
      [
        'utg raises to 15, hero hj (A♠K♦) raises to 55, chris btn calls 55, utg calls 55',
        '170 flop A♦ 7♦ 6♠. utg checks, hero checks, chris bets 60, utg folds, hero calls 60',
        '290 turn 3♠. hero checks, chris bets 200, hero calls 200',
        '690 river Q♠. hero checks, chris checks',
        'chris shows 7♥6♥',
      ].join('\n'),
    );
  });
});

describe('formatter details', () => {
  it('names a labelled villain by position only if they just folded preflop', () => {
    const h = makeHand({
      heroPos: 'co',
      heroCards: ['Ah', 'Kh'],
      labels: { sb: 'jan', bb: 'chris', btn: 'ted' },
      events: [a('co', 'r', 15), a('btn', 'f'), a('sb', 'f'), a('bb', 'r', 50), a('co', 'c')],
    });
    expect(formatHand(h)).toBe('hero co r 15 AhKh btn f sb f chris bb r 50 co c');
  });

  it('keeps the label on later preflop mentions', () => {
    const h = makeHand({
      heroPos: 'utg',
      labels: { btn: 'chris' },
      events: [a('utg', 'r', 15), a('btn', 'r', 45), a('utg', 'r', 120), a('btn', 'c')],
    });
    expect(formatHand(h)).toBe('hero utg r 15 chris btn r 45 utg r 120 chris c');
  });

  it('starts with the effective stack of hero vs the villains who play', () => {
    const base = { ...example1, stacks: { utg: 500, btn: 300, sb: 2000 } };
    expect(formatHand(base).split('\n')[0]).toBe('eff 300 (60bb)');
    // villain stack unknown: hero's stack is what's in play
    expect(formatHand({ ...base, stacks: { utg: 500 } }).split('\n')[0]).toBe('eff 500 (100bb)');
    // manual value wins
    expect(formatHand({ ...base, effOverride: 250 }).split('\n')[0]).toBe('eff 250 (50bb)');
    expect(formatHand(base, { verbose: true }).split('\n')[0]).toBe('effective stack 300 (60bb)');
  });

  it('appends tags and comment as the last line', () => {
    const h = { ...example1, tags: ['sizing', 'thin value'], comment: 'should bet smaller' };
    expect(formatHand(h).split('\n').at(-1)).toBe('sizing, thin value - should bet smaller');
    expect(formatHand({ ...example1, comment: 'gg' }).split('\n').at(-1)).toBe('gg');
  });

  it('prints explicit preflop folds but not skipped ones', () => {
    const h = makeHand({
      heroPos: 'bb',
      heroCards: ['9s', '9h'],
      events: [a('co', 'r', 20), a('bb', 'r', 70), a('co', 'f')],
    });
    expect(formatHand(h)).toBe('co r 20 hero bb 9s9h r 70 co f');
  });

  it('shows hero cards even if hero has not acted yet', () => {
    const h = makeHand({ heroPos: 'btn', heroCards: ['Ah', 'Ad'], events: [a('utg', 'r', 15)] });
    expect(formatHand(h)).toBe('utg r 15 hero btn AhAd');
  });

  it('prints skipped postflop players as folds so the sequence still reads', () => {
    const h = makeHand({
      heroPos: 'btn',
      events: [
        a('utg', 'c'),
        a('btn', 'c'),
        a('bb', 'x'),
        board('flop', 'Ks 8d 2c'),
        a('utg', 'b', 10), // bb skipped
        a('btn', 'c'),
      ],
    });
    expect(formatHand(h).split('\n')[1]).toBe('20 flop Ks 8d 2c f b 10 c');
  });

  it('formats all-in and a runout without actions', () => {
    const h = makeHand({
      heroPos: 'sb',
      heroCards: ['Ks', 'Kh'],
      events: [
        a('btn', 'r', 15),
        a('sb', 'allin', 500),
        a('btn', 'c'),
        board('flop', '2c 3d 4h'),
        board('turn', '5s'),
        board('river', '6c'),
      ],
    });
    expect(formatHand(h)).toBe(
      ['btn r 15 hero sb KsKh allin 500 btn c', '1005 flop 2c 3d 4h', '1005 turn 5s', '1005 river 6c'].join('\n'),
    );
  });

  it('respects a manual pot override', () => {
    const h = { ...example1, potOverrides: { flop: 45 } };
    expect(formatHand(h).split('\n').slice(1)).toEqual(['45 flop Th Tc 2h. x b 15 r 75 c', '195 turn 5d b 150 f']);
  });

  it('keeps decimals in amounts', () => {
    const h = makeHand({ stakes: { sb: 1, bb: 2, currency: '' }, events: [a('utg', 'r', 5.5)] });
    expect(formatHand(h)).toBe('hero utg r 5.5');
  });
});
