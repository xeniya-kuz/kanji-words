import { knownKanjiSet } from '../quiz/known-kanji';
import type { KanjiInfo } from '../quiz/kanji-data';
import {
  BOX_INTERVALS,
  MAX_BOX,
  buildQueue,
  modeCounts,
  schedule,
  selectExtraItems,
  type ProgressByDirection,
  type Progress,
} from '../quiz/srs';
import { DEFAULT_SETTINGS, normalizeSettings } from '../settings';
import { accuracy, dayKey, streakDays } from '../stats';

const NOW = new Date(2026, 9, 10, 12, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

describe('schedule', () => {
  it('moves up a box on correct answers and back to box 0 on wrong ones', () => {
    const first = schedule(undefined, 'n1', true, NOW);
    expect(first).toEqual({ noteId: 'n1', box: 1, dueAt: NOW + BOX_INTERVALS[1], correct: 1, wrong: 0, lastSeen: NOW });
    const second = schedule(first, 'n1', true, NOW + DAY);
    expect(second.box).toBe(2);
    const wrong = schedule(second, 'n1', false, NOW + 2 * DAY);
    expect(wrong).toMatchObject({ box: 0, dueAt: NOW + 2 * DAY + 10 * 60 * 1000, correct: 2, wrong: 1 });
  });

  it('keeps the box when a word is answered correctly before it is due', () => {
    const first = schedule(undefined, 'n1', true, NOW);
    const early = schedule(first, 'n1', true, NOW + 60 * 1000);
    expect(early).toEqual({ ...first, correct: 2, lastSeen: NOW + 60 * 1000 });
    expect(schedule(first, 'n1', false, NOW + 60 * 1000).box).toBe(0);
  });

  it('caps at the last box', () => {
    const top: Progress = { noteId: 'n', box: MAX_BOX, dueAt: 0, correct: 9, wrong: 0, lastSeen: 0 };
    expect(schedule(top, 'n', true, NOW).box).toBe(MAX_BOX);
  });
});

describe('daily queue', () => {
  const word = (id: string) => ({ id, word: '学校', reading: 'がっこう' });
  const notes = ['due-old', 'due-new', 'missed', 'fresh1', 'fresh2', 'fresh3', 'later-box1', 'later-box4'].map(word);
  const entry = (noteId: string, box: number, dueAt: number): [string, Progress] => [
    noteId,
    { noteId, box, dueAt, correct: 1, wrong: 0, lastSeen: 0 },
  ];
  const progress: ProgressByDirection = {
    'to-kanji': new Map([
      entry('due-old', 2, NOW - 2 * DAY),
      entry('due-new', 1, NOW - 1000),
      entry('missed', 0, NOW - 1000),
      entry('later-box1', 1, NOW + DAY),
      entry('later-box4', 4, NOW + 5 * DAY),
    ]),
    'to-reading': new Map(),
  };
  const nothingDone = { newDone: 0, reviewsDone: 0 };
  const ids = (limits: { newPerDay: number; reviewsPerDay: number }, today = nothingDone) =>
    buildQueue(notes, progress, 'to-kanji', limits, today, NOW, () => 0.5)
      .items.map((i) => i.note.id)
      .sort();

  it('holds the due words and as many new ones as the limit allows, and nothing else', () => {
    const limited = ids({ newPerDay: 2, reviewsPerDay: 200 });
    expect(limited.filter((id) => !id.startsWith('fresh'))).toEqual(['due-new', 'due-old', 'missed']);
    expect(limited.filter((id) => id.startsWith('fresh'))).toHaveLength(2);
    // Words that aren't due yet are never added to fill the queue.
    expect(ids({ newPerDay: 50, reviewsPerDay: 200 })).toEqual([
      'due-new',
      'due-old',
      'fresh1',
      'fresh2',
      'fresh3',
      'missed',
    ]);
  });

  it('has no new words once the new words of the day are done', () => {
    expect(ids({ newPerDay: 3, reviewsPerDay: 200 }, { newDone: 3, reviewsDone: 0 })).toEqual([
      'due-new',
      'due-old',
      'missed',
    ]);
  });

  it('limits reviews, most overdue first, but not words that were missed', () => {
    expect(ids({ newPerDay: 0, reviewsPerDay: 1 })).toEqual(['due-old', 'missed']);
    expect(ids({ newPerDay: 0, reviewsPerDay: 5 }, { newDone: 0, reviewsDone: 5 })).toEqual(['missed']);
  });

  it('is empty when everything for today is done', () => {
    const limits = { newPerDay: 20, reviewsPerDay: 200 };
    const done = buildQueue(notes.slice(6), progress, 'to-kanji', limits, nothingDone, NOW);
    expect(done).toEqual({ items: [], fresh: 0, due: 0 });
  });

  it('counts what the queue holds, and everything learned', () => {
    const limits = { newPerDay: 1, reviewsPerDay: 200 };
    expect(modeCounts(notes, progress, 'to-kanji', limits, nothingDone, NOW)).toEqual({ due: 3, fresh: 1, learned: 1 });
  });

  it('offers started words that are not due for practicing ahead, the least known first', () => {
    const ahead = selectExtraItems(notes, progress, 'to-kanji', 1, NOW, () => 0.5);
    expect(ahead.map((i) => i.note.id)).toEqual(['later-box1']);
    expect(
      selectExtraItems(notes, progress, 'to-kanji', 10, NOW)
        .map((i) => i.note.id)
        .sort(),
    ).toEqual(['later-box1', 'later-box4']);
  });
});

describe('normalizeSettings', () => {
  it('fills in defaults and rejects invalid values', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(
      normalizeSettings({
        promptMode: 'reading',
        sessionSize: 33,
        newPerDay: 12.4,
        reviewsPerDay: -5,
        courseLimit: 99999,
        excludedDecks: ['a', 1],
      }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      promptMode: 'reading',
      newPerDay: 12,
      reviewsPerDay: 0,
      courseLimit: 6000,
      excludedDecks: ['a'],
    });
  });

  it('converts settings saved by earlier versions', () => {
    expect(normalizeSettings({ knownKanji: 'rtk', rtkFrame: 800 })).toMatchObject({ knownKanji: 'course', courseLimit: 800 });
  });
});

