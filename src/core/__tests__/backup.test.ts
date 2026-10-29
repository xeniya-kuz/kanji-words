import { backupFileName, backupSummary, createBackup, parseBackup, type BackupContent } from '../backup';
import { DEFAULT_SETTINGS } from '../settings';

const content: BackupContent = {
  settings: { ...DEFAULT_SETTINGS, difficulty: 'hard', excludedDecks: ['N5'] },
  notes: [
    {
      id: 'a',
      deck: 'N5',
      word: '聞く',
      alternatives: ['訊く'],
      reading: 'きく',
      readingLabel: '(に)きく',
      translation: 'to listen',
      furigana: [{ text: '聞', reading: 'き' }, { text: 'く' }],
      importedAt: 1000,
    },
    { id: 'b', word: '山', alternatives: [], reading: 'やま', translation: 'mountain', importedAt: 2000 },
  ],
  userKanji: [{ kanji: '山', keyword: 'mountain', frame: 12, onyomi: ['サン'], kunyomi: ['やま'] }],
  importProfiles: [{ kind: 'words', noteType: 'Basic', mapping: { word: 0, reading: 1 } }],
  progress: [{ noteId: 'a', box: 2, dueAt: 5000, correct: 3, wrong: 1, lastSeen: 4000 }],
  answers: [
    ['a', 1, 3000],
    ['a', 0, 4000],
  ],
};

describe('backup', () => {
  it('survives a round trip through JSON', () => {
    const backup = createBackup(content, 123);
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup);
  });

  it('summarizes what it holds', () => {
    expect(backupSummary(createBackup(content))).toBe(
      '2 words\n1 kanji in your kanji deck\nprogress on 1 words\n2 logged answers',
    );
  });

  it('names the file by date', () => {
    expect(backupFileName(new Date(2026, 9, 5))).toBe('kanji-words-backup-2026-10-05.json');
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow('not a Kanji Words backup');
    expect(() => parseBackup('{"words": []}')).toThrow('not a Kanji Words backup');
    expect(() => parseBackup('[]')).toThrow('not a Kanji Words backup');
  });

  it('rejects backups from a newer app version', () => {
    const newer = { ...createBackup(content), version: 99 };
    expect(() => parseBackup(JSON.stringify(newer))).toThrow('newer version');
  });

  it('rejects damaged data instead of restoring part of it', () => {
    const damaged = { ...createBackup(content), notes: [{ id: 'x' }] };
    expect(() => parseBackup(JSON.stringify(damaged))).toThrow('damaged');
    const noProgress = { ...createBackup(content), progress: undefined };
    expect(() => parseBackup(JSON.stringify(noProgress))).toThrow('damaged');
  });

  it('falls back to defaults for invalid settings', () => {
    const backup = { ...createBackup(content), settings: { difficulty: 'impossible' } };
    expect(parseBackup(JSON.stringify(backup)).settings).toEqual(DEFAULT_SETTINGS);
  });
});
