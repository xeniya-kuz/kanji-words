// Generates wrong readings for the "kanji → reading" question (the JLPT's "Kanji Reading" part).
//
// Wrong readings are the mistakes learners really make, for 祖父 (そふ), 学校 (がっこう), 勉強 (べんきょう):
//   other-reading  a kanji read with another of its readings              そぶ → ぞふ, そうふ    (祖: ソ · そ)
//   voicing        a sound voiced or unvoiced (rendaku slips)             さんぽ ↔ さんぼ
//   long-vowel     a long vowel shortened, or a short one lengthened      ゆうめい ↔ ゆめい
//   gemination     a small っ dropped, added or replaced                  がっこう ↔ がこう, がくこう
//   vowel          a vowel changed within its row; weak, only as a filler  ふ → へ
// Readings the dictionary gives for the same spelling (今日: きょう, こんにち) are never offered as wrong.
//
// Difficulty works as it does for spellings:
//   easy    clearly off readings (random changes, fillers welcome)
//   normal  plausible slips, with some randomness
//   hard    the most plausible slips: other readings of the kanji, rendaku, long vowels

import { isHiraganaOnly, isKanji, toHiragana } from '../text/japanese';
import { readingVariants, type DistractorOptions, type QuizWord } from './distractors';
import type { KanjiData } from './kanji-data';

export type ReadingSource = 'other-reading' | 'voicing' | 'long-vowel' | 'gemination' | 'vowel';

export interface ReadingCandidate {
  text: string;
  source: ReadingSource;
  /** 0..1, how likely the learner is to confuse it with the correct reading. */
  score: number;
}

const SCORE = {
  otherReading: 1,
  otherKind: 0.35,
  rendaku: 0.85,
  longVowelRemoved: 0.8,
  geminationRemoved: 0.75,
  geminationReplaced: 0.7,
  longVowelAdded: 0.6,
  geminationAdded: 0.6,
  voicing: 0.5,
  vowel: 0.2,
};

const VOWEL_ROWS = ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'らりるれろ'];

/** The vowel sound of a hiragana character, or undefined for ん, っ, small kana, ー and others. */
const VOWEL_OF: Record<string, string> = {};
for (const [vowelRow, chars] of [
  ['あ', 'あかさたなはまやらわがざだばぱ'],
  ['い', 'いきしちにひみりぎじぢびぴ'],
  ['う', 'うくすつぬふむゆるぐずづぶぷゅ'],
  ['え', 'えけせてねへめれげぜでべぺ'],
  ['お', 'おこそとのほもよろをごぞどぼぽょ'],
] as const) {
  for (const ch of chars) VOWEL_OF[ch] = vowelRow;
}

const UNVOICED_OF: Record<string, string> = Object.fromEntries(
  [...'がぎぐげござじずぜぞだでどばびぶべぼぱぴぷぺぽ'].map((ch, i) => [
    ch,
    'かきくけこさしすせそたてとはひふへほはひふへほ'[i],
  ]),
);
const VOICED_OF: Record<string, string[]> = {};
for (const [voiced, plain] of Object.entries(UNVOICED_OF)) (VOICED_OF[plain] ??= []).push(voiced);

/** Characters a small っ can sit in front of. */
const GEMINATES_BEFORE = new Set([...'かきくけこさしすせそたちつてとぱぴぷぺぽ']);
/** Characters a small っ can replace: the end of a Sino-Japanese syllable. */
const GEMINATE_ENDS = new Set([...'つくちき']);
const SMALL_YOON = new Set([...'ゃゅょ']);

/** Positions in the reading where each kanji segment starts, when the furigana adds up to the reading. */
function segmentStarts(note: QuizWord): Set<number> {
  const starts = new Set<number>();
  let offset = 0;
  let joined = '';
  for (const segment of note.furigana ?? []) {
    const text = toHiragana(segment.reading ?? segment.text);
    if (segment.reading) starts.add(offset);
    offset += [...text].length;
    joined += text;
  }
  return joined === toHiragana(note.reading) ? starts : new Set();
}

