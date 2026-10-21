import type { Card } from './cards';
import { PREFLOP_ORDER, postflopOrder, type Pos, type TableSize } from './positions';

export type BoardStreet = 'flop' | 'turn' | 'river';
export type Street = 'preflop' | BoardStreet;
export const BOARD_STREETS: BoardStreet[] = ['flop', 'turn', 'river'];
export const BOARD_COUNT: Record<BoardStreet, number> = { flop: 3, turn: 1, river: 1 };

/** f fold, x check, c call, b bet, r raise, allin. */
export type Act = 'f' | 'x' | 'c' | 'b' | 'r' | 'allin';

/** `amount` is the player's total on this street ("r 55" = raise to 55). */
export interface ActionEvent {
  kind: 'action';
  pos: Pos;
  act: Act;
  amount?: number;
}

export interface BoardEvent {
  kind: 'board';
  street: BoardStreet;
  cards: Card[];
}

export type HandEvent = ActionEvent | BoardEvent;

export interface Stakes {
  sb: number;
  bb: number;
  currency: string;
}

export interface Showdown {
  pos: Pos;
  cards: Card[];
}

export interface Hand {
  id: string;
  sessionId: string;
  createdAt: number;
  stakes: Stakes;
  tableSize: TableSize;
  heroPos: Pos;
  heroCards: Card[];
  /** Villain names/labels by position, e.g. { btn: 'chris' }. */
  labels: Partial<Record<Pos, string>>;
  /** Known starting stacks by position (hero included). */
  stacks: Partial<Record<Pos, number>>;
  events: HandEvent[];
  /** Manual corrections of the street-start pot. */
  potOverrides: Partial<Record<BoardStreet, number>>;
  showdown: Showdown[];
  tags: string[];
  comment: string;
  /** Manual effective stack for the hand (otherwise computed from stacks). */
  effOverride?: number;
}

export interface LoggedAction {
  pos: Pos;
  act: Act;
  /** b/r/allin: total on street; c: total called to. */
  amount?: number;
  /** Folds inferred because a later player acted (or the next card was dealt). */
  implicit: boolean;
}