describe('knownKanjiSet', () => {
  const bundled = [
    { literal: '一', grade: 1, freq: 2 },
    { literal: '叔', grade: 8, freq: 1900 },
    { literal: '匁', grade: null, freq: null },
  ] as KanjiInfo[];
  const sources = { deckWords: ['祖父', '父'], userFrames: new Map<string, number>(), bundled };

  it('supports deck and Jōyō modes, and the most common kanji without a kanji deck', () => {
    expect([...knownKanjiSet('deck', 0, sources)]).toEqual(['祖', '父']);
    expect([...knownKanjiSet('joyo', 0, sources)]).toEqual(['一', '叔']);
    expect([...knownKanjiSet('course', 100, sources)]).toEqual(['一']);
  });

  it("uses the order of the user's own kanji deck", () => {
    const userFrames = new Map([
      ['一', 1],
      ['匁', 50],
      ['叔', 900],
    ]);
    expect([...knownKanjiSet('course', 100, { ...sources, userFrames })]).toEqual(['一', '匁']);
  });
});

describe('stats', () => {
  it('counts a streak ending today or yesterday', () => {
    const days = (...offsets: number[]) => new Set(offsets.map((o) => dayKey(NOW - o * DAY)));
    expect(streakDays(days(0, 1, 2, 4), NOW)).toBe(3);
    expect(streakDays(days(1, 2), NOW)).toBe(2);
    expect(streakDays(days(2, 3), NOW)).toBe(0);
  });

  it('computes accuracy', () => {
    expect(accuracy(3, 4)).toBe(75);
    expect(accuracy(0, 0)).toBeNull();
  });
});
