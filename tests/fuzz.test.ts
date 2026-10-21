import { describe, expect, it } from 'vitest';
import { RANKS, SUITS } from '../src/core/cards';
import { BOARD_COUNT, quickSizes, replay, validate, type Act, type Hand, type HandEvent } from '../src/core/engine';
import { formatHand } from '../src/core/format';
import { PREFLOP_ORDER, type Pos } from '../src/core/positions';
import { makeHand } from './helpers';

/** Small deterministic PRNG so failures are reproducible from the seed. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const DECK = SUITS.flatMap((s) => RANKS.map((r) => r + s));

/** Plays a random hand the way a user would tap it: mostly in order, sometimes skipping or dealing early. */
function randomHand(seed: number): Hand {
  const rand = rng(seed);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const tableSize = rand() < 0.5 ? 6 : 9;
  const bb = pick([2, 3, 5, 10]);
  const order = PREFLOP_ORDER[tableSize];
  const labels: Partial<Record<Pos, string>> = {};
  for (const p of order) if (rand() < 0.3) labels[p] = pick(['chris', 'jan', 'ted', 'reg']);
  const deck = [...DECK].sort(() => rand() - 0.5);
  const heroPos = pick(order);
  const hand = makeHand({
    tableSize,
    stakes: { sb: bb / 2, bb, currency: '' },
    heroPos,
    heroCards: deck.splice(0, 2),
    labels,
    stacks: rand() < 0.5 ? { [heroPos]: bb * pick([40, 100, 250]) } : {},
  });

  for (let step = 0; step < 60; step++) {
    const t = replay(hand);
    if (t.complete) break;
    let e: HandEvent;
    const dealEarly = t.street === 'preflop' && t.boardCards.length === 0 && rand() < 0.08;
    if ((t.roundClosed || dealEarly) && t.nextStreet) {
      e = { kind: 'board', street: t.nextStreet, cards: deck.splice(0, BOARD_COUNT[t.nextStreet]) };
    } else {
      const due = t.due;
      const p = rand() < 0.8 ? due[0] : pick(due);
      const toCall = t.toCall(p);
      const acts: Act[] = toCall > 0 ? ['f', 'c', 'c', 'r', 'allin'] : ['x', 'x', t.currentBet ? 'r' : 'b', 'allin'];
      const act = pick(acts);
      let amount: number | undefined;
      if (act === 'b' || act === 'r') amount = pick(quickSizes(t, p, bb)).amount;
      if (act === 'allin') amount = t.contribOf(p) + bb * pick([1, 20, 100]);
      e = { kind: 'action', pos: p, act, amount };
    }
    if (validate({ ...hand, events: [...hand.events, e] }) == null) hand.events.push(e);
  }
  if (rand() < 0.3) hand.showdown = [{ pos: pick(order.filter((p) => p !== heroPos)), cards: deck.splice(0, 2) }];
  return hand;
}

const N = 3000;

describe(`fuzz: ${N} random hands`, () => {
  const hands = Array.from({ length: N }, (_, i) => randomHand(i + 1));

  it('every generated hand and every prefix of it replays (so undo always works)', () => {
    for (const h of hands) {
      for (let k = 0; k <= h.events.length; k++) {
        expect(() => replay({ ...h, events: h.events.slice(0, k) }), `seed hand ${h.events.length}`).not.toThrow();
      }
    }
  });

  it('chips are conserved: the pot is exactly what players put in', () => {
    for (const h of hands) {
      const t = replay(h);
      const put = Object.values(t.totalContrib).reduce((a, b) => a + (b ?? 0), 0);
      expect(t.pot).toBeCloseTo(put, 6);
      for (const v of Object.values(t.totalContrib)) expect(v).toBeGreaterThanOrEqual(0);
      const starts = t.streets.slice(1).map((s) => s.potStart);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
    }
  });

  it('formats every hand to clean, well-formed text', () => {
    for (const h of hands) {
      for (const verbose of [false, true]) {
        const text = formatHand(h, { verbose });
        expect(text).not.toMatch(/undefined|NaN|null|Infinity|\s{2}|\s$/m);
        expect(text).toBe(text.trim());
      }
      // postflop lines: "<pot> <street> <board>[.] [label] act [label] act ..."
      const t = replay(h);
      const post = formatHand(h)
        .split('\n')
        .filter((l) => / (flop|turn|river) /.test(l));
      expect(post.length).toBe(t.streets.length - 1);
      const label = `(?:(?:${[...new Set(Object.values(h.labels))].join('|') || '_'}) )?`;
      const act = `${label}(?:x|c|f|(?:b|r|allin) \\d+(?:\\.\\d+)?)`;
      post.forEach((line, i) => {
        const s = t.streets[i + 1];
        const head = `${Number(s.potStart.toFixed(2))} ${s.street} ${s.board.join(' ')}`;
        expect(line.startsWith(head)).toBe(true);
        expect(line.slice(head.length)).toMatch(new RegExp(`^(\\.? ${act}(?: ${act})*)?$`));
      });
    }
  });

  it('a closed round means everyone left has matched the bet or is all-in', () => {
    for (const h of hands) {
      for (let k = 0; k <= h.events.length; k++) {
        const t = replay({ ...h, events: h.events.slice(0, k) });
        if (!t.roundClosed) continue;
        for (const p of t.players) {
          if (!t.allIn.has(p)) expect(t.contribOf(p)).toBeGreaterThanOrEqual(t.currentBet);
        }
      }
      expect(replay(h).players.length).toBeGreaterThanOrEqual(1);
    }
  });
});
