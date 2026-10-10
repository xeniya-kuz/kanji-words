import type { KnownKanjiMode } from '../settings';
import type { KanjiInfo } from './kanji-data';
import { kanjiOf } from './session';

export interface KnownKanjiSources {
  deckWords: string[];
  /** Order numbers from the user's kanji deck, e.g. RTK frames (empty if none imported). */
  userFrames: Map<string, number>;
  /** The bundled kanji table, with frequency ranks and Jōyō grades. */
  bundled: KanjiInfo[];
}

/** The kanji the learner is considered to know, according to the "Kanji you know" setting. */
export function knownKanjiSet(mode: KnownKanjiMode, limit: number, sources: KnownKanjiSources): Set<string> {
  if (mode === 'deck') return new Set(sources.deckWords.flatMap(kanjiOf));
  if (mode === 'joyo') {
    return new Set(sources.bundled.filter((k) => k.grade != null && k.grade <= 8).map((k) => k.literal));
  }
  // Course: the order of the user's kanji deck; without one, how common the kanji are.
  if (sources.userFrames.size > 0) {
    return new Set([...sources.userFrames].filter(([, order]) => order <= limit).map(([kanji]) => kanji));
  }
  return new Set(sources.bundled.filter((k) => k.freq != null && k.freq <= limit).map((k) => k.literal));
}
