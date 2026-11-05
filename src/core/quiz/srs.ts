// Spaced repetition with Leitner boxes.
//
// A correct answer moves a word up one box and schedules it further away; a wrong answer puts it
// back in box 0, due again in 10 minutes. Words in box 3 or higher count as learned.

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

export interface SessionCounts {
  due: number;
  fresh: number;
  learned: number;
}

export function sessionCounts(noteIds: string[], progress: Map<string, Progress>, now: number): SessionCounts {
  let due = 0;
  let fresh = 0;
  let learned = 0;
  for (const id of noteIds) {
    const p = progress.get(id);
    if (!p) fresh++;
    else {
      if (p.dueAt <= now) due++;
      if (p.box >= LEARNED_BOX) learned++;
    }
  }
  return { due, fresh, learned };
}

/**
 * Picks the words for a session: due words first (most overdue first), then new words,
 * then — if there is still room — the least-known words that aren't due yet. The result is shuffled.
 */
export function selectSession<T extends { id: string }>(
  notes: T[],
  progress: Map<string, Progress>,
  size: number,
  now: number,
  random: () => number = Math.random,
): T[] {
  const due: T[] = [];
  const fresh: T[] = [];
  const rest: T[] = [];
  for (const note of notes) {
    const p = progress.get(note.id);
    if (!p) fresh.push(note);
    else if (p.dueAt <= now) due.push(note);
    else rest.push(note);
  }
  const at = (n: T) => progress.get(n.id)!;
  due.sort((a, b) => at(a).dueAt - at(b).dueAt);
  rest.sort((a, b) => at(a).box - at(b).box || at(a).dueAt - at(b).dueAt);

  const picked = [...due, ...shuffle(fresh, random), ...rest].slice(0, size);
  return shuffle(picked, random);
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

/** Due/new/learned counts over everything a setting practices; a word counts once per direction. */
export function modeCounts<T extends AskableWord>(
  notes: T[],
  progress: ProgressByDirection,
  mode: DirectionMode,
  now: number,
): SessionCounts {
  const total: SessionCounts = { due: 0, fresh: 0, learned: 0 };
  for (const direction of directionsOf(mode)) {
    const counts = sessionCounts(askableIn(notes, direction).map((n) => n.id), progress[direction], now);
    total.due += counts.due;
    total.fresh += counts.fresh;
    total.learned += counts.learned;
  }
  return total;
}

/**
 * Picks the questions for a session. Each direction is scheduled on its own progress; a mixed session
 * takes half from each and never asks the same word twice, since one answer would give away the other.
 */
export function selectSessionItems<T extends AskableWord>(
  notes: T[],
  progress: ProgressByDirection,
  mode: DirectionMode,
  size: number,
  now: number,
  random: () => number = Math.random,
): SessionItem<T>[] {
  const directions = directionsOf(mode);
  const share = Math.ceil(size / directions.length);
  const items = directions.flatMap((direction) =>
    selectSession(askableIn(notes, direction), progress[direction], share, now, random).map((note) => ({
      note,
      direction,
    })),
  );
  const seen = new Set<string>();
  const unique: SessionItem<T>[] = [];
  for (const item of shuffle(items, random)) {
    if (seen.has(item.note.id)) continue;
    seen.add(item.note.id);
    unique.push(item);
  }
  return unique.slice(0, size);
}