interface Slot {
  kanji: string;
  start: number;
  reading: string;
  /** Kana follows the kanji (okurigana), so a Sino-Japanese reading would sound off. */
  hasOkurigana: boolean;
}

/** Kanji that carry a reading of their own, with the part of the reading they own. */
function singleKanjiSlots(note: QuizWord): Slot[] {
  const segments = note.furigana ?? [];
  const slots: Slot[] = [];
  let offset = 0;
  let joined = '';
  segments.forEach((segment, i) => {
    const text = toHiragana(segment.reading ?? segment.text);
    const length = [...text].length;
    if (segment.reading && [...segment.text].length === 1 && isKanji(segment.text) && segment.text !== '々') {
      const next = segments[i + 1];
      slots.push({
        kanji: segment.text,
        start: offset,
        reading: text,
        hasOkurigana: !!next && !next.reading,
      });
    }
    offset += length;
    joined += text;
  });
  // Only usable when the segments really spell the reading.
  return joined === toHiragana(note.reading) ? slots : [];
}

const replaceRange = (chars: string[], start: number, length: number, text: string) =>
  [...chars.slice(0, start), ...text, ...chars.slice(start + length)].join('');

export async function findReadingCandidates(note: QuizWord, data: KanjiData): Promise<ReadingCandidate[]> {
  const correct = toHiragana(note.reading);
  const chars = [...correct];

  // Never offer a reading that is also right for this spelling.
  const accepted = new Set<string>([correct, note.reading]);
  for (const spelling of [note.word, ...note.alternatives]) {
    for (const reading of await data.readingsOfWord(spelling)) accepted.add(toHiragana(reading));
  }

  const found = new Map<string, ReadingCandidate>();
  const add = (text: string, source: ReadingSource, score: number) => {
    if (!text || accepted.has(text) || text.startsWith('っ') || text.startsWith('ー')) return;
    const existing = found.get(text);
    if (!existing || existing.score < score) found.set(text, { text, source, score });
  };

  // A kanji read with one of its other readings. Another reading of the same kind (on for on, kun for kun)
  // is a real mix-up; swapping an on reading for a kun one (しんぶん → あたらぶん) is easy to rule out.
  for (const slot of singleKanjiSlots(note)) {
    // The reading in the word may be rendaku'd or geminated (がく → がっ); those are the same reading.
    const own = new Set(readingVariants(slot.reading));
    const all = await data.readingsOfKanji(slot.kanji);
    const usedKind = all.find((r) => own.has(r.reading))?.kind;
    for (const other of all) {
      if (own.has(other.reading)) continue;
      const score = other.kind === usedKind ? SCORE.otherReading : SCORE.otherKind;
      add(replaceRange(chars, slot.start, [...slot.reading].length, other.reading), 'other-reading', score);
    }
  }

  const starts = segmentStarts(note);

  chars.forEach((ch, i) => {
    // Voicing: か ↔ が, は ↔ ば ↔ ぱ. Rendaku slips happen where a new kanji starts.
    // は, ば and ぱ are one group: each can be mistaken for the others.
    const plain = UNVOICED_OF[ch] ?? ch;
    const swaps = [plain, ...(VOICED_OF[plain] ?? [])].filter((s) => s !== ch);
    for (const swap of swaps) {
      add(replaceRange(chars, i, 1, swap), 'voicing', i > 0 && starts.has(i) ? SCORE.rendaku : SCORE.voicing);
    }

    // Long vowels: drop the う of おう/うう and the い of えい, or add one after a syllable that can take it.
    const vowel = VOWEL_OF[ch];
    if ((ch === 'う' && i > 0 && ['お', 'う'].includes(VOWEL_OF[chars[i - 1]] ?? '')) ||
        (ch === 'い' && i > 0 && VOWEL_OF[chars[i - 1]] === 'え')) {
      add(replaceRange(chars, i, 1, ''), 'long-vowel', SCORE.longVowelRemoved);
    }
    // A long vowel is only added inside a word (not at its end, not before ん or っ), and never to one
    // that is already long (がっこうう).
    const next = chars[i + 1];
    const takesU = (vowel === 'お' || vowel === 'う') && ch !== 'う';
    const takesI = vowel === 'え';
    const inside = next !== undefined && !['う', 'い', 'ー', 'ん', 'っ'].includes(next) && !SMALL_YOON.has(next);
    if (inside) {
      if (takesU) add(replaceRange(chars, i + 1, 0, 'う'), 'long-vowel', SCORE.longVowelAdded);
      else if (takesI) add(replaceRange(chars, i + 1, 0, 'い'), 'long-vowel', SCORE.longVowelAdded);
    }

    // Small っ: drop it, replace it with the sound it stands for, or add one.
    if (ch === 'っ') {
      add(replaceRange(chars, i, 1, ''), 'gemination', SCORE.geminationRemoved);
      for (const end of GEMINATE_ENDS) add(replaceRange(chars, i, 1, end), 'gemination', SCORE.geminationReplaced);
    } else if (
      i > 0 &&
      GEMINATES_BEFORE.has(ch) &&
      !['っ', 'ん', 'ー'].includes(chars[i - 1])
    ) {
      add(replaceRange(chars, i, 0, 'っ'), 'gemination', SCORE.geminationAdded);
    }
    if (GEMINATE_ENDS.has(ch) && next && GEMINATES_BEFORE.has(next)) {
      add(replaceRange(chars, i, 1, 'っ'), 'gemination', SCORE.geminationReplaced);
    }
  });

  // Fillers: a vowel changed within its row. Weak, but there is always something to offer.
  chars.forEach((ch, i) => {
    const row = VOWEL_ROWS.find((r) => r.includes(ch));
    if (!row) return;
    for (const other of row) if (other !== ch) add(replaceRange(chars, i, 1, other), 'vowel', SCORE.vowel);
  });

  return [...found.values()].sort((a, b) => b.score - a.score);
}

