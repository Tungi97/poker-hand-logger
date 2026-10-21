import type { Hand, Stakes } from './core/engine';
import { positionOfSeat, type Pos, type TableSize } from './core/positions';

export interface Seat {
  label: string;
  stack?: number;
}

export interface Session {
  id: string;
  createdAt: number;
  stakes: Stakes;
  tableSize: TableSize;
  heroSeat: number;
  buttonSeat: number;
  /** Move the button one seat on for each new hand. */
  autoRotate: boolean;
  /** Index 0 = seat 1. */
  seats: Seat[];
  heroStack?: number;
  verbose: boolean;
  spacedBoard: boolean;
}

export type View = 'hand' | 'history' | 'setup';

interface Saved {
  session: Session | null;
  hands: Hand[];
  current: Hand | null;
}

export interface AppState extends Saved {
  view: View;
  showAllSessions: boolean;
}

const KEY = 'phl:v1';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function emptySeats(size: number, old: Seat[] = []): Seat[] {
  return Array.from({ length: size }, (_, i) => old[i] ?? { label: '' });
}

export function newSession(prev?: Session | null): Session {
  return {
    id: uid(),
    createdAt: Date.now(),
    stakes: prev?.stakes ?? { sb: 5, bb: 5, currency: 'CHF' },
    tableSize: prev?.tableSize ?? 9,
    heroSeat: prev?.heroSeat ?? 1,
    buttonSeat: prev?.buttonSeat ?? 1,
    autoRotate: prev?.autoRotate ?? true,
    seats: emptySeats(prev?.tableSize ?? 9),
    heroStack: prev?.heroStack,
    verbose: prev?.verbose ?? false,
    spacedBoard: prev?.spacedBoard ?? true,
  };
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Saved;
  } catch {
    // corrupted or unavailable storage: start fresh
  }
  return { session: null, hands: [], current: null };
}

const saved = load();
export const app: AppState = { ...saved, view: saved.session ? 'hand' : 'setup', showAllSessions: false };

export function persist(): void {
  try {
    const { session, hands, current } = app;
    localStorage.setItem(KEY, JSON.stringify({ session, hands, current }));
  } catch {
    // storage full or blocked; the app keeps working in memory
  }
}

let renderFn: () => void = () => {};
export function onRender(fn: () => void): void {
  renderFn = fn;
}

/** Mutate state, save it, re-render. */
export function commit(mutate: () => void = () => {}): void {
  mutate();
  persist();
  renderFn();
}

/** Copies seat labels/stacks onto the hand's positions for the session's current button. */
export function snapshotSeats(s: Session, hand: Hand): void {
  hand.labels = {};
  hand.stacks = {};
  s.seats.forEach((seat, i) => {
    const pos: Pos = positionOfSeat(i + 1, s.buttonSeat, s.tableSize);
    if (i + 1 === s.heroSeat) {
      if (s.heroStack != null) hand.stacks[pos] = s.heroStack;
      return;
    }
    if (seat.label.trim()) hand.labels[pos] = seat.label.trim();
    if (seat.stack != null) hand.stacks[pos] = seat.stack;
  });
}

export function createHand(s: Session): Hand {
  const hand: Hand = {
    id: uid(),
    sessionId: s.id,
    createdAt: Date.now(),
    stakes: { ...s.stakes },
    tableSize: s.tableSize,
    heroPos: positionOfSeat(s.heroSeat, s.buttonSeat, s.tableSize),
    heroCards: [],
    labels: {},
    stacks: {},
    events: [],
    potOverrides: {},
    showdown: [],
    tags: [],
    comment: '',
  };
  snapshotSeats(s, hand);
  return hand;
}

/** Adds or replaces the hand in history. */
export function upsertHand(hand: Hand): void {
  const copy = structuredClone(hand);
  const i = app.hands.findIndex((h) => h.id === hand.id);
  if (i >= 0) app.hands[i] = copy;
  else app.hands.push(copy);
}

export function isBlank(hand: Hand): boolean {
  return hand.events.length === 0 && hand.heroCards.length === 0 && !hand.comment && hand.tags.length === 0;
}
