/// <reference types="node" />
// Runs the importers on real Anki exports kept in test-data/private/ (git-ignored).
// Skipped automatically when those files are not present.

import fs from 'fs';
import path from 'path';

import { hasKanji } from '../../text/japanese';
import { detectDeckKind, detectKanjiColumns, detectWordColumns, profileColumns } from '../detect-columns';
import { importKanji } from '../import-kanji';
import { importWords } from '../import-words';
import { parseAnkiExport } from '../parse-export';

const dir = path.join(__dirname, '../../../../test-data/private');
const load = (name: string) => {
  const file = path.join(dir, name);
  return fs.existsSync(file) ? parseAnkiExport(fs.readFileSync(file, 'utf8')) : null;
};

const words = load('words.txt');
const rtk = load('rtk.txt');

(words ? describe : describe.skip)('real word deck', () => {
  const exp = words!;
  const profiles = profileColumns(exp);
  const mapping = detectWordColumns(profiles);
  const result = importWords(exp, mapping);

  it('detects the deck kind and columns', () => {
    expect(detectDeckKind(profiles)).toBe('words');
    expect(mapping).toEqual({ translation: 3, reading: 4, word: 5, furigana: 6 });
  });

  it('imports notes that all contain kanji', () => {
    expect(result.notes.length).toBeGreaterThan(300);
    expect(result.notes.every((n) => hasKanji(n.word) && n.reading !== '')).toBe(true);
  });

  it('cleans readings and words', () => {
    for (const note of result.notes) {
      expect(note.reading).not.toMatch(/[<>&\s]/);
      expect(note.word).not.toMatch(/[<>&\s]/);
    }
  });

  it('handles known tricky notes', () => {
    const find = (word: string) => result.notes.find((n) => n.word === word);
    expect(find('父')).toMatchObject({ reading: 'ちち', furigana: [{ text: '父', reading: 'ちち' }] });
    expect(find('伯母さん')?.alternatives).toContain('叔母さん');
    expect(find('お疲れ様でした')?.reading).toBe('おつかれさまでした');
    expect(find('〜着')?.reading).toBe('〜ちゃく');
    expect(find('月曜日')?.reading).toBe('げつようび');
    expect(find('月に1回')?.furigana).toBeDefined();
    expect(find('吊るす')?.alternatives).toContain('吊す');
    expect(find('旨く')).toMatchObject({ alternatives: ['上手く', '巧く'], furigana: expect.any(Array) });
  });

  it('prints an import summary', () => {
    const reasons: Record<string, number> = {};
    for (const s of result.skipped) reasons[s.reason] = (reasons[s.reason] ?? 0) + 1;
    console.log(
      `words: ${exp.rows.length} rows → ${result.notes.length} notes, ` +
        `${result.notes.filter((n) => n.furigana).length} with furigana, ` +
        `furigana ignored: ${result.furiganaIgnored}, skipped: ${JSON.stringify(reasons)}`,
    );
  });
});

(rtk ? describe : describe.skip)('real RTK deck', () => {
  const exp = rtk!;
  const profiles = profileColumns(exp);
  const mapping = detectKanjiColumns(profiles);
  const result = importKanji(exp, mapping);

  it('detects the deck kind and columns', () => {
    expect(detectDeckKind(profiles)).toBe('kanji');
    expect(mapping).toEqual({ frame: 4, kanji: 5, keyword: 7, onyomi: 20, kunyomi: 21 });
  });

  it('imports about 3000 kanji with keywords and frames', () => {
    expect(result.entries.length).toBeGreaterThanOrEqual(3000);
    const one = result.entries.find((e) => e.kanji === '一');
    expect(one).toMatchObject({ frame: 1, keyword: 'one', onyomi: ['イチ', 'イツ'] });
  });

  it('covers every kanji of the word deck', () => {
    if (!words) return;
    const known = new Set(result.entries.map((e) => e.kanji));
    const wordResult = importWords(words, detectWordColumns(profileColumns(words)));
    const missing = new Set(
      wordResult.notes.flatMap((n) => [...n.word].filter((ch) => hasKanji(ch) && ch !== '々' && !known.has(ch))),
    );
    expect([...missing]).toEqual([]);
  });
});
