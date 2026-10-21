export type Pos = 'utg' | 'utg1' | 'mp' | 'lj' | 'hj' | 'co' | 'btn' | 'sb' | 'bb';
export type TableSize = 6 | 9;

/** Preflop action order, first to act first. */
export const PREFLOP_ORDER: Record<TableSize, Pos[]> = {
  9: ['utg', 'utg1', 'mp', 'lj', 'hj', 'co', 'btn', 'sb', 'bb'],
  6: ['utg', 'hj', 'co', 'btn', 'sb', 'bb'],
};

/** Postflop action order: blinds first, button last. */
export function postflopOrder(size: TableSize): Pos[] {
  const pre = PREFLOP_ORDER[size];
  return [...pre.slice(-2), ...pre.slice(0, -2)];
}

/** Positions clockwise starting at the button (offset 0 = btn, 1 = sb, ...). */
function clockwiseFromButton(size: TableSize): Pos[] {
  return ['btn', 'sb', 'bb', ...PREFLOP_ORDER[size].slice(0, size - 3)];
}

/** Seats are numbered 1..size clockwise. */
export function positionOfSeat(seat: number, buttonSeat: number, size: TableSize): Pos {
  return clockwiseFromButton(size)[(((seat - buttonSeat) % size) + size) % size];
}

/** Button seat that puts `seat` on `pos`. */
export function buttonForSeatAt(seat: number, pos: Pos, size: TableSize): number {
  const offset = clockwiseFromButton(size).indexOf(pos);
  return ((((seat - 1 - offset) % size) + size) % size) + 1;
}
