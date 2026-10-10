import { generateDistractors, type DistractorOptions, type QuizWord } from './distractors';
import type { KanjiData } from './kanji-data';

export interface Question<W extends QuizWord = QuizWord> {
  note: W;
  /** The correct spelling plus distractors, shuffled. */
  options: string[];
  correctIndex: number;
}

export async function buildQuestion<W extends QuizWord>(
  note: W,
  data: KanjiData,
  options: DistractorOptions = {},
): Promise<Question<W>> {
  const random = options.random ?? Math.random;
  const distractors = await generateDistractors(note, data, options);
  const all = [note.word, ...distractors.map((d) => d.text)];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return { note, options: all, correctIndex: all.indexOf(note.word) };
}
