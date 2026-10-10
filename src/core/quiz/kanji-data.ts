// Read access to the bundled kanji database (assets/db/kanji.db).
// Written against a minimal SQL function so it runs on expo-sqlite in the app and node:sqlite in tests.

export interface KanjiInfo {
  literal: string;
  strokes: number;
  /** 1-6 school grade, 8 other Jōyō, 9-10 Jinmeiyō. */
  grade: number | null;
  rtk: number | null;
  freq: number | null;
}

export interface DictWord {
  written: string;
  /** JMdict entry: spellings sharing an entry are the same word. */
  entry: number;
  common: boolean;
}

export interface KanjiData {
  info(kanji: string): Promise<KanjiInfo | undefined>;
  allKanji(): Promise<KanjiInfo[]>;
  similar(kanji: string): Promise<{ kanji: string; score: number }[]>;
  kanjiWithReading(reading: string): Promise<string[]>;
  wordsWithReading(reading: string): Promise<DictWord[]>;
}

export type SqlAll = <T>(sql: string, params: (string | number)[]) => Promise<T[]>;

export function createKanjiData(all: SqlAll): KanjiData {
  let infoByKanji: Promise<Map<string, KanjiInfo>> | undefined;
  const loadInfo = () =>
    (infoByKanji ??= all<KanjiInfo>('SELECT literal, strokes, grade, rtk, freq FROM kanji', []).then(
      (rows) => new Map(rows.map((r) => [r.literal, r])),
    ));

  const similarCache = new Map<string, Promise<{ kanji: string; score: number }[]>>();
  const readingCache = new Map<string, Promise<string[]>>();
  const wordCache = new Map<string, Promise<DictWord[]>>();
  const cached = <T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>) => {
    let value = cache.get(key);
    if (!value) cache.set(key, (value = load()));
    return value;
  };

  return {
    info: async (kanji) => (await loadInfo()).get(kanji),
    allKanji: async () => [...(await loadInfo()).values()],
    similar: (kanji) =>
      cached(similarCache, kanji, () =>
        all<{ kanji: string; score: number }>(
          'SELECT other AS kanji, score FROM similar WHERE kanji = ? ORDER BY score DESC',
          [kanji],
        ),
      ),
    kanjiWithReading: (reading) =>
      cached(readingCache, reading, async () =>
        (await all<{ kanji: string }>('SELECT DISTINCT kanji FROM kanji_reading WHERE reading = ?', [reading])).map(
          (r) => r.kanji,
        ),
      ),
    wordsWithReading: (reading) =>
      cached(wordCache, reading, async () =>
        (
          await all<{ written: string; entry: number; common: number }>(
            'SELECT written, entry, common FROM word WHERE reading = ?',
            [reading],
          )
        ).map((r) => ({ written: r.written, entry: r.entry, common: r.common === 1 })),
      ),
  };
}
