import type { Direction } from '@/core/quiz/session';

/** Short labels for the two directions, used by the practice picker, stats and the word list. */
export const DIRECTION_LABEL: Record<Direction, string> = {
  'to-kanji': 'Reading → kanji',
  'to-reading': 'Kanji → reading',
};

/** The same, for tight spaces. */
export const DIRECTION_SHORT: Record<Direction, string> = {
  'to-kanji': 'Kanji',
  'to-reading': 'Reading',
};
