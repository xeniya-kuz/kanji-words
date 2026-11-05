import { generateDistractors, type DistractorOptions, type QuizWord } from './distractors';
import type { KanjiData } from './kanji-data';
import { generateReadingDistractors } from './reading-distractors';
import { shuffle, type Direction } from './session';

export interface Question<W extends QuizWord = QuizWord> {
  note: W;
  direction: Direction;
  /** The correct answer (spelling or reading) plus distractors, shuffled. */
  options: string[];
  correctIndex: number;
}

export interface QuestionOptions extends DistractorOptions {
  direction?: Direction;
}

export async function buildQuestion<W extends QuizWord>(
  note: W,
  data: KanjiData,
  options: QuestionOptions = {},
): Promise<Question<W>> {
  const { direction = 'to-kanji', random = Math.random } = options;
  const answer = direction === 'to-kanji' ? note.word : note.reading;
  const distractors =
    direction === 'to-kanji'
      ? await generateDistractors(note, data, options)
      : await generateReadingDistractors(note, data, options);
  const all = shuffle([answer, ...distractors.map((d) => d.text)], random);
  return { note, direction, options: all, correctIndex: all.indexOf(answer) };
}
