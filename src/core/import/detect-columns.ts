// Guesses which column of an Anki export holds which field, by looking at the content.
// The result is only a proposal: the import screen shows it to the user to confirm or fix.

import { hasFuriganaMarkup, htmlToText } from '../text/html';
import {
  hasKanji,
  isHiraganaOnly,
  isJapanese,
  isKanaOnly,
  isKanji,
  isKatakanaOnly,
} from '../text/japanese';
import type { WordFile } from './word-file';

export type DeckKind = 'words' | 'kanji';
export type WordRole = 'word' | 'reading' | 'translation' | 'furigana';
export type KanjiRole = 'kanji' | 'keyword' | 'frame' | 'onyomi' | 'kunyomi';

export const REQUIRED_ROLES: { words: WordRole[]; kanji: KanjiRole[] } = {
  words: ['word', 'reading', 'translation'],
  kanji: ['kanji'],
};

/** Role → 0-based column index. */
export type ColumnMapping<R extends string> = Partial<Record<R, number>>;

export interface ColumnProfile {
  index: number;
  name?: string;
  /** Set for columns Anki itself declared in the header; they are never mapped to a role. */
  reserved?: 'guid' | 'notetype' | 'deck' | 'tags';
  /** Share of rows where the column is not empty (0..1). The other shares below are of non-empty values. */
  fill: number;
  avgLength: number;
  kanji: number;
  singleKanji: number;
  kanaOnly: number;
  hiraganaOnly: number;
  katakanaOnly: number;
  furigana: number;
  foreign: number;
  numeric: number;
  /** Numbers in the range RTK frame numbers use. */
  frameLike: number;
  unique: number;
  samples: string[];
}

const SAMPLE_ROWS = 400;

export function profileColumns(exp: WordFile): ColumnProfile[] {
  const rows = pickSample(exp.rows, SAMPLE_ROWS);
  const { meta } = exp;
  const reserved = new Map<number, ColumnProfile['reserved']>();
  if (meta.guidColumn != null) reserved.set(meta.guidColumn, 'guid');
  if (meta.notetypeColumn != null) reserved.set(meta.notetypeColumn, 'notetype');
  if (meta.deckColumn != null) reserved.set(meta.deckColumn, 'deck');
  if (meta.tagsColumn != null) reserved.set(meta.tagsColumn, 'tags');

  return Array.from({ length: exp.columnCount }, (_, index) => {
    const raw = rows.map((row) => row[index] ?? '');
    const values = raw
      .map((html) => ({ html, text: htmlToText(html) }))
      .filter((v) => v.text !== '');
    const share = (test: (v: { html: string; text: string }) => boolean) =>
      values.length ? values.filter(test).length / values.length : 0;

    return {
      index,
      name: meta.columnNames?.[index],
      reserved: reserved.get(index),
      fill: rows.length ? values.length / rows.length : 0,
      avgLength: values.length ? values.reduce((sum, v) => sum + [...v.text].length, 0) / values.length : 0,
      kanji: share((v) => hasKanji(v.text)),
      singleKanji: share((v) => isSingleKanjiCell(v.text)),
      kanaOnly: share((v) => isKanaOnly(v.text)),
      hiraganaOnly: share((v) => isHiraganaOnly(v.text)),
      katakanaOnly: share((v) => isKatakanaOnly(v.text)),
      furigana: share((v) => hasFuriganaMarkup(v.html)),
      foreign: share((v) => isForeign(v.text)),
      numeric: share((v) => /^\d+$/.test(v.text)),
      frameLike: share((v) => /^\d+$/.test(v.text) && +v.text >= 1 && +v.text <= 3500),
      unique: values.length ? new Set(values.map((v) => v.text)).size / values.length : 0,
      samples: values.slice(0, 3).map((v) => v.text.replace(/\n/g, ' / ')),
    };
  });
}

/** A kanji deck has a column where nearly every cell is one kanji. */
export function detectDeckKind(profiles: ColumnProfile[]): DeckKind {
  return profiles.some((p) => !p.reserved && p.singleKanji > 0.85 && p.fill > 0.7) ? 'kanji' : 'words';
}

