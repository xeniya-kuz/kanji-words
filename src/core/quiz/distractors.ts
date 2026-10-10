// Generates wrong answers ("distractors") for a word.
//
// Strategies, for the word 祖父 (そふ):
//   look-alike    replace one kanji with a visually similar one       租父, 祖交
//   same-reading  replace a kanji with another one read the same way  素父
//   homophone     another real word with the same reading             (きかん: 期間 → 機関, 帰還)
//   deck          another word from the learner's decks sharing a kanji
//   different     a kanji the learner knows that does NOT look alike  (used by "easy")
// Kana (okurigana, particles) is never changed, and other spellings of the same word are never offered.
//
// The options are balanced so the answer can't be guessed by picking the most frequent kanji at each
// position: either all wrong answers change the same kanji, or two positions are varied in a 2×2 grid
// (祖父 · 租父 · 祖交 · 租交) where every kanji appears exactly twice.
//
// Difficulty decides which candidates are picked:
//   easy    clearly different kanji the learner knows
//   normal  look-alikes, same-reading kanji and real words, with some randomness
//   hard    the most confusable: closest look-alikes, look-and-sound-alikes, real homophones

import type { FuriganaSegment } from '../text/furigana';
import { isKanji, toHiragana } from '../text/japanese';
import type { KanjiData } from './kanji-data';
import { shuffle } from './session';

export interface QuizWord {
  word: string;
  reading: string;
  alternatives: string[];
  furigana?: FuriganaSegment[];
}

export type Difficulty = 'easy' | 'normal' | 'hard';

export type CandidateSource = 'look-alike' | 'same-reading' | 'homophone' | 'deck' | 'double' | 'different';

