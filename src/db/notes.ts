import type { SQLiteDatabase } from 'expo-sqlite';

import type { WordNote } from '@/core/anki/import-words';

interface NoteRow {
  id: string;
  deck: string | null;
  word: string;
  alternatives: string;
  reading: string;
  translation: string;
  furigana: string | null;
}

const fromRow = (row: NoteRow): WordNote => ({
  id: row.id,
  deck: row.deck ?? undefined,
  word: row.word,
  alternatives: JSON.parse(row.alternatives),
  reading: row.reading,
  translation: row.translation,
  furigana: row.furigana ? JSON.parse(row.furigana) : undefined,
});

/** Inserts new notes and updates existing ones (matched by id, i.e. Anki GUID), keeping their progress. */
export async function saveNotes(db: SQLiteDatabase, notes: WordNote[]): Promise<{ added: number; updated: number }> {
  const existing = new Set((await db.getAllAsync<{ id: string }>('SELECT id FROM note')).map((r) => r.id));
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (txn) => {
    const statement = await txn.prepareAsync(`
      INSERT INTO note (id, deck, word, alternatives, reading, translation, furigana, imported_at)
      VALUES ($id, $deck, $word, $alternatives, $reading, $translation, $furigana, $now)
      ON CONFLICT (id) DO UPDATE SET
        deck = excluded.deck, word = excluded.word, alternatives = excluded.alternatives,
        reading = excluded.reading, translation = excluded.translation, furigana = excluded.furigana,
        imported_at = excluded.imported_at
    `);
    try {
      for (const note of notes) {
        await statement.executeAsync({
          $id: note.id,
          $deck: note.deck ?? null,
          $word: note.word,
          $alternatives: JSON.stringify(note.alternatives),
          $reading: note.reading,
          $translation: note.translation,
          $furigana: note.furigana ? JSON.stringify(note.furigana) : null,
          $now: now,
        });
      }
    } finally {
      await statement.finalizeAsync();
    }
  });
  const added = notes.filter((n) => !existing.has(n.id)).length;
  return { added, updated: notes.length - added };
}

export async function listNotes(db: SQLiteDatabase, search = ''): Promise<WordNote[]> {
  const term = search.trim();
  const rows = term
    ? await db.getAllAsync<NoteRow>(
        `SELECT * FROM note
         WHERE word LIKE $q OR reading LIKE $q OR translation LIKE $q OR alternatives LIKE $q
         ORDER BY imported_at DESC, rowid`,
        { $q: `%${term}%` },
      )
    : await db.getAllAsync<NoteRow>('SELECT * FROM note ORDER BY imported_at DESC, rowid');
  return rows.map(fromRow);
}

export interface DeckSummary {
  deck: string;
  count: number;
}

export async function getDeckSummaries(db: SQLiteDatabase): Promise<DeckSummary[]> {
  return db.getAllAsync<DeckSummary>(
    `SELECT COALESCE(deck, '') AS deck, COUNT(*) AS count FROM note GROUP BY deck ORDER BY deck`,
  );
}

export async function deleteAllNotes(db: SQLiteDatabase) {
  await db.runAsync('DELETE FROM note');
}