export interface StreetLog {
  street: Street;
  board: Card[];
  potStart: number;
  actions: LoggedAction[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Replays hand events and tracks pot, turn order and who is still in.
 * Skipping over players who were due to act folds them.
 */
export class Table {
  order: Pos[];
  street: Street = 'preflop';
  streets: StreetLog[];
  folded = new Set<Pos>();
  allIn = new Set<Pos>();
  contrib: Partial<Record<Pos, number>> = {};
  totalContrib: Partial<Record<Pos, number>> = {};
  currentBet: number;
  private base = 0;
  private acted = new Set<Pos>();
  private lastActor: Pos | null = null;

  constructor(private hand: Pick<Hand, 'tableSize' | 'stakes' | 'potOverrides'>) {
    this.order = PREFLOP_ORDER[hand.tableSize];
    this.streets = [{ street: 'preflop', board: [], potStart: 0, actions: [] }];
    this.put('sb', hand.stakes.sb);
    this.put('bb', hand.stakes.bb);
    this.currentBet = hand.stakes.bb;
  }

  get log(): StreetLog {
    return this.streets[this.streets.length - 1];
  }

  get pot(): number {
    return this.base + sum(Object.values(this.contrib) as number[]);
  }

  get potStart(): number {
    return this.log.potStart;
  }

  /** Players not folded, in current action order. */
  get players(): Pos[] {
    return this.order.filter((p) => !this.folded.has(p));
  }

  contribOf(p: Pos): number {
    return this.contrib[p] ?? 0;
  }

  toCall(p: Pos): number {
    return Math.max(0, this.currentBet - this.contribOf(p));
  }

  isDue(p: Pos): boolean {
    if (this.folded.has(p) || this.allIn.has(p)) return false;
    const owes = this.contribOf(p) < this.currentBet;
    const others = this.players.filter((q) => q !== p && !this.allIn.has(q)).length;
    if (!owes && others === 0) return false;
    return owes || !this.acted.has(p);
  }

  /** Players still due to act this round, starting with whoever is next. */
  get due(): Pos[] {
    const n = this.order.length;
    const start = this.lastActor ? this.order.indexOf(this.lastActor) + 1 : 0;
    const out: Pos[] = [];
    for (let i = 0; i < n; i++) {
      const p = this.order[(start + i) % n];
      if (this.isDue(p)) out.push(p);
    }
    return out;
  }

  get toAct(): Pos | null {
    return this.due[0] ?? null;
  }

  get roundClosed(): boolean {
    return this.due.length === 0;
  }

  get complete(): boolean {
    return this.players.length <= 1 || (this.street === 'river' && this.roundClosed);
  }

  /** The next board street, or null after the river. */
  get nextStreet(): BoardStreet | null {
    if (this.street === 'river') return null;
    return BOARD_STREETS[BOARD_STREETS.indexOf(this.street as BoardStreet) + 1];
  }

  get boardCards(): Card[] {
    return this.streets.flatMap((s) => s.board);
  }

  apply(e: HandEvent): void {
    if (e.kind === 'action') this.act(e);
    else this.deal(e);
  }

  private put(p: Pos, chips: number) {
    this.contrib[p] = this.contribOf(p) + chips;
    this.totalContrib[p] = (this.totalContrib[p] ?? 0) + chips;
  }

  private fold(p: Pos, implicit: boolean) {
    this.folded.add(p);
    this.log.actions.push({ pos: p, act: 'f', implicit });
  }

  private act(e: ActionEvent) {
    if (this.complete) throw new Error('Hand is over');
    const due = this.due;
    const i = due.indexOf(e.pos);
    if (i < 0) throw new Error(`${e.pos} is not due to act`);
    const skipped = due.slice(0, i);
    const left = this.players.length - skipped.length - (e.act === 'f' ? 1 : 0);
    if (skipped.length && e.act !== 'f' && left < 2)
      throw new Error(`Skipping ${skipped.join(', ')} would end the hand; fold them instead`);
    if (left < 1) throw new Error(`${e.pos} is the last player in`);
    for (const p of skipped) this.fold(p, true);

    const p = e.pos;
    const have = this.contribOf(p);
    const amount = e.amount ?? 0;
    let logged: LoggedAction = { pos: p, act: e.act, implicit: false };
    switch (e.act) {
      case 'f':
        this.fold(p, false);
        this.lastActor = p;
        return;
      case 'x':
        if (have < this.currentBet) throw new Error(`${p} cannot check facing a bet`);
        break;
      case 'c':
        if (have >= this.currentBet) throw new Error(`${p} has nothing to call`);
        logged.amount = this.currentBet;
        this.put(p, this.currentBet - have);
        break;
      case 'b':
        if (this.currentBet > 0) throw new Error('Cannot bet into a bet, raise instead');
        if (!(amount > 0)) throw new Error('Bet needs an amount');
        logged.amount = amount;
        this.raiseTo(p, amount);
        break;
      case 'r':
        if (this.currentBet === 0) throw new Error('Nothing to raise, bet instead');
        if (!(amount > this.currentBet)) throw new Error(`Raise must be more than ${this.currentBet}`);
        logged.amount = amount;
        this.raiseTo(p, amount);
        break;
      case 'allin':
        if (!(amount > have)) throw new Error('All-in needs an amount');
        logged.amount = amount;
        this.allIn.add(p);
        if (amount > this.currentBet) this.raiseTo(p, amount);
        else this.put(p, amount - have);
        break;
    }
    this.acted.add(p);
    this.lastActor = p;
    this.log.actions.push(logged);
  }

  private raiseTo(p: Pos, amount: number) {
    this.put(p, amount - this.contribOf(p));
    this.currentBet = amount;
    this.acted = new Set([p]);
  }

  private deal(e: BoardEvent) {
    if (this.players.length <= 1) throw new Error('Hand is over');
    if (e.street !== this.nextStreet) throw new Error(`Expected ${this.nextStreet ?? 'no more cards'}`);
    if (e.cards.length !== BOARD_COUNT[e.street]) throw new Error(`${e.street} needs ${BOARD_COUNT[e.street]} cards`);
    const due = this.due;
    if (this.players.length - due.length < 2) throw new Error(`Nobody has called yet: ${due.join(', ')} still to act`);
    for (const p of due) this.fold(p, true);
    this.returnUncalled();

    const override = this.hand.potOverrides[e.street];
    this.base = override ?? this.pot;
    this.contrib = {};
    this.currentBet = 0;
    this.acted = new Set();
    this.lastActor = null;
    this.order = postflopOrder(this.hand.tableSize);
    this.street = e.street;
    this.streets.push({ street: e.street, board: [...e.cards], potStart: this.base, actions: [] });
  }

  /** A bet nobody fully matched (e.g. a short all-in call) goes back to the bettor. */
  private returnUncalled() {
    const entries = Object.entries(this.contrib) as [Pos, number][];
    if (entries.length < 2) return;
    entries.sort((a, b) => b[1] - a[1]);
    const [[top, high], [, second]] = entries;
    if (high > second) {
      this.contrib[top] = second;
      this.totalContrib[top] = (this.totalContrib[top] ?? 0) - (high - second);
    }
  }
}

export function replay(hand: Pick<Hand, 'tableSize' | 'stakes' | 'potOverrides' | 'events'>): Table {
  const t = new Table(hand);
  for (const e of hand.events) t.apply(e);
  return t;
}

/** Returns an error message if the events don't replay cleanly. */
export function validate(hand: Pick<Hand, 'tableSize' | 'stakes' | 'potOverrides' | 'events'>): string | null {
  try {
    replay(hand);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

export function usedCards(hand: Hand): Set<Card> {
  const out = new Set<Card>(hand.heroCards);
  for (const e of hand.events) if (e.kind === 'board') e.cards.forEach((c) => out.add(c));
  for (const s of hand.showdown) s.cards.forEach((c) => out.add(c));
  return out;
}

/** Villains who did something other than fold. */
export function playingVillains(hand: Hand, t: Table): Pos[] {
  const out = new Set<Pos>();
  for (const s of t.streets) for (const a of s.actions) if (a.act !== 'f' && a.pos !== hand.heroPos) out.add(a.pos);
  return [...out];
}

/**
 * Effective stack in play at the start of the hand: hero's stack capped by the deepest
 * villain who plays. Unknown villain stacks count as covering hero.
 */
export function startingEffective(hand: Hand, t: Table): number | null {
  if (hand.effOverride != null) return hand.effOverride;
  const hero = hand.stacks[hand.heroPos];
  if (hero == null) return null;
  const villains = playingVillains(hand, t).map((p) => hand.stacks[p]);
  if (villains.length === 0 || villains.some((v) => v == null)) return hero;
  return Math.min(hero, Math.max(...(villains as number[])));
}

/** Hero's effective stack left behind, or null when hero's stack is unknown. */
export function effectiveStack(hand: Hand, t: Table): number | null {
  const left = (p: Pos) => {
    const s = hand.stacks[p];
    return s == null ? null : s - (t.totalContrib[p] ?? 0);
  };
  const hero = left(hand.heroPos);
  if (hero == null) return null;
  const villains = t.players.filter((p) => p !== hand.heroPos).map(left);
  if (villains.length === 0 || villains.some((v) => v == null)) return hero;
  return Math.min(hero, Math.max(...(villains as number[])));
}

/** Rounds to amounts people actually bet live: whole chips, and multiples of 5 from 20 up. */
function roundTo(n: number, bb: number): number {
  const step = bb < 2 ? 0.5 : n >= 20 ? 5 : 1;
  return Math.max(step, Math.round(n / step) * step);
}

export interface QuickSize {
  label: string;
  amount: number;
  primary?: boolean;
}

/**
 * Quick sizing buttons for a bet/raise by `p`. Preflop: open 2.5x/3x/4x the big blind,
 * or 3x/3.5x/4x the raise when facing one, plus a pot-sized raise. Postflop: pot fractions
 * (as a pot-sized raise fraction when facing a bet).
 */
export function quickSizes(t: Table, p: Pos, bb: number): QuickSize[] {
  const facing = t.currentBet;
  const potAfterCall = t.pot + t.toCall(p);
  const fraction = (f: number) => (facing > 0 ? facing + f * potAfterCall : f * t.pot);
  const size = (label: string, n: number, primary = false): QuickSize => ({ label, amount: roundTo(n, bb), primary });
  if (t.street === 'preflop') {
    const opened = facing > bb;
    const mults = opened ? [3, 3.5, 4] : [2.5, 3, 4];
    return [...mults.map((m) => size(`${m}x`, m * (opened ? facing : bb), true)), size('pot', fraction(1))];
  }
  const fractions: [string, number][] = [
    ['1/4', 1 / 4],
    ['1/3', 1 / 3],
    ['1/2', 1 / 2],
    ['2/3', 2 / 3],
    ['3/4', 3 / 4],
    ['pot', 1],
  ];
  return fractions.map(([label, f]) => size(label, fraction(f), true));
}
