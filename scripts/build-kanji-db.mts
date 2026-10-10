/// <reference types="node" />
// Builds assets/db/kanji.db: the kanji data bundled with the app.
//
//   npm run build:kanji-db
//
// Sources (downloaded once into data-cache/):
//   - KANJIDIC2, KRADFILE, JMdict — EDRDG, CC BY-SA 4.0, via jmdict-simplified (JSON releases)
//     https://www.edrdg.org/edrdg/licence.html  https://github.com/scriptin/jmdict-simplified
//   - Kanji similarity sets (stroke edit distance, Yeh & Li radical) — Lars Yencken, CC BY 3.0
//     https://lars.yencken.org/datasets/kanji-confusion
//
// Runs on plain Node 24 (built-in TypeScript type stripping and node:sqlite), no extra packages.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import zlib from 'node:zlib';

const ROOT = path.join(import.meta.dirname, '..');
const CACHE_DIR = path.join(ROOT, 'data-cache');
const OUTPUT = path.join(ROOT, 'assets', 'db', 'kanji.db');

/** Bump when the schema or content changes, so the app knows to replace its copy. */
const DB_VERSION = 1;

const SIMPLIFIED_RELEASE = 'https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest';
const YENCKEN = 'http://lars.yencken.org/datasets/kanji-confusion';

const MAX_NEIGHBOURS = 15;
const MIN_COMPONENT_SIMILARITY = 0.45;

// ---------------------------------------------------------------- source formats (jmdict-simplified)

interface Kanjidic2 {
  characters: {
    literal: string;
    misc: { grade: number | null; strokeCounts: number[]; frequency: number | null; jlptLevel: number | null };
    dictionaryReferences: { type: string; value: string }[];
    readingMeaning: {
      groups: { readings: { type: string; value: string }[]; meanings: { lang: string; value: string }[] }[];
    } | null;
  }[];
}

interface Kradfile {
  kanji: Record<string, string[]>;
}

interface JMdict {
  words: {
    id: string;
    kanji: { text: string; common: boolean; tags: string[] }[];
    kana: { text: string; common: boolean; tags: string[]; appliesToKanji: string[] }[];
  }[];
}

// ---------------------------------------------------------------- downloads

async function download(url: string, file: string): Promise<string> {
  const target = path.join(CACHE_DIR, file);
  if (fs.existsSync(target)) return target;
  console.log(`  downloading ${url}`);
  const response = await fetch(url, { headers: { 'User-Agent': 'kanji-words-build' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  return target;
}

/** Downloads a jmdict-simplified asset (.json.tgz) and returns the parsed JSON. */
async function simplified<T>(prefix: string): Promise<T> {
  const release = (await (await fetch(SIMPLIFIED_RELEASE)).json()) as {
    assets: { name: string; browser_download_url: string }[];
  };
  const asset = release.assets.find((a) => a.name.startsWith(`${prefix}-`) && a.name.endsWith('.json.tgz'));
  if (!asset) throw new Error(`No ${prefix} asset in the latest jmdict-simplified release`);
  const file = await download(asset.browser_download_url, asset.name);
  return JSON.parse(untarSingleFile(zlib.gunzipSync(fs.readFileSync(file))).toString('utf8')) as T;
}

/** Minimal tar reader: returns the first regular file in the archive. */
function untarSingleFile(tar: Buffer): Buffer {
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const size = parseInt(tar.subarray(offset + 124, offset + 136).toString('ascii').trim(), 8) || 0;
    const type = String.fromCharCode(tar[offset + 156]);
    const start = offset + 512;
    if (type === '0' || type === '\0') return tar.subarray(start, start + size);
    offset = start + Math.ceil(size / 512) * 512;
  }
  throw new Error('No file found in tar archive');
}

// ---------------------------------------------------------------- helpers

const KANJI_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u{20000}-\u{3134F}]/u;
const isKanji = (ch: string) => KANJI_RE.test(ch);
const toHiragana = (s: string) =>
  s.replace(/[\u30A1-\u30F6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));

/** "ひと.つ" → "ひと", "-ひと" → "ひと": the part of a kun reading written with the kanji. */
const kunStem = (reading: string) => reading.replace(/-/g, '').split('.')[0];

type Neighbours = Map<string, Map<string, number>>;

function addNeighbour(map: Neighbours, a: string, b: string, score: number) {
  if (a === b) return;
  const list = map.get(a) ?? new Map<string, number>();
  if ((list.get(b) ?? 0) < score) list.set(b, score);
  map.set(a, list);
}

/** Parses Yencken's "pivot neighbour score neighbour score ..." lines. */
function readSimilaritySet(file: string, weight: number, into: Neighbours) {
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const [pivot, ...rest] = line.trim().split(/\s+/);
    if (!pivot) continue;
    for (let i = 0; i + 1 < rest.length; i += 2) {
      const score = parseFloat(rest[i + 1]) * weight;
      addNeighbour(into, pivot, rest[i], score);
      addNeighbour(into, rest[i], pivot, score);
    }
  }
}

