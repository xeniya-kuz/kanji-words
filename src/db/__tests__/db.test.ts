/// <reference types="node" />
// Runs the app's database code (migrations, backup, progress) on a real SQLite database in memory.
// expo-sqlite only exists on a phone, so a thin adapter gives node:sqlite the same methods.

import type { SQLiteDatabase } from 'expo-sqlite';

import { createBackup, parseBackup, type BackupContent } from '@/core/backup';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { readBackupContent, restoreBackup } from '../backup';
import { answerTotals, getProgressMap, getTodayStats, mostMissed, recordAnswer, resetProgress } from '../progress';
import { MIGRATIONS, migrateAppDb } from '../schema';

const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
type Raw = InstanceType<typeof DatabaseSync>;
type Param = string | number | null;

/** expo-sqlite takes parameters spread (`sql, a, b`) or as one array. */
const paramsOf = (args: unknown[]): Param[] => (args.length === 1 && Array.isArray(args[0]) ? args[0] : args) as Param[];

function adapt(raw: Raw): SQLiteDatabase {
  const db = {
    execAsync: async (sql: string) => void raw.exec(sql),
    runAsync: async (sql: string, ...args: unknown[]) => void raw.prepare(sql).run(...paramsOf(args)),
    getAllAsync: async (sql: string, ...args: unknown[]) => raw.prepare(sql).all(...paramsOf(args)),
    getFirstAsync: async (sql: string, ...args: unknown[]) => raw.prepare(sql).get(...paramsOf(args)) ?? null,
    prepareAsync: async (sql: string) => {
      const statement = raw.prepare(sql);
      return {
        executeAsync: async (params: Param[]) => void statement.run(...params),
        finalizeAsync: async () => {},
      };
    },
    // All or nothing, like the real thing: an error rolls everything back.
    withExclusiveTransactionAsync: async (task: (txn: unknown) => Promise<void>) => {
      raw.exec('BEGIN');
      try {
        await task(db);
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return db as unknown as SQLiteDatabase;
}

/** A fresh database with every migration applied, as the app creates it. */
async function newDb(): Promise<SQLiteDatabase> {
  const db = adapt(new DatabaseSync(':memory:'));
  await migrateAppDb(db);
  return db;
}

const content: BackupContent = {
  settings: { ...DEFAULT_SETTINGS, direction: 'mixed', excludedDecks: ['N5'] },
  notes: [
    {
      id: 'a',
      deck: 'N5',
      word: '聞く',
      alternatives: ['訊く'],
      reading: 'きく',
      readingLabel: '(に)きく',
      translation: 'to listen',
      furigana: [{ text: '聞', reading: 'き' }, { text: 'く' }],
      importedAt: 1000,
    },
    { id: 'b', word: '山', alternatives: [], reading: 'やま', translation: 'mountain', importedAt: 2000 },
  ],
  userKanji: [{ kanji: '山', keyword: 'mountain', frame: 12, onyomi: ['サン'], kunyomi: ['やま'] }],
  importProfiles: [{ kind: 'words', noteType: 'Basic', mapping: { word: 0, reading: 1 } }],
  progress: [
    { noteId: 'a', direction: 'to-kanji', box: 2, dueAt: 5000, correct: 3, wrong: 1, lastSeen: 4000 },
    { noteId: 'a', direction: 'to-reading', box: 1, dueAt: 6000, correct: 1, wrong: 0, lastSeen: 4500 },
  ],
  answers: [
    ['a', 1, 3000, 'to-kanji'],
    ['a', 0, 4000, 'to-kanji'],
    ['a', 1, 4500, 'to-reading'],
  ],
};

describe('migrations', () => {
  it('create the current schema and record the version', async () => {
    const db = await newDb();
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(row?.user_version).toBe(MIGRATIONS.length);
  });

  it('keep the progress and history of a database from before directions existed', async () => {
    const raw = new DatabaseSync(':memory:');
    for (const migration of MIGRATIONS.slice(0, 3)) raw.exec(migration);
    raw.exec('PRAGMA user_version = 3');
    raw.exec(`
      INSERT INTO progress VALUES ('a', 3, 5000, 4, 1, 4000), ('b', 1, 6000, 1, 0, 4500);
      INSERT INTO answer_log (note_id, correct, answered_at) VALUES ('a', 1, 3000), ('a', 0, 4000), ('b', 1, 4500);
    `);

    const db = adapt(raw);
    await migrateAppDb(db);

    const spelling = await getProgressMap(db, 'to-kanji');
    expect(spelling.get('a')).toEqual({ noteId: 'a', box: 3, dueAt: 5000, correct: 4, wrong: 1, lastSeen: 4000 });
    expect(spelling.get('b')).toMatchObject({ box: 1, correct: 1 });
    expect((await getProgressMap(db, 'to-reading')).size).toBe(0);
    expect(await answerTotals(db, 0, 'to-kanji')).toEqual({ total: 3, correct: 2 });
    expect(await answerTotals(db, 0, 'to-reading')).toEqual({ total: 0, correct: 0 });
  });

  it('can run again without changing anything', async () => {
    const db = await newDb();
    await recordAnswer(db, 'a', true, true, 'to-kanji');
    await migrateAppDb(db);
    expect((await getProgressMap(db, 'to-kanji')).size).toBe(1);
  });
});

describe('backup', () => {
  it('restores everything, both directions included, and reads it back unchanged', async () => {
    const db = await newDb();
    await restoreBackup(db, createBackup(content));
    expect(await readBackupContent(db, content.settings)).toEqual(content);
    expect((await getProgressMap(db, 'to-kanji')).get('a')?.box).toBe(2);
    expect((await getProgressMap(db, 'to-reading')).get('a')?.box).toBe(1);
  });

  it('survives the trip through a file', async () => {
    const db = await newDb();
    await restoreBackup(db, createBackup(content));
    const file = JSON.stringify(createBackup(await readBackupContent(db, content.settings)));

    const other = await newDb();
    await restoreBackup(other, parseBackup(file));
    expect(await readBackupContent(other, content.settings)).toEqual(content);
  });

  it('restores a version 1 file as progress on "reading → kanji"', async () => {
    const old = {
      ...createBackup(content),
      version: 1,
      progress: [{ noteId: 'a', box: 2, dueAt: 5000, correct: 3, wrong: 1, lastSeen: 4000 }],
      answers: [['a', 1, 3000], ['a', 0, 4000]],
    };
    const db = await newDb();
    await restoreBackup(db, parseBackup(JSON.stringify(old)));

    expect((await getProgressMap(db, 'to-kanji')).get('a')).toMatchObject({ box: 2, correct: 3, wrong: 1 });
    expect((await getProgressMap(db, 'to-reading')).size).toBe(0);
    expect(await answerTotals(db, 0, 'to-kanji')).toEqual({ total: 2, correct: 1 });
  });

  it('replaces what was there before', async () => {
    const db = await newDb();
    await restoreBackup(db, createBackup(content));
    await restoreBackup(db, createBackup({ ...content, notes: [content.notes[1]], progress: [], answers: [] }));
    const after = await readBackupContent(db, content.settings);
    expect(after.notes.map((n) => n.id)).toEqual(['b']);
    expect(after.progress).toEqual([]);
    expect(after.answers).toEqual([]);
  });

  it('is all or nothing: a bad file leaves the existing data alone', async () => {
    const db = await newDb();
    await restoreBackup(db, createBackup(content));
    const broken = createBackup({
      ...content,
      notes: [{ ...content.notes[1], id: 'c', word: null as unknown as string }],
      progress: [],
      answers: [],
    });
    await expect(restoreBackup(db, broken)).rejects.toThrow();
    expect(await readBackupContent(db, content.settings)).toEqual(content);
  });
});

describe('progress by direction', () => {
  it('keeps the two directions apart', async () => {
    const db = await newDb();
    await recordAnswer(db, 'a', true, true, 'to-kanji');
    await recordAnswer(db, 'a', true, true, 'to-kanji');
    await recordAnswer(db, 'a', false, true, 'to-reading');

    expect((await getProgressMap(db, 'to-kanji')).get('a')).toMatchObject({ correct: 2, wrong: 0 });
    expect((await getProgressMap(db, 'to-reading')).get('a')).toMatchObject({ box: 0, correct: 0, wrong: 1 });
  });

  it('defaults to "reading → kanji", as before directions existed', async () => {
    const db = await newDb();
    await recordAnswer(db, 'a', true, true);
    expect((await getProgressMap(db)).get('a')?.correct).toBe(1);
    expect((await getProgressMap(db, 'to-reading')).size).toBe(0);
  });

  it('logs a repeat attempt without moving the word between boxes', async () => {
    const db = await newDb();
    await recordAnswer(db, 'a', true, true, 'to-reading');
    const before = (await getProgressMap(db, 'to-reading')).get('a');
    await recordAnswer(db, 'a', false, false, 'to-reading');
    expect((await getProgressMap(db, 'to-reading')).get('a')).toEqual(before);
    expect(await answerTotals(db, 0, 'to-reading')).toEqual({ total: 2, correct: 1 });
  });

  it('counts answers per direction, or all of them without one', async () => {
    const db = await newDb();
    await recordAnswer(db, 'a', true, true, 'to-kanji');
    await recordAnswer(db, 'a', false, true, 'to-reading');
    await recordAnswer(db, 'b', true, true, 'to-reading');
    expect(await answerTotals(db, 0, 'to-kanji')).toEqual({ total: 1, correct: 1 });
    expect(await answerTotals(db, 0, 'to-reading')).toEqual({ total: 2, correct: 1 });
    expect(await answerTotals(db)).toEqual({ total: 3, correct: 2 });
  });

  it('lists the most missed words of one direction only', async () => {
    const db = await newDb();
    await restoreBackup(db, createBackup({ ...content, progress: [], answers: [] }));
    await recordAnswer(db, 'a', false, true, 'to-reading');
    await recordAnswer(db, 'b', false, true, 'to-kanji');

    expect((await mostMissed(db, 'to-reading')).map((m) => m.note.id)).toEqual(['a']);
    expect((await mostMissed(db, 'to-kanji')).map((m) => m.note.id)).toEqual(['b']);
  });

  it("counts today's new words and reviews from the answer history", async () => {
    const db = await newDb();
    const log = (note: string, direction: string, at: number) =>
      db.runAsync(
        'INSERT INTO answer_log (note_id, correct, answered_at, direction) VALUES (?, 1, ?, ?)',
        note,
        at,
        direction,
      );
    await log('old', 'to-kanji', 1000); // first seen before today, reviewed today
    await log('old', 'to-kanji', 5000);
    await log('old', 'to-kanji', 5100); // a repeat attempt doesn't count twice
    await log('old', 'to-reading', 5200); // new today in the other direction
    await log('fresh', 'to-kanji', 5300);
    await log('fresh', 'to-kanji', 5400);
    await log('ancient', 'to-kanji', 2000); // not practiced today at all
    expect(await getTodayStats(db, 4000)).toEqual({ newDone: 2, reviewsDone: 1 });
    expect(await getTodayStats(db, 9000)).toEqual({ newDone: 0, reviewsDone: 0 });
  });

  it('is cleared completely by a reset', async () => {
    const db = await newDb();
    await recordAnswer(db, 'a', true, true, 'to-kanji');
    await recordAnswer(db, 'a', true, true, 'to-reading');
    await resetProgress(db);
    expect((await getProgressMap(db, 'to-kanji')).size).toBe(0);
    expect((await getProgressMap(db, 'to-reading')).size).toBe(0);
    expect(await answerTotals(db)).toEqual({ total: 0, correct: 0 });
  });
});
