// Turns the rows of a kanji deck export (e.g. Remembering the Kanji) into per-kanji info.
// Users import their own deck: RTK keywords are copyrighted and are never bundled with the app.

import { htmlToText } from '../text/html';
import { isKanji } from '../text/japanese';
import type { ColumnMapping, KanjiRole } from './detect-columns';
import type { WordFile } from './word-file';

export interface KanjiEntry {
  kanji: string;
  keyword?: string;
  /** RTK frame number (or any ordering number the deck uses). */
  frame?: number;
  onyomi: string[];
  kunyomi: string[];
}

export interface KanjiImportResult {
  entries: KanjiEntry[];
  /** Rows without a kanji character, e.g. RTK primitives that only exist as images. */
  skipped: number;
}

export function importKanji(exp: WordFile, mapping: ColumnMapping<KanjiRole>): KanjiImportResult {
  const { kanji: kanjiCol, keyword: keywordCol, frame: frameCol, onyomi: onCol, kunyomi: kunCol } = mapping;
  if (kanjiCol == null) throw new Error('The kanji column is required');

  const byKanji = new Map<string, KanjiEntry>();
  let skipped = 0;

  for (const row of exp.rows) {
    const cell = (col?: number) => (col != null ? htmlToText(row[col] ?? '') : '');
    const characters = [...new Set([...cell(kanjiCol)].filter(isKanji))];
    if (characters.length === 0) {
      skipped++;
      continue;
    }
    const keyword = cell(keywordCol).split('\n').filter(Boolean).join(' / ') || undefined;
    const frameText = cell(frameCol).match(/\d+/)?.[0];
    const frame = frameText ? parseInt(frameText, 10) : undefined;
    const onyomi = splitReadings(cell(onCol));
    const kunyomi = splitReadings(cell(kunCol));

    // Variant forms in one cell ("喩・喻") share the same data.
    for (const kanji of characters) {
      const existing = byKanji.get(kanji);
      if (!existing) {
        byKanji.set(kanji, { kanji, keyword, frame, onyomi, kunyomi });
        continue;
      }
      // Some decks list a kanji twice (as a primitive and as a kanji): keep the earliest frame.
      if (frame != null && (existing.frame == null || frame < existing.frame)) existing.frame = frame;
      existing.keyword ??= keyword;
      if (existing.onyomi.length === 0) existing.onyomi = onyomi;
      if (existing.kunyomi.length === 0) existing.kunyomi = kunyomi;
    }
  }

  return { entries: [...byKanji.values()], skipped };
}

function splitReadings(text: string): string[] {
  return [...new Set(text.split(/[、,，;；\s/／]+/).map((r) => r.trim()).filter(Boolean))];
}
