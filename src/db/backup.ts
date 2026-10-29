import type { SQLiteDatabase } from 'expo-sqlite';

import type { Backup, BackupContent } from '@/core/backup';
import type { Settings } from '@/core/settings';

export async function readBackupContent(db: SQLiteDatabase, settings: Settings): Promise<BackupContent> {
  const notes = await db.getAllAsync<Record<string, string | number | null>>(
    'SELECT * FROM note ORDER BY imported_at, rowid',
  );
  const kanji = await db.getAllAsync<Record<string, string | number | null>>('SELECT * FROM user_kanji');
  const profiles = await db.getAllAsync<{ kind: string; note_type: string; mapping: string }>(
    'SELECT kind, note_type, mapping FROM import_profile',
  );
  const progress = await db.getAllAsync<Record<string, number | string>>('SELECT * FROM progress');
  const answers = await db.getAllAsync<{ note_id: string; correct: number; answered_at: number }>(
    'SELECT note_id, correct, answered_at FROM answer_log ORDER BY answered_at, id',
  );

  return {
    settings,
    notes: notes.map((r) => ({
      id: r.id as string,
      deck: (r.deck as string | null) ?? undefined,
      word: r.word as string,
      alternatives: JSON.parse(r.alternatives as string),
      reading: r.reading as string,
      readingLabel: (r.reading_label as string | null) ?? undefined,
      translation: r.translation as string,
      furigana: r.furigana ? JSON.parse(r.furigana as string) : undefined,
      importedAt: r.imported_at as number,
    })),
    userKanji: kanji.map((r) => ({
      kanji: r.kanji as string,
      keyword: (r.keyword as string | null) ?? undefined,
      frame: (r.frame as number | null) ?? undefined,
      onyomi: JSON.parse(r.onyomi as string),
      kunyomi: JSON.parse(r.kunyomi as string),
    })),
    importProfiles: profiles.map((r) => ({ kind: r.kind, noteType: r.note_type, mapping: JSON.parse(r.mapping) })),
    progress: progress.map((r) => ({
      noteId: r.note_id as string,
      box: r.box as number,
      dueAt: r.due_at as number,
      correct: r.correct as number,
      wrong: r.wrong as number,
      lastSeen: r.last_seen as number,
    })),
    answers: answers.map((r) => [r.note_id, r.correct ? 1 : 0, r.answered_at]),
  };
}

/** Replaces all of the user's data with the backup's, all or nothing. Settings are restored by the caller. */
export async function restoreBackup(db: SQLiteDatabase, backup: Backup) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(
      'DELETE FROM note; DELETE FROM user_kanji; DELETE FROM import_profile; DELETE FROM progress; DELETE FROM answer_log;',
    );

    const insertAll = async <T>(sql: string, rows: T[], params: (row: T) => (string | number | null)[]) => {
      const statement = await txn.prepareAsync(sql);
      try {
        for (const row of rows) await statement.executeAsync(params(row));
      } finally {
        await statement.finalizeAsync();
      }
    };

    await insertAll(
      `INSERT INTO note (id, deck, word, alternatives, reading, reading_label, translation, furigana, imported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      backup.notes,
      (n) => [
        n.id,
        n.deck ?? null,
        n.word,
        JSON.stringify(n.alternatives),
        n.reading,
        n.readingLabel ?? null,
        n.translation,
        n.furigana ? JSON.stringify(n.furigana) : null,
        n.importedAt,
      ],
    );
    await insertAll(
      'INSERT OR REPLACE INTO user_kanji (kanji, keyword, frame, onyomi, kunyomi) VALUES (?, ?, ?, ?, ?)',
      backup.userKanji,
      (k) => [k.kanji, k.keyword ?? null, k.frame ?? null, JSON.stringify(k.onyomi), JSON.stringify(k.kunyomi)],
    );
    await insertAll(
      'INSERT OR REPLACE INTO import_profile (kind, note_type, mapping) VALUES (?, ?, ?)',
      backup.importProfiles,
      (p) => [p.kind, p.noteType, JSON.stringify(p.mapping)],
    );
    await insertAll(
      'INSERT OR REPLACE INTO progress (note_id, box, due_at, correct, wrong, last_seen) VALUES (?, ?, ?, ?, ?, ?)',
      backup.progress,
      (p) => [p.noteId, p.box, p.dueAt, p.correct, p.wrong, p.lastSeen],
    );
    await insertAll('INSERT INTO answer_log (note_id, correct, answered_at) VALUES (?, ?, ?)', backup.answers, (a) => a);
  });
}
