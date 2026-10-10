// Parses word lists from text files: Anki "Notes in Plain Text" exports, and any other delimited
// text such as CSV/TSV files saved from a spreadsheet or exported from other flashcard apps.
//
// Recent Anki versions start the file with header lines such as:
//   #separator:tab
//   #html:true
//   #guid column:1
//   #notetype column:2
//   #deck column:3
//   #tags column:13
//   #columns:Front	Back        (only when the user picked "include column names")
// followed by delimited rows. Fields containing the separator, quotes or line breaks are quoted
// with double quotes, and quotes inside are doubled.
//
// Files without these headers get their separator guessed, and a first row of column names
// ("word,reading,meaning") is recognized as a header.

import { isJapanese } from '../text/japanese';

export interface WordFileMeta {
  separator: string;
  html: boolean;
  columnNames?: string[];
  /** Column indexes below are 0-based. */
  guidColumn?: number;
  notetypeColumn?: number;
  deckColumn?: number;
  tagsColumn?: number;
  /** Set when the whole file belongs to one note type / deck (`#notetype:Basic`). */
  notetype?: string;
  deck?: string;
}

export interface WordFile {
  meta: WordFileMeta;
  rows: string[][];
  columnCount: number;
}

const SEPARATOR_NAMES: Record<string, string> = {
  tab: '\t',
  comma: ',',
  semicolon: ';',
  space: ' ',
  pipe: '|',
  colon: ':',
};

export class EncodingError extends Error {}

export function parseWordFile(text: string): WordFile {
  // Undecodable bytes become U+FFFD when a non-UTF-8 file (e.g. Shift_JIS) is read as UTF-8.
  if (text.includes('\uFFFD')) {
    throw new EncodingError('The file is not saved as UTF-8. Save it as UTF-8 (in Excel: "CSV UTF-8") and try again.');
  }
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const { meta, bodyStart } = parseHeader(source);
  const body = source.slice(bodyStart);
  const separator = meta.separator ?? sniffSeparator(body);

  const rows = parseDelimited(body, separator).filter((row) => row.some((cell) => cell.trim() !== ''));
  if (!meta.columnNames && bodyStart === 0 && isHeaderRow(rows)) {
    meta.columnNames = rows.shift()!.map((name) => name.trim());
  }
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  for (const row of rows) while (row.length < columnCount) row.push('');

  if (meta.columnNames && meta.columnNames.length === 1 && separator !== '\t') {
    meta.columnNames = meta.columnNames[0].split(separator);
  }

  return { meta: { ...meta, separator, html: meta.html ?? true }, rows, columnCount };
}

type PartialMeta = Omit<WordFileMeta, 'separator' | 'html'> & { separator?: string; html?: boolean };

function parseHeader(source: string): { meta: PartialMeta; bodyStart: number } {
  const meta: PartialMeta = {};
  let pos = 0;
  while (source.startsWith('#', pos)) {
    const end = source.indexOf('\n', pos);
    const line = source.slice(pos + 1, end < 0 ? source.length : end);
    pos = end < 0 ? source.length : end + 1;

    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1);
    const column = parseInt(value, 10) - 1;

    switch (key) {
      case 'separator':
        meta.separator = SEPARATOR_NAMES[value.trim().toLowerCase()] ?? value;
        break;
      case 'html':
        meta.html = value.trim().toLowerCase() === 'true';
        break;
      case 'columns':
        meta.columnNames = value.split('\t');
        break;
      case 'notetype':
        meta.notetype = value.trim();
        break;
      case 'deck':
        meta.deck = value.trim();
        break;
      case 'guid column':
        if (column >= 0) meta.guidColumn = column;
        break;
      case 'notetype column':
        if (column >= 0) meta.notetypeColumn = column;
        break;
      case 'deck column':
        if (column >= 0) meta.deckColumn = column;
        break;
      case 'tags column':
        if (column >= 0) meta.tagsColumn = column;
        break;
    }
  }
  return { meta, bodyStart: pos };
}

/** Older exports have no header: guess from the first lines. */
/**
 * Files without a header: picks the separator that splits the first lines into the same number of
 * columns most consistently. A comma file whose translations contain ";" still comes out as commas.
 */
function sniffSeparator(body: string): string {
  const lines = body.split('\n').filter((l) => l.trim() !== '').slice(0, 30);
  let best = { separator: '\t', score: 0 };
  for (const separator of ['\t', ',', ';', '|']) {
    const counts = lines.map((line) => line.replace(/"[^"]*"/g, '').split(separator).length);
    const frequency = new Map<number, number>();
    for (const c of counts) frequency.set(c, (frequency.get(c) ?? 0) + 1);
    const [columns, lineCount] = [...frequency].sort((a, b) => b[1] - a[1])[0] ?? [1, 0];
    // Consistency matters most; more columns break ties (",": 3 columns beats ";": 2).
    const score = columns > 1 ? lineCount / lines.length + columns / 1000 : 0;
    if (score > best.score) best = { separator, score };
  }
  return best.separator;
}

const HEADER_NAMES =
  /^(word|words|kanji|vocab|vocabulary|expression|term|front|back|reading|readings|kana|hiragana|furigana|meaning|meanings|translation|definition|english|russian|notes?|example|слово|чтение|перевод|значение|иероглиф|単語|漢字|読み|よみ|かな|ふりがな|意味|訳)$/i;

/**
 * A first row of column names: either it uses known names, or it has no Japanese at all while a
 * column below it is (nearly) all Japanese, like "word" above 父, 母, 兄….
 */
function isHeaderRow(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const [first, ...rest] = rows;
  const named = first.filter((cell) => HEADER_NAMES.test(cell.trim())).length;
  if (named >= 2 || (named === 1 && first.length === 1)) return true;

  const hasJapanese = (cell: string) => [...cell].some(isJapanese);
  if (first.some(hasJapanese)) return false;
  const sample = rest.slice(0, 50);
  return first.some(
    (cell, i) => cell.trim() !== '' && sample.filter((row) => hasJapanese(row[i] ?? '')).length >= sample.length * 0.8,
  );
}

function parseDelimited(body: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldStart = true;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuotes) {
      if (ch !== '"') field += ch;
      else if (body[i + 1] === '"') {
        field += '"';
        i++;
      } else inQuotes = false;
      continue;
    }
    if (ch === '"' && fieldStart) {
      inQuotes = true;
      fieldStart = false;
    } else if (ch === separator) {
      row.push(field);
      field = '';
      fieldStart = true;
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      fieldStart = true;
    } else {
      field += ch;
      fieldStart = false;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
