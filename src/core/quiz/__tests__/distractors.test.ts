/// <reference types="node" />
// Runs the distractor generator against the real bundled kanji database.

import fs from 'fs';
import path from 'path';

import { detectWordColumns, profileColumns } from '../../anki/detect-columns';
import { importWords } from '../../anki/import-words';
import { parseAnkiExport } from '../../anki/parse-export';
import { parseFurigana } from '../../text/furigana';
import { hasKanji } from '../../text/japanese';
import {
  acceptedSpellings,
  findCandidates,
  generateDistractors,
  pickDistractors,
  readingVariants,
  type QuizWord,
} from '../distractors';
import { createKanjiData } from '../kanji-data';
import { buildQuestion } from '../question';

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

const sofu = word('祖父', 'そふ', '祖[そ]父[ふ]');

describe('readingVariants', () => {
  it('undoes rendaku and gemination', () => {
    expect(readingVariants('が')).toEqual(['が', 'か']);
    expect(readingVariants('しゅっ')).toEqual(['しゅっ', 'しゅつ', 'しゅく', 'しゅち', 'しゅき']);
    expect(readingVariants('ゾク')).toEqual(['ぞく', 'そく']);
  });
});

describe('acceptedSpellings', () => {
  it('includes JMdict variants of the same entry but not homophones', async () => {
    const accepted = await acceptedSpellings(word('伯母さん', 'おばさん'), data);
    expect(accepted.has('叔母さん')).toBe(true);
    expect(accepted.has('小母さん')).toBe(false); // a different word ("ma'am")
    const kikan = await acceptedSpellings(word('期間', 'きかん'), data);
    expect(kikan.has('機関')).toBe(false);
  });
});

describe('findCandidates', () => {
  it('replaces one kanji with look-alikes and same-reading kanji', async () => {
    const candidates = await findCandidates(sofu, data);
    const texts = candidates.map((c) => c.text);
    expect(texts).toEqual(expect.arrayContaining(['阻父', '租父', '粗父']));
    expect(candidates.find((c) => c.text === '素父')?.source).toBe('same-reading');
    expect(texts).not.toContain('祖父');
    expect(candidates.every((c) => [...c.text].length === 2)).toBe(true);
  });

  it('offers real homophones', async () => {
    const candidates = await findCandidates(word('期間', 'きかん'), data);
    const homophones = candidates.filter((c) => c.source === 'homophone').map((c) => c.text);
    expect(homophones).toEqual(expect.arrayContaining(['機関', '帰還', '気管']));
  });

  it('never offers another spelling of the same word', async () => {
    const candidates = await findCandidates(word('伯母さん', 'おばさん', undefined, ['叔母さん']), data);
    expect(candidates.map((c) => c.text)).not.toContain('叔母さん');
  });

  it('keeps kana and repeat marks unchanged', async () => {
    const candidates = await findCandidates(word('電池が切れる', 'でんちがきれる'), data);
    expect(candidates.length).toBeGreaterThan(3);
    for (const c of candidates) expect(c.text).toMatch(/^..が.れる$/);
    for (const c of await findCandidates(word('段々', 'だんだん'), data)) expect(c.text).toMatch(/^.々$/);
  });

  it('prefers kanji the learner knows', async () => {
    const known = new Set(['祖', '父', '粗']);
    const candidates = await findCandidates(sofu, data, { isKnown: (k) => known.has(k) });
    // 粗 both looks like 祖 and is read そ, so it ranks first.
    expect(candidates[0].text).toBe('粗父');
  });

  it('adds deck words that share a kanji, and swapped kanji', async () => {
    const candidates = await findCandidates(sofu, data, { deckWords: ['祖母', '家族', '父が'] });
    expect(candidates.find((c) => c.text === '祖母')?.source).toBe('deck');
    expect(candidates.map((c) => c.text)).not.toContain('家族'); // no shared kanji
    expect(candidates.map((c) => c.text)).not.toContain('父が'); // kana in a different place
    expect(candidates.find((c) => c.text === '父祖')?.source).toBe('swap');
  });

  it('falls back to random kanji when nothing similar exists', async () => {
    const candidates = await findCandidates(word('吊', 'つる'), data, { random: seeded(3) });
    expect(candidates.length).toBeGreaterThanOrEqual(3);
  });
});

describe('pickDistractors', () => {
  it('picks distinct candidates spread over positions', async () => {
    const candidates = await findCandidates(sofu, data);
    for (let seed = 1; seed <= 20; seed++) {
      const picked = pickDistractors(candidates, { random: seeded(seed) });
      expect(new Set(picked.map((p) => p.text)).size).toBe(3);
      const slots = picked.map((p) => p.slot).filter((s) => s != null);
      expect(slots.filter((s) => s === 0).length).toBeLessThanOrEqual(2);
    }
  });
});

describe('buildQuestion', () => {
  it('returns 4 shuffled options with the correct one marked', async () => {
    const question = await buildQuestion(sofu, data, { random: seeded(7) });
    expect(question.options).toHaveLength(4);
    expect(new Set(question.options).size).toBe(4);
    expect(question.options[question.correctIndex]).toBe('祖父');
  });
});

const wordsFile = path.join(__dirname, '../../../../test-data/private/words.txt');
(fs.existsSync(wordsFile) ? describe : describe.skip)('real word deck', () => {
  it('builds 3 distractors for every word', async () => {
    const exp = parseAnkiExport(fs.readFileSync(wordsFile, 'utf8'));
    const { notes } = importWords(exp, detectWordColumns(profileColumns(exp)));
    const deckWords = notes.map((n) => n.word);
    const known = new Set(deckWords.flatMap((w) => [...w].filter(hasKanji)));
    const random = seeded(42);
    const lines: string[] = [];

    for (const note of notes) {
      const distractors = await generateDistractors(note, data, {
        isKnown: (k) => known.has(k),
        deckWords: deckWords.filter((w) => w !== note.word),
        random,
      });
      expect(distractors).toHaveLength(3);
      for (const d of distractors) {
        expect(d.text).not.toBe(note.word);
        expect(note.alternatives).not.toContain(d.text);
      }
      if (lines.length < 30 && notes.indexOf(note) % 11 === 0) {
        lines.push(`${note.word} (${note.reading}): ${distractors.map((d) => `${d.text} [${d.source}]`).join(', ')}`);
      }
    }
    console.log(lines.join('\n'));
  });
});
