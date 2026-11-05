/// <reference types="node" />
// Runs the reading-distractor generator against the real bundled kanji database.

import path from 'path';

import { parseFurigana } from '../../text/furigana';
import type { QuizWord } from '../distractors';
import { createKanjiData } from '../kanji-data';
import { buildQuestion } from '../question';
import {
  canAskReading,
  findReadingCandidates,
  generateReadingDistractors,
  pickReadingDistractors,
} from '../reading-distractors';
import { selectSessionItems, type ProgressByDirection } from '../srs';

const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
const db = new DatabaseSync(path.join(__dirname, '../../../../assets/db/kanji.db'), { readOnly: true });
const data = createKanjiData(async <T>(sql: string, params: (string | number)[]) => db.prepare(sql).all(...params) as T[]);

/** Deterministic pseudo-random numbers so tests don't flake. */
const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const word = (w: string, reading: string, furigana?: string, alternatives: string[] = []): QuizWord => ({
  word: w,
  reading,
  alternatives,
  furigana: furigana ? parseFurigana(furigana) : undefined,
});

const gakkou = word('学校', 'がっこう', '学[がっ]校[こう]');
const sofu = word('祖父', 'そふ', '祖[そ]父[ふ]');
const kyou = word('今日', 'きょう', '今日[きょう]');
const yuumei = word('有名', 'ゆうめい', '有[ゆう]名[めい]');
const sanpo = word('散歩', 'さんぽ', '散[さん]歩[ぽ]');

describe('findReadingCandidates', () => {
  it('offers the mistakes learners make, never the right reading', async () => {
    const texts = (await findReadingCandidates(gakkou, data)).map((c) => c.text);
    expect(texts).toEqual(expect.arrayContaining(['がこう', 'がくこう', 'かっこう']));
    expect(texts).not.toContain('がっこう');
  });

  it('lengthens and shortens long vowels', async () => {
    const texts = (await findReadingCandidates(yuumei, data)).map((c) => c.text);
    expect(texts).toContain('ゆめい'); // う dropped
    expect(texts).toContain('ゆうめ'); // い dropped
    expect(texts).not.toContain('ゆうめい');
  });

  it('voices and unvoices sounds', async () => {
    const texts = (await findReadingCandidates(sanpo, data)).map((c) => c.text);
    expect(texts).toEqual(expect.arrayContaining(['さんほ', 'さんぼ']));
  });

  it('reads a kanji with one of its other readings, preferring the same kind', async () => {
    const candidates = await findReadingCandidates(word('勉強', 'べんきょう', '勉[べん]強[きょう]'), data);
    const other = candidates.filter((c) => c.source === 'other-reading');
    const gou = other.find((c) => c.text === 'べんごう'); // 強: キョウ → ゴウ, both on readings
    const kowa = other.find((c) => c.text === 'べんこわ'); // 強: キョウ → こわ, an on reading swapped for a kun one
    expect(gou).toBeDefined();
    expect(kowa).toBeDefined();
    expect(gou!.score).toBeGreaterThan(kowa!.score);
    expect(other.map((c) => c.text)).not.toContain('べんきょう');
  });

  it('only lengthens a vowel inside a word', async () => {
    const texts = (await findReadingCandidates(gakkou, data)).map((c) => c.text);
    expect(texts).not.toContain('がっこうう');
    for (const note of [sofu, word('聞く', 'きく', '聞[き]く')]) {
      const candidates = (await findReadingCandidates(note, data)).filter((c) => c.source === 'long-vowel');
      expect(candidates.every((c) => !c.text.endsWith('う') || c.text === 'そうふ')).toBe(true);
    }
  });

  it('never offers another reading of the same spelling', async () => {
    const texts = (await findReadingCandidates(kyou, data)).map((c) => c.text);
    expect(texts).not.toContain('こんにち');
    expect(texts).not.toContain('きょう');
  });

  it('always finds enough candidates, even for a two-sound word', async () => {
    const candidates = await findReadingCandidates(word('山', 'やま', '山[やま]'), data);
    expect(candidates.length).toBeGreaterThanOrEqual(3);
  });
});

