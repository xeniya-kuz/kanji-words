import { isKanji } from '../text/japanese';

/** Fisher–Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Unique kanji of a text in order of appearance, without repeat marks: "段々" → ["段"]. */
export function kanjiOf(text: string): string[] {
  return [...new Set([...text].filter((ch) => isKanji(ch) && ch !== '々' && ch !== '〆'))];
}

/** Kanji in a wrong answer that the correct spelling doesn't have: ("祖父", "租父") → ["租"]. */
export function changedKanji(correct: string, chosen: string): string[] {
  const own = new Set(kanjiOf(correct));
  return kanjiOf(chosen).filter((k) => !own.has(k));
}

export type PromptMode = 'reading' | 'translation' | 'both';

export interface AnswerRecord<W> {
  note: W;
  chosen: string;
  correct: boolean;
}

export function score<W>(answers: AnswerRecord<W>[]): { correct: number; total: number } {
  return { correct: answers.filter((a) => a.correct).length, total: answers.length };
}