export function detectWordColumns(profiles: ColumnProfile[]): ColumnMapping<WordRole> {
  return assign<WordRole>(profiles, {
    word: (p) => p.kanji * p.fill * lengthFit(p.avgLength, 8, 30) * (1 - 0.5 * p.furigana) * (1 - p.foreign),
    reading: (p) => p.kanaOnly * p.fill * lengthFit(p.avgLength, 12, 40),
    translation: (p) => p.foreign * p.fill * lengthFit(p.avgLength, 40, 160),
    furigana: (p) => p.furigana * p.fill * lengthFit(p.avgLength, 10, 30),
  }, {
    // "translation" goes first so that a field called "Russian word" is not taken for the word.
    translation: /translat|meaning|english|russian|definition|gloss|^back$|перевод|значение|смысл|意味/i,
    furigana: /furigana|ruby|фуригана|ふりがな/i,
    reading: /reading|kana|hiragana|yomi|pronunc|чтение|кана|読み/i,
    word: /word|vocab|expression|kanji|^front$|term|слово|単語|漢字/i,
  });
}

export function detectKanjiColumns(profiles: ColumnProfile[]): ColumnMapping<KanjiRole> {
  return assign<KanjiRole>(profiles, {
    kanji: (p) => p.singleKanji * p.fill,
    frame: (p) => p.frameLike * p.unique * p.fill,
    keyword: (p) => p.foreign * p.fill * lengthFit(p.avgLength, 14, 60),
    onyomi: (p) => p.katakanaOnly * p.fill * lengthFit(p.avgLength, 14, 60),
    kunyomi: (p) => p.hiraganaOnly * p.fill * lengthFit(p.avgLength, 20, 80),
  }, {
    keyword: /keyword|meaning|ключ/i,
    frame: /frame|heisig|rtk|number|index|order|lesson|position|номер|урок|порядок/i,
    onyomi: /on.?yomi|onyomi|音読み/i,
    kunyomi: /kun.?yomi|kunyomi|訓読み/i,
    kanji: /^kanji$|character|漢字|иероглиф/i,
  });
}

const MIN_SCORE = 0.2;
const NAME_BONUS = 0.5;

/** Picks the best column for each role, highest scores first, one column per role. */
function assign<R extends string>(
  profiles: ColumnProfile[],
  scorers: Record<R, (p: ColumnProfile) => number>,
  names: Record<R, RegExp>,
): ColumnMapping<R> {
  const roles = Object.keys(scorers) as R[];
  const candidates: { role: R; index: number; score: number }[] = [];

  for (const p of profiles) {
    if (p.reserved || p.fill === 0) continue;
    const namedRole = p.name ? roles.find((role) => names[role].test(p.name!)) : undefined;
    for (const role of roles) {
      const score = scorers[role](p) + (namedRole === role ? NAME_BONUS : 0);
      if (score >= MIN_SCORE) candidates.push({ role, index: p.index, score });
    }
  }

  const mapping: ColumnMapping<R> = {};
  const usedColumns = new Set<number>();
  for (const c of candidates.sort((a, b) => b.score - a.score)) {
    if (mapping[c.role] != null || usedColumns.has(c.index)) continue;
    mapping[c.role] = c.index;
    usedColumns.add(c.index);
  }
  return mapping;
}

/** 1 up to `ideal` characters, then falls towards 0 at `max`. */
function lengthFit(avg: number, ideal: number, max: number): number {
  if (avg <= ideal) return 1;
  if (avg >= max) return 0.02;
  return 1 - (0.98 * (avg - ideal)) / (max - ideal);
}

/** Cells like "一", "喩・喻" or "刖~俞" in kanji decks. */
function isSingleKanjiCell(text: string): boolean {
  const chars = [...text.replace(/[\s・~〜,、]/g, '')];
  return chars.length >= 1 && chars.length <= 2 && chars.every(isKanji);
}

/** Text written mostly in a non-Japanese alphabet (the user's own language). */
function isForeign(text: string): boolean {
  let letters = 0;
  let japanese = 0;
  for (const ch of text) {
    if (isJapanese(ch)) japanese++;
    else if (/[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/.test(ch)) letters++;
  }
  return letters > 0 && letters >= japanese;
}

function pickSample<T>(rows: T[], size: number): T[] {
  if (rows.length <= size) return rows;
  const step = rows.length / size;
  return Array.from({ length: size }, (_, i) => rows[Math.floor(i * step)]);
}
