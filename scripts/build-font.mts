/// <reference types="node" />
// Builds assets/fonts/NotoSansJP-Subset.ttf: Noto Sans JP reduced to the characters the app shows
// in Japanese text: the kanji in kanji.db, kana, Japanese punctuation and Latin letters.
// The full font is 5.7 MB; the subset is a fraction of that.
//
//   npm run build:font      (run after build:kanji-db when the kanji list changes)
//
// Kanji outside the subset still display, in the phone's own font.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import subsetFont from 'subset-font';

const ROOT = path.join(import.meta.dirname, '..');
const SOURCE = path.join(ROOT, 'node_modules/@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf');
const KANJI_DB = path.join(ROOT, 'assets/db/kanji.db');
const OUTPUT = path.join(ROOT, 'assets/fonts/NotoSansJP-Subset.ttf');

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i)).join('');

const db = new DatabaseSync(KANJI_DB, { readOnly: true });
const kanji = (db.prepare('SELECT literal FROM kanji').all() as { literal: string }[]).map((r) => r.literal).join('');
db.close();

const text = [
  range(0x20, 0x7e), // ASCII
  range(0xa0, 0xff), // Latin-1
  range(0x2010, 0x2027), // dashes, quotes, ellipsis
  range(0x2190, 0x2193), // arrows
  range(0x3000, 0x303f), // CJK punctuation, 々 〆 〇 「」
  range(0x3041, 0x309f), // hiragana
  range(0x30a0, 0x30ff), // katakana
  range(0x31f0, 0x31ff), // small katakana for Ainu
  range(0xff01, 0xffef), // full-width forms
  kanji,
].join('');

const subset = await subsetFont(fs.readFileSync(SOURCE), text, { targetFormat: 'truetype' });
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, subset);
const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);
console.log(
  `${path.relative(ROOT, OUTPUT)}: ${[...text].length} characters, ${mb(subset.length)} MB (full font ${mb(fs.statSync(SOURCE).size)} MB)`,
);
