import type { Difficulty } from './quiz/distractors';
import type { PromptMode } from './quiz/session';

/**
 * Which kanji count as "known" when ranking wrong answers:
 * deck   kanji that appear in the learner's words
 * course the first N kanji in the order of the learner's kanji deck (RTK frames, lessons, …),
 *        or the N most common kanji when no kanji deck is imported
 * joyo   all Jōyō kanji
 */
export type KnownKanjiMode = 'deck' | 'course' | 'joyo';

export interface Settings {
  promptMode: PromptMode;
  sessionSize: number;
  difficulty: Difficulty;
  knownKanji: KnownKanjiMode;
  /** With knownKanji = 'course': kanji 1..courseLimit are known. */
  courseLimit: number;
  /** Decks left out of practice. New decks are included automatically. */
  excludedDecks: string[];
}

export const SESSION_SIZES = [10, 20, 50] as const;
export const MAX_COURSE_LIMIT = 6000;

export const DEFAULT_SETTINGS: Settings = {
  promptMode: 'both',
  sessionSize: 20,
  difficulty: 'normal',
  knownKanji: 'deck',
  courseLimit: 500,
  excludedDecks: [],
};

const oneOf = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Validates stored settings, falling back to defaults for anything missing or invalid. */
export function normalizeSettings(raw: unknown): Settings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings | 'rtkFrame', unknown>>;
  const d = DEFAULT_SETTINGS;
  // Earlier versions called the course option "rtk" and its limit "rtkFrame".
  const knownKanji = s.knownKanji === 'rtk' ? 'course' : s.knownKanji;
  const courseLimit = s.courseLimit ?? s.rtkFrame;
  return {
    promptMode: oneOf(s.promptMode, ['reading', 'translation', 'both'] as const, d.promptMode),
    sessionSize: oneOf(s.sessionSize, SESSION_SIZES, d.sessionSize as (typeof SESSION_SIZES)[number]),
    difficulty: oneOf(s.difficulty, ['easy', 'normal', 'hard'] as const, d.difficulty),
    knownKanji: oneOf(knownKanji, ['deck', 'course', 'joyo'] as const, d.knownKanji),
    courseLimit:
      typeof courseLimit === 'number' && Number.isFinite(courseLimit)
        ? Math.min(MAX_COURSE_LIMIT, Math.max(1, Math.round(courseLimit)))
        : d.courseLimit,
    excludedDecks: Array.isArray(s.excludedDecks)
      ? s.excludedDecks.filter((x): x is string => typeof x === 'string')
      : d.excludedDecks,
  };
}
