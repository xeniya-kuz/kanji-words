// Parses Anki "Notes in Plain Text" exports (.txt).
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

export interface AnkiExportMeta {
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

export interface AnkiExport {
  meta: AnkiExportMeta;
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

export function parseAnkiExport(text: string): AnkiExport {
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const { meta, bodyStart } = parseHeader(source);
  const body = source.slice(bodyStart);
  const separator = meta.separator ?? sniffSeparator(body);

  const rows = parseDelimited(body, separator).filter((row) => row.some((cell) => cell.trim() !== ''));
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  for (const row of rows) while (row.length < columnCount) row.push('');

  if (meta.columnNames && meta.columnNames.length === 1 && separator !== '\t') {
    meta.columnNames = meta.columnNames[0].split(separator);
  }

  return { meta: { ...meta, separator, html: meta.html ?? true }, rows, columnCount };
}

type PartialMeta = Omit<AnkiExportMeta, 'separator' | 'html'> & { separator?: string; html?: boolean };

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
function sniffSeparator(body: string): string {
  const sample = body.split('\n').slice(0, 20).join('\n');
  for (const candidate of ['\t', ';', ',']) if (sample.includes(candidate)) return candidate;
  return '\t';
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