export interface Candidate {
  text: string;
  source: CandidateSource;
  /** Character positions where it differs from the correct spelling. */
  changes: number[];
  /** 0..1, how alike the new kanji looks to the one it replaces (0 when it doesn't). */
  looks: number;
  /** The new kanji is read the same way as the one it replaces. */
  sounds: boolean;
  /** Of the least familiar kanji introduced: 1 known, 0.55 other Jōyō, 0.3 rare. */
  familiarity: number;
  /** For homophones: a common word. */
  common?: boolean;
  /** 0..1, how likely the learner is to confuse it with the correct spelling. */
  score: number;
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

const FAMILIAR = { known: 1, joyo: 0.55, rare: 0.3 };

/** "Clearly different" for easy mode means below this look-alike score. */
const EASY_MAX_LOOKS = 0.4;

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

type Draft = Omit<Candidate, 'score' | 'changes'>;

/** How confusable a candidate is, from its signals. */
function confusability(c: Draft): number {
  switch (c.source) {
    case 'look-alike':
    case 'same-reading':
      return Math.min(1, (c.looks + (c.sounds ? 0.45 : 0)) * c.familiarity);
    case 'homophone':
      return (c.common ? 0.75 : 0.35) * c.familiarity + 0.15 * c.looks;
    case 'double':
      return Math.min(1, (c.looks + (c.sounds ? 0.3 : 0)) * 0.85 * c.familiarity);
    case 'deck':
      return 0.5;
    case 'different':
      return 0.05 * c.familiarity;
  }
}

export async function findCandidates(
  note: QuizWord,
  data: KanjiData,
  options: DistractorOptions = {},
): Promise<Candidate[]> {
  const { isKnown = () => false, deckWords = [], random = Math.random } = options;
  const chars = [...note.word];
  const slots = chars.map((ch, i) => (isKanji(ch) && ch !== '々' && ch !== '〆' ? i : -1)).filter((i) => i >= 0);
  const slotReadings = perKanjiReadings(note);
  const accepted = await acceptedSpellings(note, data);
  const kanjiTable = new Map((await data.allKanji()).map((k) => [k.literal, k]));

  const familiarity = (kanji: string) => {
    const info = kanjiTable.get(kanji);
    if (!info) return 0;
    if (isKnown(kanji)) return FAMILIAR.known;
    return info.grade != null && info.grade <= 8 ? FAMILIAR.joyo : FAMILIAR.rare;
  };
  const textFamiliarity = (text: string) =>
    Math.min(1, ...[...text].filter((ch) => isKanji(ch) && ch !== '々' && !chars.includes(ch)).map(familiarity));

  // Candidates found by several strategies keep the strongest signals of each.
  const drafts = new Map<string, Draft>();
  const add = (d: Draft) => {
    if (d.familiarity <= 0 || accepted.has(d.text) || [...d.text].length !== chars.length) return;
    const existing = drafts.get(d.text);
    if (!existing) drafts.set(d.text, d);
    else {
      const strongest = confusability(d) > confusability(existing) ? d : existing;
      drafts.set(d.text, { ...strongest, looks: Math.max(d.looks, existing.looks), sounds: d.sounds || existing.sounds });
    }
  };
  const replaceAt = (slot: number, kanji: string) => chars.map((ch, i) => (i === slot ? kanji : ch)).join('');

  const lookAlikes = new Map<number, Map<string, number>>();
  for (const slot of slots) {
    const similar = new Map((await data.similar(chars[slot])).map((s) => [s.kanji, s.score]));
    lookAlikes.set(slot, similar);
    for (const [kanji, looks] of similar) {
      add({ text: replaceAt(slot, kanji), source: 'look-alike', looks, sounds: false, familiarity: familiarity(kanji) });
    }

    const reading = slotReadings.get(slot);
    if (!reading) continue;
    for (const variant of readingVariants(reading)) {
      for (const kanji of await data.kanjiWithReading(variant)) {
        if (kanji === chars[slot]) continue;
        const looks = similar.get(kanji) ?? 0;
        add({ text: replaceAt(slot, kanji), source: 'same-reading', looks, sounds: true, familiarity: familiarity(kanji) });
      }
    }
  }

  // Real words: homophones and words from the learner's decks. A word that differs in two kanji also
  // adds its single-kanji halves, so it can be one corner of a balanced grid (期間 · 機間 · 期関 · 機関).
  const ownKanji = new Set(slots.map((i) => chars[i]));
  const addWord = (draft: Draft) => {
    add(draft);
    const other = [...draft.text];
    if (other.length !== chars.length) return;
    const changed = slots.filter((i) => other[i] !== chars[i]);
    if (changed.length !== 2) return;
    for (const i of changed) {
      add({
        text: replaceAt(i, other[i]),
        source: draft.sounds ? 'same-reading' : 'different',
        looks: lookAlikes.get(i)?.get(other[i]) ?? 0,
        sounds: draft.sounds,
        familiarity: familiarity(other[i]),
      });
    }
  };
  for (const w of await data.wordsWithReading(toHiragana(note.reading))) {
    addWord({
      text: w.written,
      source: 'homophone',
      looks: [...w.written].some((ch) => ownKanji.has(ch)) ? 0.5 : 0,
      sounds: true,
      familiarity: textFamiliarity(w.written),
      common: w.common,
    });
  }

  // Deck words must share a kanji and have kana in the same places, or they are too easy to rule out.
  const shape = skeleton(note.word);
  for (const other of deckWords) {
    if (skeleton(other) === shape && [...other].some((ch) => ownKanji.has(ch))) {
      addWord({ text: other, source: 'deck', looks: 0.3, sounds: false, familiarity: FAMILIAR.known });
    }
  }

  // Clearly different kanji, for easy mode and as a fallback: known kanji (or early-grade ones)
  // with a similar stroke count that are not look-alikes.
  const known = [...kanjiTable.values()].filter((k) => isKnown(k.literal));
  const pool = known.length >= 30 ? known : [...kanjiTable.values()].filter((k) => k.grade != null && k.grade <= 4);
  for (const slot of slots) {
    const strokes = kanjiTable.get(chars[slot])?.strokes ?? 8;
    const similar = lookAlikes.get(slot) ?? new Map();
    const near = pool.filter(
      (k) => Math.abs(k.strokes - strokes) <= 3 && k.literal !== chars[slot] && !similar.has(k.literal),
    );
    for (const k of shuffle(near, random).slice(0, 6)) {
      add({ text: replaceAt(slot, k.literal), source: 'different', looks: 0, sounds: false, familiarity: familiarity(k.literal) });
    }
  }

  const slotSet = new Set(slots);
  return (
    [...drafts.values()]
      .map((d) => ({ ...d, changes: changedPositions(chars, d.text), score: confusability(d) }))
      // Only kanji may differ (a changed kana would stand out on its own), and a replacement must not
      // just copy another kanji of the word (地域 → 域域).
      .filter(
        (c) =>
          c.changes.length > 0 &&
          c.changes.every((i) => slotSet.has(i) && !chars.includes([...c.text][i])),
      )
      .sort((a, b) => b.score - a.score)
  );
}

/**
 * Picks 3 distractors for the difficulty, as a balanced set (see the top of this file): three
 * replacements of the same kanji, or a 2×2 grid over two kanji. Whichever balanced set ranks best wins.
 */
export function pickDistractors(
  word: string,
  candidates: Candidate[],
  accepted: ReadonlySet<string>,
  options: DistractorOptions = {},
): Candidate[] {
  const { difficulty = 'normal', count = 3, random = Math.random } = options;
  const chars = [...word];

  // Rare kanji are easy to rule out ("I've never seen that"), so only use them when nothing else is left.
  const familiar = candidates.filter((c) => c.familiarity > FAMILIAR.rare);
  let pool = familiar.length >= count ? familiar : candidates;

  let rank: (c: Candidate) => number;
  if (difficulty === 'easy') {
    const different = pool.filter((c) => c.looks < EASY_MAX_LOOKS && c.source !== 'homophone');
    if (different.length >= count) pool = different;
    rank = (c) => (1 - c.looks) * c.familiarity * (0.6 + 0.8 * random());
  } else if (difficulty === 'hard') {
    rank = (c) => c.score * (0.95 + 0.1 * random());
  } else {
    const similarOnes = pool.filter((c) => c.source !== 'different');
    if (similarOnes.length >= count) pool = similarOnes;
    rank = (c) => c.score * (0.6 + 0.8 * random());
  }
  const ranks = new Map<Candidate, number>();
  const valueOf = (c: Candidate) => {
    let v = ranks.get(c);
    if (v === undefined) ranks.set(c, (v = rank(c)));
    return v;
  };

  // Single-kanji replacements, best first, grouped by position.
  const singles = new Map<number, Candidate[]>();
  for (const c of pool) {
    if (c.changes.length !== 1) continue;
    const list = singles.get(c.changes[0]) ?? [];
    list.push(c);
    singles.set(c.changes[0], list);
  }
  for (const list of singles.values()) list.sort((a, b) => valueOf(b) - valueOf(a));

  let bestSet: Candidate[] | undefined;
  let bestValue = -Infinity;
  const consider = (set: Candidate[]) => {
    const value = set.reduce((sum, c) => sum + valueOf(c), 0);
    if (value > bestValue) [bestSet, bestValue] = [set, value];
  };

  // All wrong answers change the same kanji.
  for (const list of singles.values()) if (list.length >= count) consider(list.slice(0, count));

  // 2×2 grid: x replaces position i, y replaces position j, plus the option with both replaced.
  if (count === 3) {
    const byText = new Map(candidates.map((c) => [c.text, c]));
    const positions = [...singles.keys()];
    for (let a = 0; a < positions.length; a++) {
      for (let b = a + 1; b < positions.length; b++) {
        const [i, j] = [positions[a], positions[b]];
        for (const x of singles.get(i)!.slice(0, 5)) {
          for (const y of singles.get(j)!.slice(0, 5)) {
            const both = chars.map((ch, k) => (k === i ? [...x.text][i] : k === j ? [...y.text][j] : ch)).join('');
            if (accepted.has(both)) continue;
            consider([x, y, byText.get(both) ?? combine(both, x, y, [i, j])]);
          }
        }
      }
    }
  }

  // Not enough material for a balanced set (very rare): take the best candidates as they are.
  return bestSet ?? [...pool].sort((a, b) => valueOf(b) - valueOf(a)).slice(0, count);
}

export async function generateDistractors(
  note: QuizWord,
  data: KanjiData,
  options: DistractorOptions = {},
): Promise<Candidate[]> {
  const candidates = await findCandidates(note, data, options);
  return pickDistractors(note.word, candidates, await acceptedSpellings(note, data), options);
}

/** The grid corner where both replacements are applied. */
function combine(text: string, x: Candidate, y: Candidate, changes: number[]): Candidate {
  const draft: Draft = {
    text,
    source: 'double',
    looks: (x.looks + y.looks) / 2,
    sounds: x.sounds && y.sounds,
    familiarity: Math.min(x.familiarity, y.familiarity),
  };
  return { ...draft, changes, score: confusability(draft) };
}

function changedPositions(chars: string[], text: string): number[] {
  const other = [...text];
  return chars.map((ch, i) => (other[i] !== ch ? i : -1)).filter((i) => i >= 0);
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
