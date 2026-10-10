// Generates wrong answers ("distractors") that look or sound like the correct spelling.
//
// Strategies, for the word 祖父 (そふ):
//   look-alike    replace one kanji with a visually similar one       租父, 祖交
//   same-reading  replace a kanji with another one read the same way  素父
//   homophone     another real word with the same reading             (きかん: 期間 → 機関, 帰還)
//   deck          another word from the learner's decks sharing a kanji
//   swap          two kanji in reverse order                          父祖
//   double        two look-alike replacements in a long word
//   fallback      a random kanji with a similar stroke count
// Kana (okurigana, particles) is never changed, and other spellings of the same word are never offered.

import type { FuriganaSegment } from '../text/furigana';
import { isKanji, toHiragana } from '../text/japanese';
import type { KanjiData, KanjiInfo } from './kanji-data';

export interface QuizWord {
  word: string;
  reading: string;
  alternatives: string[];
  furigana?: FuriganaSegment[];
}

export type Difficulty = 'easy' | 'normal' | 'hard';

export type CandidateSource = 'look-alike' | 'same-reading' | 'homophone' | 'deck' | 'swap' | 'double' | 'fallback';

export interface Candidate {
  text: string;
  /** 0..1, how likely the learner is to confuse it with the correct spelling. */
  score: number;
  source: CandidateSource;
  /** Index of the character that was replaced, for single replacements. */
  slot?: number;
}

export interface DistractorOptions {
  /** Kanji the learner knows; distractors made of known kanji are harder and fairer. */
  isKnown?: (kanji: string) => boolean;
  /** Other words from the learner's decks. */
  deckWords?: string[];
  difficulty?: Difficulty;
  count?: number;
  random?: () => number;
}

const UNVOICED: Record<string, string> = Object.fromEntries(
  [...'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ'].map((ch, i) => [
    ch,
    'かきくけこさしすせそたちつてとはひふへほはひふへほ'[i],
  ]),
);

/** Readings a kanji may have in its dictionary form: undoes rendaku (が→か) and gemination (しゅっ→しゅつ). */
export function readingVariants(reading: string): string[] {
  const r = toHiragana(reading);
  const variants = new Set([r]);
  if (UNVOICED[r[0]]) variants.add(UNVOICED[r[0]] + r.slice(1));
  if (r.length > 1 && r.endsWith('っ')) for (const end of 'つくちき') variants.add(r.slice(0, -1) + end);
  return [...variants];
}

/** Spellings that must never be offered as wrong: the word, its alternatives and its JMdict variants. */
export async function acceptedSpellings(note: QuizWord, data: KanjiData): Promise<Set<string>> {
  const own = new Set([note.word, ...note.alternatives]);
  const dict = await data.wordsWithReading(toHiragana(note.reading));
  const entries = new Set(dict.filter((w) => own.has(w.written)).map((w) => w.entry));
  for (const w of dict) if (entries.has(w.entry)) own.add(w.written);
  return own;
}

export async function findCandidates(
  note: QuizWord,
  data: KanjiData,
  options: DistractorOptions = {},
): Promise<Candidate[]> {
  const { isKnown = () => false, deckWords = [] } = options;
  const chars = [...note.word];
  const slots = chars.map((ch, i) => (isKanji(ch) && ch !== '々' && ch !== '〆' ? i : -1)).filter((i) => i >= 0);
  const slotReadings = perKanjiReadings(note);
  const accepted = await acceptedSpellings(note, data);
  const kanjiTable = new Map((await data.allKanji()).map((k) => [k.literal, k]));

  // How plausible a kanji is as part of a wrong answer: known kanji first, then other Jōyō kanji.
  const weight = (kanji: string) => {
    const info = kanjiTable.get(kanji);
    if (!info) return 0;
    if (isKnown(kanji)) return 1;
    return info.grade != null && info.grade <= 8 ? 0.55 : 0.3;
  };
  const textWeight = (text: string) =>
    Math.min(1, ...[...text].filter((ch) => isKanji(ch) && ch !== '々').map(weight));

  const best = new Map<string, Candidate>();
  const add = (candidate: Candidate) => {
    if (candidate.score <= 0 || accepted.has(candidate.text) || [...candidate.text].length !== chars.length) return;
    const existing = best.get(candidate.text);
    if (!existing || existing.score < candidate.score) best.set(candidate.text, candidate);
  };
  const replaceAt = (slot: number, kanji: string) => chars.map((ch, i) => (i === slot ? kanji : ch)).join('');

  const lookAlikes = new Map<number, { kanji: string; score: number }[]>();
  for (const slot of slots) {
    const similar = (await data.similar(chars[slot])).map((s) => ({ kanji: s.kanji, score: s.score * weight(s.kanji) }));
    lookAlikes.set(slot, similar);
    for (const s of similar) add({ text: replaceAt(slot, s.kanji), score: s.score, source: 'look-alike', slot });

    const reading = slotReadings.get(slot);
    if (!reading) continue;
    const similarScore = new Map(similar.map((s) => [s.kanji, s.score]));
    for (const variant of readingVariants(reading)) {
      for (const kanji of await data.kanjiWithReading(variant)) {
        if (kanji === chars[slot]) continue;
        const score = 0.5 * weight(kanji) + 0.3 * (similarScore.get(kanji) ?? 0);
        add({ text: replaceAt(slot, kanji), score, source: 'same-reading', slot });
      }
    }
  }

  const ownKanji = new Set(slots.map((i) => chars[i]));
  for (const w of await data.wordsWithReading(toHiragana(note.reading))) {
    const sharesKanji = [...w.written].some((ch) => ownKanji.has(ch));
    add({
      text: w.written,
      score: (w.common ? 0.7 : 0.35) * textWeight(w.written) + (sharesKanji ? 0.1 : 0),
      source: 'homophone',
    });
  }

  // Deck words must share a kanji and have kana in the same places, or they are too easy to rule out.
  const shape = skeleton(note.word);
  for (const other of deckWords) {
    if (skeleton(other) === shape && [...other].some((ch) => ownKanji.has(ch))) {
      add({ text: other, score: 0.5, source: 'deck' });
    }
  }

  for (let i = 0; i + 1 < slots.length; i++) {
    const [a, b] = [slots[i], slots[i + 1]];
    if (b !== a + 1 || chars[a] === chars[b]) continue;
    add({ text: chars.map((ch, k) => (k === a ? chars[b] : k === b ? chars[a] : ch)).join(''), score: 0.35, source: 'swap' });
  }

  if (slots.length >= 3) {
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const [x, y] = [lookAlikes.get(slots[i])?.[0], lookAlikes.get(slots[j])?.[0]];
        if (!x || !y) continue;
        const text = chars.map((ch, k) => (k === slots[i] ? x.kanji : k === slots[j] ? y.kanji : ch)).join('');
        add({ text, score: ((x.score + y.score) / 2) * 0.85, source: 'double' });
      }
    }
  }

  if (best.size < (options.count ?? 3) && slots.length > 0) {
    addFallbacks(chars, slots, kanjiTable, isKnown, options.random ?? Math.random, add);
  }

  return [...best.values()].sort((a, b) => b.score - a.score);
}