/**
 * Picks `count` wrong readings for the difficulty. The sources are mixed, so the learner can't rule
 * answers out by spotting "the one with a っ".
 */
export function pickReadingDistractors(
  candidates: ReadingCandidate[],
  options: DistractorOptions = {},
): ReadingCandidate[] {
  const { difficulty = 'normal', count = 3, random = Math.random } = options;
  const rank = (c: ReadingCandidate) => {
    if (difficulty === 'easy') return (1.1 - c.score) * (0.6 + 0.8 * random());
    if (difficulty === 'hard') return c.score * (0.95 + 0.1 * random());
    return c.score * (0.6 + 0.8 * random());
  };
  const ranked = candidates.map((c) => ({ c, value: rank(c) }));

  const picked: ReadingCandidate[] = [];
  while (picked.length < count && ranked.length > 0) {
    // Each source already picked makes another candidate of it less attractive.
    let best = 0;
    let bestValue = -Infinity;
    ranked.forEach(({ c, value }, i) => {
      const repeats = picked.filter((p) => p.source === c.source).length;
      const adjusted = value * 0.65 ** repeats;
      if (adjusted > bestValue) [best, bestValue] = [i, adjusted];
    });
    picked.push(ranked.splice(best, 1)[0].c);
  }
  return picked;
}

export async function generateReadingDistractors(
  note: QuizWord,
  data: KanjiData,
  options: DistractorOptions = {},
): Promise<ReadingCandidate[]> {
  return pickReadingDistractors(await findReadingCandidates(note, data), options);
}

/** Whether a word can be asked as "kanji → reading": it has kanji and a plain hiragana reading. */
export function canAskReading(note: Pick<QuizWord, 'word' | 'reading'>): boolean {
  return [...note.word].some(isKanji) && isHiraganaOnly(note.reading);
}
