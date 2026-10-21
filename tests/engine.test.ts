import { describe, expect, it } from 'vitest';
import { effectiveStack, quickSizes, replay, validate } from '../src/core/engine';
import { buttonForSeatAt, positionOfSeat } from '../src/core/positions';
import { a, board, makeHand } from './helpers';

describe('Table', () => {
  it('starts preflop with blinds in and utg to act', () => {
    const t = replay(makeHand({ stakes: { sb: 2, bb: 3, currency: '' } }));
    expect(t.pot).toBe(5);
    expect(t.toAct).toBe('utg');
    expect(t.currentBet).toBe(3);
  });

  it('folds skipped players and moves on to whoever is next', () => {
    const t = replay(makeHand({ events: [a('utg', 'r', 15), a('btn', 'c')] }));
    expect(t.folded).toEqual(new Set(['utg1', 'mp', 'lj', 'hj', 'co']));
    expect(t.toAct).toBe('sb');
    expect(t.pot).toBe(40);
  });

  it('closes the round once everyone has matched', () => {
    const t = replay(makeHand({ events: [a('utg', 'r', 15), a('btn', 'c'), board('flop', 'Th Tc 2h'), a('utg', 'x')] }));
    expect(t.street).toBe('flop');
    expect(t.order[0]).toBe('sb');
    expect(t.toAct).toBe('btn');
    const t2 = replay(makeHand({ events: [a('utg', 'r', 15), a('btn', 'c'), board('flop', 'Th Tc 2h'), a('utg', 'x'), a('btn', 'x')] }));
    expect(t2.roundClosed).toBe(true);
    expect(t2.complete).toBe(false);
  });

  it('gives the big blind the option', () => {
    const t = replay(makeHand({ heroPos: 'bb', stakes: { sb: 2, bb: 3, currency: '' }, events: [a('btn', 'c'), a('sb', 'c')] }));
    expect(t.toAct).toBe('bb');
    expect(t.toCall('bb')).toBe(0);
  });

  it('ends the hand when everyone else folds', () => {
    const t = replay(makeHand({ events: [a('utg', 'r', 15), a('bb', 'f')] }));
    expect(t.complete).toBe(true);
  });

  it('rejects illegal actions', () => {
    expect(validate(makeHand({ events: [a('utg', 'x')] }))).toMatch(/cannot check/);
    expect(validate(makeHand({ events: [a('utg', 'r', 5)] }))).toMatch(/more than 5/);
    expect(validate(makeHand({ events: [a('utg', 'r', 15), a('utg', 'c')] }))).toMatch(/not due/);
    expect(validate(makeHand({ events: [board('turn', '2c')] }))).toMatch(/Expected flop/);
  });

  it('never lets skips or folds leave nobody in the hand', () => {
    // utg and btn left; tapping btn and folding would also fold utg
    const two = [a('utg', 'r', 15), a('btn', 'c'), board('flop', 'Th Tc 2h')];
    expect(validate(makeHand({ events: [...two, a('btn', 'f')] }))).toMatch(/last player in/);
    expect(validate(makeHand({ events: [...two, a('btn', 'b', 10)] }))).toMatch(/would end the hand/);
    // dealing the flop before anyone called the open
    expect(validate(makeHand({ events: [a('utg', 'r', 15), board('flop', 'Th Tc 2h')] }))).toMatch(/Nobody has called/);
    // ...but folding everyone explicitly ends the hand normally
    expect(validate(makeHand({ events: [...two, a('utg', 'b', 20), a('btn', 'f')] }))).toBeNull();
  });

  it('returns an uncalled part of a bet', () => {
    const t = replay(
      makeHand({
        events: [a('utg', 'r', 100), a('btn', 'allin', 60), board('flop', '2c 3d 4h')],
      }),
    );
    expect(t.potStart).toBe(130);
  });

  it('skips action when only one player is not all-in', () => {
    const t = replay(makeHand({ events: [a('utg', 'allin', 200), a('btn', 'c'), board('flop', '2c 3d 4h')] }));
    expect(t.roundClosed).toBe(true);
    expect(t.nextStreet).toBe('turn');
  });
});

describe('sizing and stacks', () => {
  const sizesOf = (t: ReturnType<typeof replay>, p: 'utg' | 'btn') =>
    Object.fromEntries(quickSizes(t, p, 5).map((s) => [s.label, s.amount]));

  it('offers 2.5x/3x/4x opens and 3x/3.5x/4x 3-bets preflop', () => {
    const pre = replay(makeHand({ stakes: { sb: 5, bb: 5, currency: '' } }));
    expect(sizesOf(pre, 'utg')).toEqual({ '2.5x': 13, '3x': 15, '4x': 20, pot: 20 });
    expect(quickSizes(pre, 'utg', 5).filter((s) => s.primary).map((s) => s.label)).toEqual(['2.5x', '3x', '4x']);

    const facing = replay(makeHand({ events: [a('utg', 'r', 15)] }));
    expect(sizesOf(facing, 'btn')).toMatchObject({ '3x': 45, '3.5x': 55, '4x': 60 });
  });

  it('offers pot fractions postflop', () => {
    const flop = replay(makeHand({ events: [a('utg', 'r', 15), a('btn', 'c'), board('flop', 'Th Tc 2h')] }));
    expect(sizesOf(flop, 'utg')).toEqual({ '1/4': 10, '1/3': 13, '1/2': 20, '2/3': 25, '3/4': 30, pot: 40 });
  });

  it('computes effective stack from known stacks', () => {
    const h = makeHand({
      stacks: { utg: 500, btn: 300 },
      events: [a('utg', 'r', 15), a('btn', 'c'), board('flop', 'Th Tc 2h')],
    });
    const t = replay(h);
    expect(effectiveStack(h, t)).toBe(285);
    expect(effectiveStack({ ...h, stacks: { utg: 500 } }, t)).toBe(485);
    expect(effectiveStack({ ...h, stacks: {} }, t)).toBeNull();
  });
});

describe('positions', () => {
  it('maps seats to positions from the button', () => {
    expect(positionOfSeat(5, 5, 9)).toBe('btn');
    expect(positionOfSeat(6, 5, 9)).toBe('sb');
    expect(positionOfSeat(4, 5, 9)).toBe('co');
    expect(positionOfSeat(3, 5, 6)).toBe('hj');
    // when the button moves on, hero goes btn -> co
    expect(positionOfSeat(5, 6, 9)).toBe('co');
  });

  it('finds the button for a wanted hero position', () => {
    for (const size of [6, 9] as const) {
      for (let seat = 1; seat <= size; seat++) {
        for (const pos of ['btn', 'sb', 'bb', 'utg', 'co'] as const) {
          expect(positionOfSeat(seat, buttonForSeatAt(seat, pos, size), size)).toBe(pos);
        }
      }
    }
  });
});
