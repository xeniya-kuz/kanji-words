// Opens the bundled kanji database (assets/db/kanji.db) and shares it through React context.
//
// Two SQLiteProviders are nested: the outer one opens kanji.db, this bridge hands it to its own
// context, and the inner provider (app.db) is what useSQLiteContext() returns everywhere else.

import { SQLiteProvider, deleteDatabaseAsync, useSQLiteContext } from 'expo-sqlite';
import { createContext, use, useEffect, useMemo, type ReactNode } from 'react';

import { createKanjiData, type KanjiData } from '@/core/quiz/kanji-data';

/** Must match DB_VERSION in scripts/build-kanji-db.mts. A new version gets a fresh copy of the asset. */
const KANJI_DB_VERSION = 2;
const KANJI_DB_NAME = `kanji-${KANJI_DB_VERSION}.db`;

const KanjiDataContext = createContext<KanjiData | null>(null);

export function KanjiDbProvider({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider
      databaseName={KANJI_DB_NAME}
      assetSource={{ assetId: require('@/assets/db/kanji.db') }}>
      <KanjiDataBridge>{children}</KanjiDataBridge>
    </SQLiteProvider>
  );
}

function KanjiDataBridge({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const data = useMemo(() => createKanjiData((sql, params) => db.getAllAsync(sql, params)), [db]);

  useEffect(() => {
    // Remove copies left by older app versions.
    for (let version = 1; version < KANJI_DB_VERSION; version++) {
      deleteDatabaseAsync(`kanji-${version}.db`).catch(() => {});
    }
  }, []);

  return <KanjiDataContext value={data}>{children}</KanjiDataContext>;
}

export function useKanjiData(): KanjiData {
  const data = use(KanjiDataContext);
  if (!data) throw new Error('useKanjiData must be used inside KanjiDbProvider');
  return data;
}
