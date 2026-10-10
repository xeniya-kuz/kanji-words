import type { SQLiteDatabase } from 'expo-sqlite';

import type { KanjiEntry } from '@/core/anki/import-kanji';

/** Replaces the user's kanji deck (keywords, frames) with a newly imported one. */
export async function replaceUserKanji(db: SQLiteDatabase, entries: KanjiEntry[]) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM user_kanji');
    const statement = await txn.prepareAsync(
      'INSERT INTO user_kanji (kanji, keyword, frame, onyomi, kunyomi) VALUES (?, ?, ?, ?, ?)',
    );
    try {
      for (const e of entries) {
        await statement.executeAsync(
          e.kanji,
          e.keyword ?? null,
          e.frame ?? null,
          JSON.stringify(e.onyomi),
          JSON.stringify(e.kunyomi),
        );
      }
    } finally {
      await statement.finalizeAsync();
    }
  });
}

export async function countUserKanji(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM user_kanji');
  return row?.n ?? 0;
}

export async function deleteUserKanji(db: SQLiteDatabase) {
  await db.runAsync('DELETE FROM user_kanji');
}
