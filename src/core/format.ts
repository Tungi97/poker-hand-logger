import { cardText, type Card } from './cards';
import { playingVillains, replay, startingEffective, type Hand, type LoggedAction } from './engine';
import type { Pos } from './positions';

export interface FormatOptions {
  /** Full words ("raises to", "bets") and suit symbols instead of the compact PBT style. */
  verbose?: boolean;
  /** "Th Tc 2h" (default) or "ThTc2h". */
  spacedBoard?: boolean;
}

export const LEAK_TAGS = ['sizing', 'bluff', 'hero call', 'thin value', 'tilt'];

/** "15", "37.5" */
export function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}

const VERB: Record<LoggedAction['act'], string> = {
  f: 'folds',
  x: 'checks',
  c: 'calls',
  b: 'bets',
  r: 'raises to',
  allin: 'goes all-in for',
};

function actionText(a: LoggedAction, verbose: boolean): string {
  if (verbose) return a.amount != null ? `${VERB[a.act]} ${num(a.amount)}` : VERB[a.act];
  const showAmount = a.amount != null && a.act !== 'c';
  return showAmount ? `${a.act} ${num(a.amount!)}` : a.act;
}

function cardsText(cards: Card[], verbose: boolean, sep: string): string {
  return cards.map((c) => cardText(c, verbose)).join(sep);
}

/**
 * Formats a hand as PBT note text, one line per street:
 *
 *   eff 300 (60bb)
 *   utg r 15 hero hj AsKd r 55 chris btn c utg c
 *   170 flop Ad 7d 6s. x x chris b 60 f c
 *
 * The eff line appears when hero's stack (or a manual value) is known. Preflop names
 * each actor on first mention ("label pos" / "hero pos" / "pos") and leaves out folds
 * that were skipped. A labelled villain is called by the label on every street, but
 * only if they did more than fold; otherwise just the position. Postflop lists actions
 * without positions, prefixing only labelled villains. Hero's cards follow hero's
 * action when hero acts first in the hand, otherwise they follow the position. The
 * board is followed by "." except on the last street dealt.
 */
export function formatHand(hand: Hand, opts: FormatOptions = {}): string {
  const verbose = opts.verbose ?? false;
  const t = replay(hand);
  const isHero = (p: Pos) => p === hand.heroPos;
  const playing = new Set(playingVillains(hand, t));
  const label = (p: Pos) => (playing.has(p) ? hand.labels[p]?.trim() || '' : '');
  const name = (p: Pos) => (isHero(p) ? 'hero' : label(p) || p);
  const heroCards = hand.heroCards.length ? cardsText(hand.heroCards, verbose, '') : '';

  const lines: string[] = [];

  const eff = startingEffective(hand, t);
  if (eff != null) {
    const bbs = num(Math.round((eff / hand.stakes.bb) * 10) / 10);
    lines.push(verbose ? `effective stack ${num(eff)} (${bbs}bb)` : `eff ${num(eff)} (${bbs}bb)`);
  }

  // Preflop
  const mentioned = new Set<Pos>();
  const pre = t.streets[0].actions.filter((a) => !a.implicit);
  const parts: string[] = [];
  pre.forEach((a, i) => {
    const first = !mentioned.has(a.pos);
    mentioned.add(a.pos);
    const full = isHero(a.pos) || label(a.pos) ? `${name(a.pos)} ${a.pos}` : a.pos;
    const later = verbose || label(a.pos) ? name(a.pos) : a.pos;
    const who = first ? full : later;
    const act = actionText(a, verbose);
    if (!(first && isHero(a.pos) && heroCards)) parts.push(`${who} ${act}`);
    else if (verbose) parts.push(`${who} (${heroCards}) ${act}`);
    else if (i === 0) parts.push(`${who} ${act} ${heroCards}`);
    else parts.push(`${who} ${heroCards} ${act}`);
  });
  if (!mentioned.has(hand.heroPos) && heroCards) {
    parts.push(verbose ? `hero ${hand.heroPos} (${heroCards})` : `hero ${hand.heroPos} ${heroCards}`);
  }
  if (parts.length) lines.push(parts.join(verbose ? ', ' : ' '));

  // Postflop
  const post = t.streets.slice(1);
  post.forEach((s, i) => {
    const board = cardsText(s.board, verbose, (opts.spacedBoard ?? true) ? ' ' : '');
    let line = `${num(s.potStart)} ${s.street} ${board}`;
    if (s.actions.length) {
      const acts = s.actions.map((a) => {
        if (verbose) return `${name(a.pos)} ${actionText(a, true)}`;
        const l = label(a.pos);
        return l ? `${l} ${actionText(a, false)}` : actionText(a, false);
      });
      const last = i === post.length - 1;
      line += verbose ? `. ${acts.join(', ')}` : `${last ? '' : '.'} ${acts.join(' ')}`;
    }
    lines.push(line);
  });

  for (const s of hand.showdown) {
    if (s.cards.length) lines.push(`${name(s.pos)} shows ${cardsText(s.cards, verbose, '')}`);
  }

  const note = [hand.tags.join(', '), hand.comment.trim()].filter(Boolean).join(' - ');
  if (note) lines.push(note);

  return lines.join('\n');
}

/** Same as formatHand, but never throws (for display of possibly broken data). */
export function safeFormat(hand: Hand, opts: FormatOptions = {}): string {
  try {
    return formatHand(hand, opts);
  } catch (err) {
    return `(could not format: ${(err as Error).message})`;
  }
}
