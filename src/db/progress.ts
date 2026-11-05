import type { SQLiteDatabase } from 'expo-sqlite';

import type { WordNote } from '@/core/import/import-words';
import type { Direction } from '@/core/quiz/session';
import { schedule, type Progress } from '@/core/quiz/srs';

interface ProgressRow {
  note_id: string;
  box: number;
  due_at: number;
  correct: number;
  wrong: number;
  last_seen: number;
}

const fromRow = (r: ProgressRow): Progress => ({
  noteId: r.note_id,
  box: r.box,
  dueAt: r.due_at,
  correct: r.correct,
  wrong: r.wrong,
  lastSeen: r.last_seen,
});

/** Progress by word id for one direction; the two directions are learned separately. */
export async function getProgressMap(
  db: SQLiteDatabase,
  direction: Direction = 'to-kanji',
): Promise<Map<string, Progress>> {
  const rows = await db.getAllAsync<ProgressRow>('SELECT * FROM progress WHERE direction = ?', direction);
  return new Map(rows.map((r) => [r.note_id, fromRow(r)]));
}

/** Logs an answer; only the first attempt at a word in a session moves it between boxes. */
export async function recordAnswer(
  db: SQLiteDatabase,
  noteId: string,
  correct: boolean,
  scheduleIt: boolean,
  direction: Direction = 'to-kanji',
) {
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      'INSERT INTO answer_log (note_id, correct, answered_at, direction) VALUES (?, ?, ?, ?)',
      noteId,
      correct ? 1 : 0,
      now,
      direction,
    );
    if (!scheduleIt) return;
    const row = await txn.getFirstAsync<ProgressRow>(
      'SELECT * FROM progress WHERE note_id = ? AND direction = ?',
      noteId,
      direction,
    );
    const next = schedule(row ? fromRow(row) : undefined, noteId, correct, now);
    await txn.runAsync(
      `INSERT INTO progress (note_id, direction, box, due_at, correct, wrong, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (note_id, direction) DO UPDATE SET
         box = excluded.box, due_at = excluded.due_at, correct = excluded.correct,
         wrong = excluded.wrong, last_seen = excluded.last_seen`,
      noteId,
      direction,
      next.box,
      next.dueAt,
      next.correct,
      next.wrong,
      next.lastSeen,
    );
  });
}

export async function resetProgress(db: SQLiteDatabase) {
  await db.execAsync('DELETE FROM progress; DELETE FROM answer_log;');
}

export interface AnswerTotals {
  total: number;
  correct: number;
}

/** Answers since a time, for one direction or (without) all of them. */
export async function answerTotals(db: SQLiteDatabase, since = 0, direction?: Direction): Promise<AnswerTotals> {
  const row = await db.getFirstAsync<{ total: number; correct: number | null }>(
    `SELECT COUNT(*) AS total, SUM(correct) AS correct FROM answer_log
     WHERE answered_at >= ? AND (? IS NULL OR direction = ?)`,
    since,
    direction ?? null,
    direction ?? null,
  );
  return { total: row?.total ?? 0, correct: row?.correct ?? 0 };
}

export async function answerTimestamps(db: SQLiteDatabase, since: number): Promise<number[]> {
  const rows = await db.getAllAsync<{ answered_at: number }>(
    'SELECT answered_at FROM answer_log WHERE answered_at >= ?',
    since,
  );
  return rows.map((r) => r.answered_at);
}

export interface MissedWord {
  note: WordNote;
  wrong: number;
  correct: number;
}

/** Words answered wrong most often in a direction (only words that are still imported). */
export async function mostMissed(db: SQLiteDatabase, direction: Direction, limit = 10): Promise<MissedWord[]> {
  const rows = await db.getAllAsync<{
    id: string;
    word: string;
    reading: string;
    translation: string;
    furigana: string | null;
    wrong: number;
    correct: number;
  }>(
    `SELECT n.id, n.word, n.reading, n.translation, n.furigana, p.wrong, p.correct
     FROM progress p JOIN note n ON n.id = p.note_id
     WHERE p.direction = ? AND p.wrong > 0
     ORDER BY p.wrong DESC, p.correct ASC
     LIMIT ?`,
    direction,
    limit,
  );
  return rows.map((r) => ({
    note: {
      id: r.id,
      word: r.word,
      reading: r.reading,
      translation: r.translation,
      alternatives: [],
      furigana: r.furigana ? JSON.parse(r.furigana) : undefined,
    },
    wrong: r.wrong,
    correct: r.correct,
  }));
}
