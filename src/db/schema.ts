// The app's own database (app.db): imported notes, the user's kanji deck and saved column mappings.
// The bundled dictionary data lives separately in assets/db/kanji.db.

import type { SQLiteDatabase } from 'expo-sqlite';

export const APP_DB_NAME = 'app.db';

const MIGRATIONS: string[] = [
  // 1: initial schema
  `
  CREATE TABLE note (
    id           TEXT PRIMARY KEY NOT NULL,
    deck         TEXT,
    word         TEXT NOT NULL,
    alternatives TEXT NOT NULL,    -- JSON string[]
    reading      TEXT NOT NULL,
    translation  TEXT NOT NULL,
    furigana     TEXT,             -- JSON FuriganaSegment[]
    imported_at  INTEGER NOT NULL
  );
  CREATE INDEX note_deck ON note (deck);

  CREATE TABLE user_kanji (
    kanji   TEXT PRIMARY KEY NOT NULL,
    keyword TEXT,
    frame   INTEGER,
    onyomi  TEXT NOT NULL,         -- JSON string[]
    kunyomi TEXT NOT NULL          -- JSON string[]
  );

  CREATE TABLE import_profile (
    kind      TEXT NOT NULL,       -- 'words' | 'kanji'
    note_type TEXT NOT NULL,
    mapping   TEXT NOT NULL,       -- JSON role → column index
    PRIMARY KEY (kind, note_type)
  );
  `,
];

/** Runs the migrations the database hasn't seen yet (tracked in PRAGMA user_version). */
export async function migrateAppDb(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current === 0) await db.execAsync(`PRAGMA journal_mode = 'wal';`);
  for (let version = current; version < MIGRATIONS.length; version++) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(MIGRATIONS[version]);
      await txn.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