/** Picks distractors: the most confusable ones for the difficulty, spread over positions and strategies. */
export function pickDistractors(candidates: Candidate[], options: DistractorOptions = {}): Candidate[] {
  const { difficulty = 'normal', count = 3, random = Math.random } = options;
  const ranked = candidates
    .map((c) => {
      const jitter = random();
      const rank =
        difficulty === 'hard'
          ? c.score * (0.9 + 0.2 * jitter)
          : difficulty === 'easy'
            ? (1 - Math.abs(c.score - 0.35)) * (0.7 + 0.6 * jitter)
            : c.score * (0.7 + 0.6 * jitter);
      return { c, rank };
    })
    .sort((a, b) => b.rank - a.rank)
    .map((r) => r.c);

  const picked: Candidate[] = [];
  const perSlot = new Map<number, number>();
  const perSource = new Map<CandidateSource, number>();
  const take = (c: Candidate) => {
    picked.push(c);
    if (c.slot != null) perSlot.set(c.slot, (perSlot.get(c.slot) ?? 0) + 1);
    perSource.set(c.source, (perSource.get(c.source) ?? 0) + 1);
  };

  // First pass: at most 2 per position and per strategy. Second pass: fill up with whatever is left.
  for (const c of ranked) {
    if (picked.length === count) break;
    if (c.slot != null && (perSlot.get(c.slot) ?? 0) >= 2) continue;
    if ((perSource.get(c.source) ?? 0) >= 2) continue;
    take(c);
  }
  for (const c of ranked) {
    if (picked.length === count) break;
    if (!picked.includes(c)) take(c);
  }
  return picked;
}

export async function generateDistractors(
  note: QuizWord,
  data: KanjiData,
  options: DistractorOptions = {},
): Promise<Candidate[]> {
  return pickDistractors(await findCandidates(note, data, options), options);
}

/** "電池が切れる" → "**が*れる": where the kanji and the kana are. */
function skeleton(text: string): string {
  return [...text].map((ch) => (isKanji(ch) ? '*' : ch)).join('');
}

/** Maps character index → reading for kanji that have their own reading in the furigana. */
function perKanjiReadings(note: QuizWord): Map<number, string> {
  const readings = new Map<number, string>();
  let offset = 0;
  for (const segment of note.furigana ?? []) {
    const length = [...segment.text].length;
    if (segment.reading && length === 1) readings.set(offset, segment.reading);
    offset += length;
  }
  return readings;
}

function addFallbacks(
  chars: string[],
  slots: number[],
  kanjiTable: Map<string, KanjiInfo>,
  isKnown: (kanji: string) => boolean,
  random: () => number,
  add: (c: Candidate) => void,
) {
  const pool = [...kanjiTable.values()].filter((k) => isKnown(k.literal) || (k.grade != null && k.grade <= 6));
  for (let attempt = 0; attempt < 12; attempt++) {
    const slot = slots[Math.floor(random() * slots.length)];
    const strokes = kanjiTable.get(chars[slot])?.strokes ?? 8;
    const near = pool.filter((k) => Math.abs(k.strokes - strokes) <= 2 && k.literal !== chars[slot]);
    if (near.length === 0) continue;
    const kanji = near[Math.floor(random() * near.length)].literal;
    add({ text: chars.map((ch, i) => (i === slot ? kanji : ch)).join(''), score: 0.05, source: 'fallback', slot });
  }
}
