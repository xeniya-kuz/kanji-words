// Spaced repetition with Leitner boxes.
//
// A correct answer moves a word up one box and schedules it further away; a wrong answer puts it
// back in box 0, due again in 10 minutes. Words in box 3 or higher count as learned.
// How much is practiced per day follows Anki: a limit for new words and one for reviews.

import { canAskReading } from './reading-distractors';
import { DIRECTIONS, shuffle, type Direction, type DirectionMode } from './session';

export interface Progress {
  noteId: string;
  box: number;
  /** Timestamp (ms) when the word should be practiced again. */
  dueAt: number;
  correct: number;
  wrong: number;
  lastSeen: number;
}

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** Interval after reaching box N (index = box). */
export const BOX_INTERVALS = [10 * MINUTE, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY, 75 * DAY];
export const MAX_BOX = BOX_INTERVALS.length - 1;
export const LEARNED_BOX = 3;

export function schedule(previous: Progress | undefined, noteId: string, correct: boolean, now: number): Progress {
  // Practicing a word before it is due doesn't move it up: a correct early answer keeps its box.
  if (previous && correct && previous.dueAt > now) {
    return { ...previous, correct: previous.correct + 1, lastSeen: now };
  }
  const box = correct ? Math.min(MAX_BOX, (previous?.box ?? 0) + 1) : 0;
  return {
    noteId,
    box,
    dueAt: now + BOX_INTERVALS[box],
    correct: (previous?.correct ?? 0) + (correct ? 1 : 0),
    wrong: (previous?.wrong ?? 0) + (correct ? 0 : 1),
    lastSeen: now,
  };
}

/** Progress of every word, one map per direction. */
export type ProgressByDirection = Record<Direction, Map<string, Progress>>;

export interface SessionItem<T> {
  note: T;
  direction: Direction;
}

type AskableWord = { id: string; word: string; reading: string };

/** The directions a setting practices. */
export const directionsOf = (mode: DirectionMode): readonly Direction[] => (mode === 'mixed' ? DIRECTIONS : [mode]);

/** Words that can be asked in a direction: "spelling → reading" needs kanji and a hiragana reading. */
export function askableIn<T extends AskableWord>(notes: T[], direction: Direction): T[] {
  return direction === 'to-reading' ? notes.filter(canAskReading) : notes;
}

export interface SessionCounts {
  due: number;
  fresh: number;
  learned: number;
}

/** The daily limits, as in Anki's deck options. */
export interface DailyLimits {
  newPerDay: number;
  reviewsPerDay: number;
}

/** What was already practiced today, in questions: a word counts once per direction. */
export interface TodayStats {
  newDone: number;
  reviewsDone: number;
}

export interface Queue<T> {
  /** Today's questions in random order. */
  items: SessionItem<T>[];
  /** Questions in `items` about words never seen before. */
  fresh: number;
  /** Questions in `items` about words that are due. */
  due: number;
}

/**
 * Today's queue, the way Anki builds it:
 * - words in box 0 (missed, back in 10 minutes) always come back, they are not limited;
 * - due words from higher boxes, most overdue first, up to the daily review limit minus the reviews done today;
 * - new words, up to the daily new limit minus the new words started today.
 * Nothing else is added, so the queue can be empty: that means "done for today". Each direction is scheduled
 * on its own progress; in a mixed queue a word is asked only once, since one answer would give away the other.
 */
export function buildQueue<T extends AskableWord>(
  notes: T[],
  progress: ProgressByDirection,
  mode: DirectionMode,
  limits: DailyLimits,
  today: TodayStats,
  now: number,
  random: () => number = Math.random,
): Queue<T> {
  const learning: SessionItem<T>[] = [];
  const review: SessionItem<T>[] = [];
  const fresh: SessionItem<T>[] = [];
  for (const direction of directionsOf(mode)) {
    for (const note of askableIn(notes, direction)) {
      const p = progress[direction].get(note.id);
      const item = { note, direction };
      if (!p) fresh.push(item);
      else if (p.dueAt <= now) (p.box === 0 ? learning : review).push(item);
    }
  }
  const dueAt = (item: SessionItem<T>) => progress[item.direction].get(item.note.id)!.dueAt;
  const overdueFirst = (a: SessionItem<T>, b: SessionItem<T>) => dueAt(a) - dueAt(b);

  const asked = new Set<string>();
  const take = (candidates: SessionItem<T>[], limit: number) => {
    const taken: SessionItem<T>[] = [];
    for (const item of candidates) {
      if (taken.length >= limit) break;
      if (asked.has(item.note.id)) continue;
      asked.add(item.note.id);
      taken.push(item);
    }
    return taken;
  };
  const relearn = take(learning.sort(overdueFirst), Infinity);
  const reviews = take(review.sort(overdueFirst), Math.max(0, limits.reviewsPerDay - today.reviewsDone));
  const introduced = take(shuffle(fresh, random), Math.max(0, limits.newPerDay - today.newDone));
  return {
    items: shuffle([...relearn, ...reviews, ...introduced], random),
    fresh: introduced.length,
    due: relearn.length + reviews.length,
  };
}

/** Due/new/learned counts for the home screen. Due and new are what today's queue holds, learned is everything. */
export function modeCounts<T extends AskableWord>(
  notes: T[],
  progress: ProgressByDirection,
  mode: DirectionMode,
  limits: DailyLimits,
  today: TodayStats,
  now: number,
): SessionCounts {
  const { fresh, due } = buildQueue(notes, progress, mode, limits, today, now);
  let learned = 0;
  for (const direction of directionsOf(mode)) {
    for (const note of askableIn(notes, direction)) {
      if ((progress[direction].get(note.id)?.box ?? 0) >= LEARNED_BOX) learned++;
    }
  }
  return { due, fresh, learned };
}

/** How many questions "practice ahead" offers at a time. */
export const EXTRA_PRACTICE_SIZE = 20;

/**
 * Extra practice once the day's queue is done (Anki's "study ahead"): words that were started but aren't due yet,
 * the least known first. Never new words — those are limited by the daily setting.
 */
export function selectExtraItems<T extends AskableWord>(
  notes: T[],
  progress: ProgressByDirection,
  mode: DirectionMode,
  size: number,
  now: number,
  random: () => number = Math.random,
): SessionItem<T>[] {
  const ahead: { item: SessionItem<T>; p: Progress }[] = [];
  for (const direction of directionsOf(mode)) {
    for (const note of askableIn(notes, direction)) {
      const p = progress[direction].get(note.id);
      if (p && p.dueAt > now) ahead.push({ item: { note, direction }, p });
    }
  }
  ahead.sort((a, b) => a.p.box - b.p.box || a.p.dueAt - b.p.dueAt);
  const asked = new Set<string>();
  const picked: SessionItem<T>[] = [];
  for (const { item } of ahead) {
    if (picked.length >= size) break;
    if (asked.has(item.note.id)) continue;
    asked.add(item.note.id);
    picked.push(item);
  }
  return shuffle(picked, random);
}
