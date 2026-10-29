// Backup file: everything the user has built up in the app (words, kanji deck, progress, history, settings)
// as one JSON document. The dictionary data bundled with the app is not included.

import type { KanjiEntry } from './import/import-kanji';
import type { WordNote } from './import/import-words';
import type { Progress } from './quiz/srs';
import { normalizeSettings, type Settings } from './settings';

export const BACKUP_FORMAT = 'kanji-words-backup';
export const BACKUP_VERSION = 1;

export interface BackupNote extends WordNote {
  importedAt: number;
}

export interface BackupProfile {
  kind: string;
  noteType: string;
  mapping: unknown;
}

/** One logged answer: [note id, correct (1/0), time]. Tuples keep a long history small. */
export type BackupAnswer = [noteId: string, correct: 0 | 1, answeredAt: number];

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  settings: Settings;
  notes: BackupNote[];
  userKanji: KanjiEntry[];
  importProfiles: BackupProfile[];
  progress: Progress[];
  answers: BackupAnswer[];
}

export type BackupContent = Omit<Backup, 'format' | 'version' | 'exportedAt'>;

export function createBackup(content: BackupContent, now = Date.now()): Backup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, ...content };
}

export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `kanji-words-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export function backupSummary(backup: Backup): string {
  const lines = [`${backup.notes.length} words`];
  if (backup.userKanji.length) lines.push(`${backup.userKanji.length} kanji in your kanji deck`);
  lines.push(`progress on ${backup.progress.length} words`, `${backup.answers.length} logged answers`);
  return lines.join('\n');
}

const fail = (what: string): never => {
  throw new Error(`The backup file is damaged (${what}).`);
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, what: string) => (typeof v === 'string' ? v : fail(what));
const num = (v: unknown, what: string) => (typeof v === 'number' && Number.isFinite(v) ? v : fail(what));
const optStr = (v: unknown, what: string) => (v == null ? undefined : str(v, what));
const optNum = (v: unknown, what: string) => (v == null ? undefined : num(v, what));
const strings = (v: unknown, what: string) =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : fail(what);
const list = (v: unknown, what: string): unknown[] => (Array.isArray(v) ? v : fail(what));
const record = (v: unknown, what: string): Record<string, unknown> => (isRecord(v) ? v : fail(what));

function parseNote(raw: unknown): BackupNote {
  const n = record(raw, 'a word');
  const furigana = n.furigana == null ? undefined : list(n.furigana, 'furigana');
  return {
    id: str(n.id, 'word id'),
    deck: optStr(n.deck, 'deck'),
    word: str(n.word, 'word'),
    alternatives: strings(n.alternatives, 'alternatives'),
    reading: str(n.reading, 'reading'),
    readingLabel: optStr(n.readingLabel, 'reading'),
    translation: str(n.translation, 'translation'),
    furigana: furigana as WordNote['furigana'],
    importedAt: num(n.importedAt, 'import time'),
  };
}

function parseKanji(raw: unknown): KanjiEntry {
  const k = record(raw, 'a kanji');
  return {
    kanji: str(k.kanji, 'kanji'),
    keyword: optStr(k.keyword, 'keyword'),
    frame: optNum(k.frame, 'frame'),
    onyomi: strings(k.onyomi, 'onyomi'),
    kunyomi: strings(k.kunyomi, 'kunyomi'),
  };
}

function parseProfile(raw: unknown): BackupProfile {
  const p = record(raw, 'a column mapping');
  return { kind: str(p.kind, 'mapping kind'), noteType: str(p.noteType, 'note type'), mapping: record(p.mapping, 'mapping') };
}

function parseProgress(raw: unknown): Progress {
  const p = record(raw, 'progress');
  return {
    noteId: str(p.noteId, 'progress id'),
    box: num(p.box, 'box'),
    dueAt: num(p.dueAt, 'due time'),
    correct: num(p.correct, 'correct count'),
    wrong: num(p.wrong, 'wrong count'),
    lastSeen: num(p.lastSeen, 'last seen'),
  };
}

function parseAnswer(raw: unknown): BackupAnswer {
  const a = list(raw, 'an answer');
  return [str(a[0], 'answer id'), num(a[1], 'answer result') ? 1 : 0, num(a[2], 'answer time')];
}

/** Parses and validates the text of a backup file; throws an Error with a user-readable message. */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This is not a Kanji Words backup file.');
  }
  if (!isRecord(raw) || raw.format !== BACKUP_FORMAT) throw new Error('This is not a Kanji Words backup file.');
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of the app. Update the app and try again.');
  }
  return {
    format: BACKUP_FORMAT,
    version: raw.version,
    exportedAt: num(raw.exportedAt, 'date'),
    settings: normalizeSettings(raw.settings),
    notes: list(raw.notes, 'words').map(parseNote),
    userKanji: list(raw.userKanji, 'kanji deck').map(parseKanji),
    importProfiles: list(raw.importProfiles, 'column mappings').map(parseProfile),
    progress: list(raw.progress, 'progress').map(parseProgress),
    answers: list(raw.answers, 'answer history').map(parseAnswer),
  };
}
