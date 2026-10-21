import type { Act, BoardStreet, Hand, HandEvent } from '../src/core/engine';
import type { Pos } from '../src/core/positions';

export const a = (pos: Pos, act: Act, amount?: number): HandEvent => ({ kind: 'action', pos, act, amount });
export const board = (street: BoardStreet, cards: string): HandEvent => ({
  kind: 'board',
  street,
  cards: cards.split(' '),
});

export function makeHand(h: Partial<Hand>): Hand {
  return {
    id: 'test',
    sessionId: 'test',
    createdAt: 0,
    stakes: { sb: 5, bb: 5, currency: 'CHF' },
    tableSize: 9,
    heroPos: 'utg',
    heroCards: [],
    labels: {},
    stacks: {},
    events: [],
    potOverrides: {},
    showdown: [],
    tags: [],
    comment: '',
    ...h,
  };
}
