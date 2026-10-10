/// <reference types="node" />
// Runs the distractor generator against the real bundled kanji database.

import fs from 'fs';
import path from 'path';

import { detectWordColumns, profileColumns } from '../../import/detect-columns';
import { importWords } from '../../import/import-words';
import { parseWordFile } from '../../import/word-file';
import { parseFurigana } from '../../text/furigana';
import { hasKanji } from '../../text/japanese';
import {
  acceptedSpellings,
  findCandidates,
  generateDistractors,
  pickDistractors,
  readingVariants,
  type Candidate,
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

  it('adds deck words that share a kanji and have the same kana layout', async () => {
    const candidates = await findCandidates(sofu, data, { deckWords: ['祖母', '家族', '父が'] });
    expect(candidates.find((c) => c.text === '祖母')?.source).toBe('deck');
    expect(candidates.map((c) => c.text)).not.toContain('家族'); // no shared kanji
    expect(candidates.map((c) => c.text)).not.toContain('父が'); // kana in a different place
  });

  it('adds both halves of a homophone that differs in two kanji', async () => {
    const candidates = await findCandidates(word('期間', 'きかん'), data);
    const texts = candidates.map((c) => c.text);
    expect(texts).toEqual(expect.arrayContaining(['機関', '機間', '期関']));
  });

  it('adds clearly different kanji, so even kanji without look-alikes get options', async () => {
    const candidates = await findCandidates(word('吊', 'つる'), data, { random: seeded(3) });
    expect(candidates.filter((c) => c.source === 'different').length).toBeGreaterThanOrEqual(3);
    expect(candidates.filter((c) => c.source === 'different').every((c) => c.looks === 0)).toBe(true);
  });
});

/** True when picking the most frequent kanji at each position singles out the correct answer. */
function majorityRevealsAnswer(options: string[], correct: string): boolean {
  const split = options.map((o) => [...o]);
  const counts = split[0].map((_, i) => {
    const m = new Map<string, number>();
    for (const o of split) m.set(o[i], (m.get(o[i]) ?? 0) + 1);
    return m;
  });
  const value = (o: string) => [...o].reduce((sum, ch, i) => sum + counts[i].get(ch)!, 0);
  const best = Math.max(...options.map(value));
  return value(correct) === best && options.filter((o) => value(o) === best).length === 1;
}

describe('pickDistractors', () => {
  const known = new Set([...'祖父母親子兄弟姉妹家族組粗阻助神社会員人大学生先月年日本語']);
  const isKnown = (k: string) => known.has(k);
  const pick = async (note: QuizWord, difficulty: 'easy' | 'normal' | 'hard', seed: number) => {
    const candidates = await findCandidates(note, data, { isKnown, random: seeded(5) });
    return pickDistractors(note.word, candidates, await acceptedSpellings(note, data), { difficulty, random: seeded(seed) });
  };

  it('never lets the most frequent kanji give the answer away', async () => {
    for (const note of [sofu, word('期間', 'きかん'), word('健康診断', 'けんこうしんだん'), word('電池が切れる', 'でんちがきれる')]) {
      for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        for (let seed = 1; seed <= 10; seed++) {
          const picked = await pick(note, difficulty, seed);
          expect(new Set(picked.map((p) => p.text)).size).toBe(3);
          expect(majorityRevealsAnswer([note.word, ...picked.map((p) => p.text)], note.word)).toBe(false);
        }
      }
    }
  });

  it('builds a 2×2 grid, using a real word as the corner when there is one', () => {
    const c = (text: string, changes: number[], score: number, source: Candidate['source'] = 'look-alike') =>
      ({ text, changes, score, source, looks: score, sounds: false, familiarity: 1 }) as Candidate;
    // Too few single replacements per position for "all change the same kanji", so a grid is the only option.
    const candidates = [c('機間', [0], 0.8), c('帰間', [0], 0.5), c('期関', [1], 0.8), c('機関', [0, 1], 0.9, 'homophone')];
    const picked = pickDistractors('期間', candidates, new Set(['期間']), { difficulty: 'hard', random: () => 0.5 });
    expect(picked.map((p) => p.text).sort()).toEqual(['期関', '機間', '機関'].sort());
    expect(picked.find((p) => p.text === '機関')?.source).toBe('homophone');

    // A corner that is an accepted spelling of the word is never used.
    const other = pickDistractors('期間', candidates, new Set(['期間', '機関']), { random: () => 0.5 });
    expect(other.map((p) => p.text)).not.toContain('機関');
    expect(other.map((p) => p.text).sort()).toEqual(['帰関', '帰間', '期関'].sort());
  });

  it('never replaces a kanji with another kanji of the same word', async () => {
    const candidates = await findCandidates(word('地域', 'ちいき'), data);
    expect(candidates.map((c) => c.text)).not.toContain('域域');
  });

  it('avoids rare kanji at every level', async () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (let seed = 1; seed <= 10; seed++) {
        expect((await pick(sofu, difficulty, seed)).every((c) => c.familiarity > 0.3)).toBe(true);
      }
    }
  });

  it('makes easy clearly different and hard the most confusable', async () => {
    const average = async (difficulty: 'easy' | 'normal' | 'hard', key: 'looks' | 'score') => {
      let sum = 0;
      for (let seed = 1; seed <= 30; seed++) for (const c of await pick(sofu, difficulty, seed)) sum += c[key];
      return sum / 90;
    };
    for (let seed = 1; seed <= 10; seed++) {
      expect((await pick(sofu, 'easy', seed)).every((c) => c.looks < 0.4 && c.source !== 'homophone')).toBe(true);
    }
    expect(await average('easy', 'looks')).toBeLessThan(0.2);
    expect(await average('hard', 'score')).toBeGreaterThan(await average('normal', 'score'));
    expect(await average('normal', 'score')).toBeGreaterThan(await average('easy', 'score'));
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
  it('builds 3 balanced distractors for every word at every difficulty', async () => {
    const exp = parseWordFile(fs.readFileSync(wordsFile, 'utf8'));
    const { notes } = importWords(exp, detectWordColumns(profileColumns(exp)));
    const deckWords = notes.map((n) => n.word);
    const known = new Set(deckWords.flatMap((w) => [...w].filter(hasKanji)));
    const random = seeded(42);
    const lines: string[] = [];
    const revealed: string[] = [];

    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (const note of notes) {
        const distractors = await generateDistractors(note, data, {
          isKnown: (k) => known.has(k),
          deckWords: deckWords.filter((w) => w !== note.word),
          difficulty,
          random,
        });
        expect(distractors).toHaveLength(3);
        for (const d of distractors) {
          expect(d.text).not.toBe(note.word);
          expect(note.alternatives).not.toContain(d.text);
        }
        if (majorityRevealsAnswer([note.word, ...distractors.map((d) => d.text)], note.word)) {
          revealed.push(`${difficulty} ${note.word}: ${distractors.map((d) => d.text).join(' ')}`);
        }
        if (difficulty === 'normal' && lines.length < 15 && notes.indexOf(note) % 23 === 0) {
          lines.push(`${note.word} (${note.reading}): ${distractors.map((d) => `${d.text} [${d.source}]`).join(', ')}`);
        }
      }
    }
    console.log(lines.join('\n'));
    expect(revealed).toEqual([]);
  });
});
