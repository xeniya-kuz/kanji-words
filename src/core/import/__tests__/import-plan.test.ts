import { canImport, createImportPlan, missingRoles, previewGroup, runImport, splitByNoteType } from '../import-plan';
import { parseWordFile } from '../word-file';

const tsv = (...lines: string[][]) => lines.map((cells) => cells.join('\t')).join('\n');
const HEADER = '#separator:tab\n#guid column:1\n#notetype column:2\n';

const vocabRows = Array.from({ length: 25 }, (_, i) => [
  `g${i}`,
  'Vocab',
  ['父', '母', '兄', '姉', '弟'][i % 5] + '親'.repeat(1 + Math.floor(i / 5)),
  'ちち' + 'お'.repeat(i),
  `meaning ${i}`,
]);
// A second note type with the reading and word columns swapped.
const reversedRows = Array.from({ length: 25 }, (_, i) => [
  `r${i}`,
  'Reversed',
  'はは' + 'あ'.repeat(i),
  ['海', '山', '川', '空', '森'][i % 5] + '中'.repeat(1 + Math.floor(i / 5)),
  `other ${i}`,
]);

describe('splitByNoteType', () => {
  it('groups rows by note type, largest first', () => {
    const exp = parseWordFile(HEADER + tsv(...vocabRows.slice(0, 3), ...reversedRows));
    expect(splitByNoteType(exp).map((g) => [g.noteType, g.exp.rows.length])).toEqual([
      ['Reversed', 25],
      ['Vocab', 3],
    ]);
  });

  it('keeps a single group without a note type column', () => {
    const exp = parseWordFile('#separator:tab\n' + tsv(['父', 'ちち', 'father']));
    expect(splitByNoteType(exp)).toEqual([{ noteType: '', exp }]);
  });
});

describe('createImportPlan', () => {
  it('detects columns per note type when the layouts differ', () => {
    const exp = parseWordFile(HEADER + tsv(...vocabRows, ...reversedRows));
    const plan = createImportPlan(exp, () => undefined);
    expect(plan.kind).toBe('words');
    const byType = Object.fromEntries(plan.groups.map((g) => [g.noteType, g.mapping]));
    expect(byType.Vocab).toEqual({ word: 2, reading: 3, translation: 4 });
    expect(byType.Reversed).toEqual({ reading: 2, word: 3, translation: 4 });
    expect(canImport(plan)).toBe(true);
  });

  it('uses the whole-file mapping for small groups', () => {
    const exp = parseWordFile(HEADER + tsv(...vocabRows, ['x1', 'Basic', '海', 'うみ', 'sea']));
    const plan = createImportPlan(exp, () => undefined);
    expect(plan.groups.find((g) => g.noteType === 'Basic')?.mapping).toEqual({ word: 2, reading: 3, translation: 4 });
  });

  it('prefers a saved mapping', () => {
    const exp = parseWordFile(HEADER + tsv(...vocabRows));
    const plan = createImportPlan(exp, (kind, noteType) =>
      kind === 'words' && noteType === 'Vocab' ? { word: 2, reading: 3 } : undefined,
    );
    expect(plan.groups[0].mapping).toEqual({ word: 2, reading: 3 });
    expect(missingRoles('words', plan.groups[0].mapping)).toEqual(['translation']);
    expect(canImport(plan)).toBe(false);
  });
});

describe('runImport', () => {
  it('merges groups and removes duplicates across them', () => {
    const exp = parseWordFile(
      HEADER + tsv(['a', 'One', '父', 'ちち', 'father'], ['b', 'Two', '父', 'ちち', 'dad'], ['c', 'Two', 'ペラペラ', 'ペラペラ', 'fluent']),
    );
    const plan = createImportPlan(exp, () => ({ word: 2, reading: 3, translation: 4 }));
    const outcome = runImport(plan);
    expect(outcome.kind).toBe('words');
    if (outcome.kind !== 'words') return;
    expect(outcome.notes.map((n) => n.translation)).toEqual(['dad']);
    expect(outcome.skipped).toEqual({ 'no-kanji': 1, duplicate: 1 });
  });

  it('skips excluded groups', () => {
    const exp = parseWordFile(HEADER + tsv(...vocabRows, ...reversedRows));
    const plan = createImportPlan(exp, () => undefined);
    plan.groups.find((g) => g.noteType === 'Reversed')!.include = false;
    const outcome = runImport(plan);
    expect(outcome.kind === 'words' && outcome.notes.length).toBe(25);
  });

  it('previews the first notes of a group', () => {
    const exp = parseWordFile(HEADER + tsv(...vocabRows));
    const plan = createImportPlan(exp, () => undefined);
    const preview = previewGroup('words', plan.groups[0]);
    expect(preview.kind === 'words' && preview.notes.map((n) => n.word)).toEqual(['父親', '母親', '兄親']);
  });
});
