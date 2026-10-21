/** A card is rank + suit letter, e.g. "As", "Td", "2c". */
export type Card = string;

export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;
export const SUITS = ['s', 'h', 'd', 'c'] as const;
export type Suit = (typeof SUITS)[number];

export const SUIT_SYMBOL: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

export function isCard(c: string): boolean {
  return c.length === 2 && (RANKS as readonly string[]).includes(c[0]) && (SUITS as readonly string[]).includes(c[1]);
}

/** "Qc" compact, "Q♣" verbose. */
export function cardText(c: Card, verbose = false): string {
  return verbose ? c[0] + SUIT_SYMBOL[c[1] as Suit] : c;
}