/** Shared components (Jaccard), lowered when stroke counts differ a lot. */
function componentSimilarity(a: string[], b: string[], strokesA: number, strokesB: number): number {
  const setB = new Set(b);
  const shared = a.filter((c) => setB.has(c)).length;
  if (shared === 0) return 0;
  const jaccard = shared / (a.length + b.length - shared);
  return jaccard * (1 - Math.min(Math.abs(strokesA - strokesB), 10) / 20);
}

// ---------------------------------------------------------------- build

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });

  console.log('Loading sources…');
  const kanjidic = await simplified<Kanjidic2>('kanjidic2-en');
  const krad = await simplified<Kradfile>('kradfile');
  const jmdict = await simplified<JMdict>('jmdict-eng');
  const strokeFile = await download(`${YENCKEN}/jyouyou__strokeEditDistance.csv`, 'yencken-stroke.csv');
  const radicalFile = await download(`${YENCKEN}/jyouyou__yehAndLiRadical.csv`, 'yencken-radical.csv');

  // Kanji worth teaching: Jōyō/Jinmeiyō (grade), RTK, or among the 2500 most frequent.
  const ref = (c: Kanjidic2['characters'][number], type: string) =>
    Number(c.dictionaryReferences.find((r) => r.type === type)?.value) || null;
  const characters = kanjidic.characters
    .map((c) => {
      const groups = c.readingMeaning?.groups ?? [];
      const readings = groups.flatMap((g) => g.readings);
      return {
        literal: c.literal,
        strokes: c.misc.strokeCounts[0] ?? 0,
        grade: c.misc.grade,
        jlpt: c.misc.jlptLevel,
        freq: c.misc.frequency,
        rtk: ref(c, 'heisig6') ?? ref(c, 'heisig'),
        onyomi: readings.filter((r) => r.type === 'ja_on').map((r) => r.value),
        kunyomi: readings.filter((r) => r.type === 'ja_kun').map((r) => r.value),
        meanings: groups.flatMap((g) => g.meanings.filter((m) => m.lang === 'en').map((m) => m.value)),
        components: krad.kanji[c.literal] ?? [],
      };
    })
    .filter((c) => c.grade != null || c.rtk != null || c.freq != null);
  const byLiteral = new Map(characters.map((c) => [c.literal, c]));
  console.log(`  ${characters.length} kanji`);

  console.log('Computing similar kanji…');
  const neighbours: Neighbours = new Map();
  readSimilaritySet(strokeFile, 1, neighbours);
  readSimilaritySet(radicalFile, 0.95, neighbours);
  for (const a of characters) {
    if (a.components.length === 0) continue;
    const scored: [string, number][] = [];
    for (const b of characters) {
      if (a === b || b.components.length === 0) continue;
      const score = componentSimilarity(a.components, b.components, a.strokes, b.strokes);
      if (score >= MIN_COMPONENT_SIMILARITY) scored.push([b.literal, score * 0.9]);
    }
    scored.sort((x, y) => y[1] - x[1]);
    for (const [b, score] of scored.slice(0, MAX_NEIGHBOURS)) addNeighbour(neighbours, a.literal, b, score);
  }

  console.log('Collecting words…');
  const words = new Map<string, { written: string; reading: string; common: boolean }>();
  for (const entry of jmdict.words) {
    for (const k of entry.kanji) {
      const chars = [...k.text];
      if (!chars.some(isKanji) || !chars.every((ch) => !isKanji(ch) || byLiteral.has(ch))) continue;
      if (k.tags.includes('sK')) continue; // search-only spellings
      for (const r of entry.kana) {
        if (r.tags.includes('sk')) continue;
        if (!r.appliesToKanji.includes('*') && !r.appliesToKanji.includes(k.text)) continue;
        const reading = toHiragana(r.text);
        const key = `${k.text}|${reading}`;
        const common = k.common && r.common;
        const existing = words.get(key);
        if (!existing) words.set(key, { written: k.text, reading, common });
        else existing.common ||= common;
      }
    }
  }
  console.log(`  ${words.size} spellings`);

  console.log(`Writing ${path.relative(ROOT, OUTPUT)}…`);
  fs.rmSync(OUTPUT, { force: true });
  const db = new DatabaseSync(OUTPUT);
  db.exec(`
    PRAGMA user_version = ${DB_VERSION};
    CREATE TABLE kanji (
      literal    TEXT PRIMARY KEY,
      strokes    INTEGER NOT NULL,
      grade      INTEGER,          -- 1-6 school grade, 8 other Jōyō, 9-10 Jinmeiyō
      jlpt       INTEGER,          -- old JLPT level 1-4
      freq       INTEGER,          -- newspaper frequency rank 1-2500
      rtk        INTEGER,          -- Remembering the Kanji frame (6th edition)
      onyomi     TEXT NOT NULL,    -- space separated katakana
      kunyomi    TEXT NOT NULL,    -- space separated, okurigana after "."
      meanings   TEXT NOT NULL,    -- English, "; " separated
      components TEXT NOT NULL     -- KRADFILE components, concatenated
    ) WITHOUT ROWID;
    CREATE TABLE similar (
      kanji TEXT NOT NULL,
      other TEXT NOT NULL,
      score REAL NOT NULL,         -- 0..1, higher looks more alike
      PRIMARY KEY (kanji, other)
    ) WITHOUT ROWID;
    CREATE TABLE kanji_reading (
      reading TEXT NOT NULL,       -- hiragana; kun readings without okurigana
      kanji   TEXT NOT NULL,
      kind    TEXT NOT NULL,       -- 'on' | 'kun'
      PRIMARY KEY (reading, kanji, kind)
    ) WITHOUT ROWID;
    CREATE TABLE word (
      reading TEXT NOT NULL,       -- hiragana; words are always looked up by reading
      written TEXT NOT NULL,
      common  INTEGER NOT NULL,
      PRIMARY KEY (reading, written)
    ) WITHOUT ROWID;
  `);

  db.exec('BEGIN');
  const insertKanji = db.prepare('INSERT INTO kanji VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertReading = db.prepare('INSERT OR IGNORE INTO kanji_reading VALUES (?, ?, ?)');
  for (const c of characters) {
    insertKanji.run(
      c.literal, c.strokes, c.grade, c.jlpt, c.freq, c.rtk,
      c.onyomi.join(' '), c.kunyomi.join(' '), c.meanings.join('; '), c.components.join(''),
    );
    for (const on of c.onyomi) insertReading.run(toHiragana(on), c.literal, 'on');
    for (const kun of c.kunyomi) if (kunStem(kun)) insertReading.run(kunStem(kun), c.literal, 'kun');
  }

  const insertSimilar = db.prepare('INSERT INTO similar VALUES (?, ?, ?)');
  let similarCount = 0;
  for (const [kanji, list] of neighbours) {
    if (!byLiteral.has(kanji)) continue;
    const best = [...list].filter(([other]) => byLiteral.has(other)).sort((x, y) => y[1] - x[1]);
    for (const [other, score] of best.slice(0, MAX_NEIGHBOURS)) {
      insertSimilar.run(kanji, other, Math.round(score * 1000) / 1000);
      similarCount++;
    }
  }

  const insertWord = db.prepare('INSERT INTO word VALUES (?, ?, ?)');
  for (const w of words.values()) insertWord.run(w.reading, w.written, w.common ? 1 : 0);
  db.exec('COMMIT');
  db.exec('VACUUM');
  db.close();

  const size = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1);
  console.log(`Done: ${characters.length} kanji, ${similarCount} similar pairs, ${words.size} words, ${size} MB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
