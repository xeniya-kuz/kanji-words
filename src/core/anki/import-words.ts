// Turns the rows of a word deck export into quiz notes.

import {
  furiganaBase,
  furiganaReading,
  parseFuriganaVariants,
  type FuriganaSegment,
} from '../text/furigana';
import { hasFuriganaMarkup, htmlToText, stripBracketFurigana } from '../text/html';
import { hasKanji, toHiragana } from '../text/japanese';
import { expandVariants } from '../text/variants';
import type { ColumnMapping, WordRole } from './detect-columns';
import type { AnkiExport } from './parse-export';

export interface WordNote {
  /** Anki GUID when available, so re-importing a deck updates notes instead of duplicating them. */
  id: string;
  deck?: string;
  /** The spelling the quiz asks for. */
  word: string;
  /** Other accepted spellings: never offered as wrong answers. */
  alternatives: string[];
  reading: string;
  translation: string;
  /** Present only when it matches both the word and the reading. */
  furigana?: FuriganaSegment[];
}

export type SkipReason = 'no-word' | 'no-reading' | 'no-kanji' | 'duplicate';

export interface SkippedRow {
  /** 1-based row number among the data rows. */
  row: number;
  reason: SkipReason;
  text: string;
}

export interface WordImportResult {
  notes: WordNote[];
  skipped: SkippedRow[];
  /** Notes whose furigana did not match the word or reading and was therefore not used. */
  furiganaIgnored: number;
}

export function importWords(exp: AnkiExport, mapping: ColumnMapping<WordRole>): WordImportResult {
  const { word: wordCol, reading: readingCol, translation: translationCol, furigana: furiganaCol } = mapping;
  if (wordCol == null || readingCol == null) throw new Error('The word and reading columns are required');

  const notes: WordNote[] = [];
  const skipped: SkippedRow[] = [];
  const seen = new Set<string>();
  let furiganaIgnored = 0;

  exp.rows.forEach((row, i) => {
    const rawWord = row[wordCol] ?? '';
    const words = expandVariants(stripBracketFurigana(htmlToText(rawWord)));
    const readings = expandVariants(htmlToText(row[readingCol] ?? ''));
    const translation = translationCol != null ? htmlToText(row[translationCol] ?? '') : '';
    const furiganaSource = furiganaCol != null && row[furiganaCol] ? row[furiganaCol] : rawWord;
    const furiganaOptions = hasFuriganaMarkup(furiganaSource) ? parseFuriganaVariants(furiganaSource) : [];
    const guid = exp.meta.guidColumn != null ? row[exp.meta.guidColumn] : undefined;
    const deck = exp.meta.deckColumn != null ? row[exp.meta.deckColumn] : exp.meta.deck;
    const skip = (reason: SkipReason, text: string) => skipped.push({ row: i + 1, reason, text });

    const firstFurigana = furiganaOptions[0];
    if (words.length === 0 && firstFurigana) words.push(furiganaBase(firstFurigana));
    if (readings.length === 0 && firstFurigana?.some((s) => s.reading)) readings.push(furiganaReading(firstFurigana));
    if (words.length === 0) return skip(readings.length ? 'no-kanji' : 'no-word', readings[0] ?? translation);
    if (readings.length === 0) return skip('no-reading', words[0]);

    // Furigana may replace the word field only when that field has no kanji or holds broken ruby markup.
    const furiganaWins = !words.some(hasKanji) || /<ruby[\s>]/i.test(rawWord);

    // "返事をする / 返信する" with "へんじをする/へんしんする" is two different words.
    const isPairedList = words.length > 1 && words.length === readings.length && new Set(readings).size > 1;
    const drafts = isPairedList
      ? words.map((word, k) => ({ word, alternatives: [] as string[], reading: readings[k], suffix: `#${k + 1}` }))
      : [{ word: words[0], alternatives: words.slice(1), reading: readings[0], suffix: '' }];

    for (const draft of drafts) {
      const note: WordNote = {
        id: (guid || `${draft.word}|${draft.reading}`) + draft.suffix,
        deck: deck || undefined,
        word: draft.word,
        alternatives: draft.alternatives,
        reading: draft.reading,
        translation,
      };

      const hasReadings = furiganaOptions.some((o) => o.some((s) => s.reading));
      if (hasReadings && !applyFurigana(note, furiganaOptions, furiganaWins) && drafts.length === 1) {
        furiganaIgnored++;
      }

      if (!hasKanji(note.word)) {
        skip('no-kanji', note.word);
        continue;
      }
      const key = `${note.word}|${toHiragana(note.reading)}`;
      if (seen.has(key)) {
        skip('duplicate', note.word);
        continue;
      }
      seen.add(key);
      notes.push(note);
    }
  });

  return { notes, skipped, furiganaIgnored };
}

/**
 * Attaches the furigana variant that spells this note. Furigana that spells the reading with another
 * kanji spelling becomes the word itself when `furiganaWins`, otherwise an accepted alternative.
 * Returns false when no furigana variant was attached.
 */
function applyFurigana(note: WordNote, options: FuriganaSegment[][], furiganaWins: boolean): boolean {
  const fitting = options.filter((o) => o.some((s) => s.reading) && readingFits(o, note.reading));
  const chosen =
    fitting.find((o) => furiganaBase(o) === note.word) ??
    (furiganaWins ? fitting.find((o) => hasKanji(furiganaBase(o))) : undefined);

  const previousWord = note.word;
  if (chosen) {
    note.word = furiganaBase(chosen);
    note.furigana = chosen;
  }
  const accepted = [previousWord, ...note.alternatives, ...fitting.map(furiganaBase)];
  note.alternatives = [...new Set(accepted)].filter((w) => w !== note.word && hasKanji(w));
  return !!chosen;
}

/** Compares readings ignoring script; digits and Latin letters in furigana ("1かい") match any kana. */
function readingFits(segments: FuriganaSegment[], reading: string): boolean {
  const expected = toHiragana(furiganaReading(segments));
  const target = toHiragana(reading);
  if (expected === target) return true;
  if (!/[0-9０-９A-Za-z]/.test(expected)) return false;
  const pattern = expected
    .split(/[0-9０-９A-Za-z]+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.+');
  return new RegExp(`^${pattern}$`).test(target);
}