describe('pickReadingDistractors', () => {
  it('picks 3 different wrong readings of mixed kinds', async () => {
    for (const note of [gakkou, sofu, yuumei, sanpo, kyou]) {
      for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        const picked = await generateReadingDistractors(note, data, { difficulty, random: seeded(7) });
        expect(picked).toHaveLength(3);
        expect(new Set(picked.map((p) => p.text)).size).toBe(3);
        expect(picked.map((p) => p.text)).not.toContain(note.reading);
      }
    }
  });

  it('prefers plausible slips on hard and clearly off ones on easy', async () => {
    const candidates = await findReadingCandidates(gakkou, data);
    const average = (difficulty: 'easy' | 'hard') => {
      const runs = Array.from({ length: 20 }, (_, i) =>
        pickReadingDistractors(candidates, { difficulty, random: seeded(i + 1) }),
      );
      return runs.flat().reduce((sum, c) => sum + c.score, 0) / (runs.length * 3);
    };
    expect(average('hard')).toBeGreaterThan(average('easy'));
  });
});

describe('buildQuestion', () => {
  it('asks for the reading with the reading as the correct option', async () => {
    const q = await buildQuestion(gakkou, data, { direction: 'to-reading', random: seeded(3) });
    expect(q.direction).toBe('to-reading');
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
    expect(q.options[q.correctIndex]).toBe('がっこう');
  });

  it('still asks for the spelling by default', async () => {
    const q = await buildQuestion(sofu, data, { random: seeded(3) });
    expect(q.direction).toBe('to-kanji');
    expect(q.options[q.correctIndex]).toBe('祖父');
  });
});

describe('canAskReading', () => {
  it('needs kanji and a hiragana reading', () => {
    expect(canAskReading({ word: '学校', reading: 'がっこう' })).toBe(true);
    expect(canAskReading({ word: 'ありがとう', reading: 'ありがとう' })).toBe(false);
    expect(canAskReading({ word: '今日', reading: 'キョウ' })).toBe(false);
  });
});

describe('selectSessionItems', () => {
  const notes = [
    { id: '1', word: '学校', reading: 'がっこう' },
    { id: '2', word: '祖父', reading: 'そふ' },
    { id: '3', word: 'ありがとう', reading: 'ありがとう' },
  ];
  const empty: ProgressByDirection = { 'to-kanji': new Map(), 'to-reading': new Map() };

  it('skips words without kanji for reading questions only', () => {
    const reading = selectSessionItems(notes, empty, 'to-reading', 10, 0, seeded());
    expect(reading.map((i) => i.note.id).sort()).toEqual(['1', '2']);
    const spelling = selectSessionItems(notes, empty, 'to-kanji', 10, 0, seeded());
    expect(spelling.map((i) => i.note.id).sort()).toEqual(['1', '2', '3']);
  });

  it('mixes both directions without asking a word twice', () => {
    const items = selectSessionItems(notes, empty, 'mixed', 10, 0, seeded());
    expect(new Set(items.map((i) => i.note.id)).size).toBe(items.length);
  });

  it('schedules each direction on its own progress', () => {
    const learned = { noteId: '1', box: 3, dueAt: 10 ** 12, correct: 3, wrong: 0, lastSeen: 0 };
    const progress: ProgressByDirection = { 'to-kanji': new Map([['1', learned]]), 'to-reading': new Map() };
    // Word 1 is not due for spelling, but new for reading, so reading comes first.
    const reading = selectSessionItems(notes, progress, 'to-reading', 1, 0, seeded());
    expect(reading).toHaveLength(1);
    const spelling = selectSessionItems(notes, progress, 'to-kanji', 2, 0, seeded());
    expect(spelling.map((i) => i.note.id)).not.toContain('1');
  });
});
