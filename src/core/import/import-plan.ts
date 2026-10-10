// Plans and runs an import: splits the export by note type, proposes a column mapping for each
// (a saved one if the note type was imported before, otherwise a detected one) and runs the importers.

import {
  REQUIRED_ROLES,
  detectDeckKind,
  detectKanjiColumns,
  detectWordColumns,
  profileColumns,
  type ColumnMapping,
  type ColumnProfile,
  type DeckKind,
  type KanjiRole,
  type WordRole,
} from './detect-columns';
import { importKanji, type KanjiEntry } from './import-kanji';
import { importWords, type SkipReason, type WordNote } from './import-words';
import type { WordFile } from './word-file';

export type AnyMapping = ColumnMapping<WordRole> & ColumnMapping<KanjiRole>;

export interface PlanGroup {
  /** Note type name, or "" when the export doesn't say. */
  noteType: string;
  exp: WordFile;
  profiles: ColumnProfile[];
  mapping: AnyMapping;
  include: boolean;
}

export interface ImportPlan {
  kind: DeckKind;
  groups: PlanGroup[];
}

/** Looks up a mapping saved by an earlier import of the same note type. */
export type SavedMappings = (kind: DeckKind, noteType: string) => AnyMapping | undefined;

/** Groups smaller than this are too small to detect columns reliably on their own. */
const MIN_ROWS_FOR_OWN_DETECTION = 20;

export function createImportPlan(exp: WordFile, saved: SavedMappings, kind?: DeckKind): ImportPlan {
  const allProfiles = profileColumns(exp);
  const deckKind = kind ?? detectDeckKind(allProfiles);
  const detect = (profiles: ColumnProfile[]): AnyMapping =>
    deckKind === 'words' ? detectWordColumns(profiles) : detectKanjiColumns(profiles);
  const fileMapping = detect(allProfiles);

  const groups = splitByNoteType(exp).map(({ noteType, exp: groupExp }): PlanGroup => {
    const profiles = groupExp === exp ? allProfiles : profileColumns(groupExp);
    const own = groupExp.rows.length >= MIN_ROWS_FOR_OWN_DETECTION ? detect(profiles) : fileMapping;
    const mapping = saved(deckKind, noteType) ?? own;
    return { noteType, exp: groupExp, profiles, mapping, include: true };
  });
  return { kind: deckKind, groups };
}

/** Required roles that have no column yet. */
export function missingRoles(kind: DeckKind, mapping: AnyMapping): string[] {
  return (REQUIRED_ROLES[kind] as string[]).filter((role) => mapping[role as keyof AnyMapping] == null);
}

export function canImport(plan: ImportPlan): boolean {
  const included = plan.groups.filter((g) => g.include);
  return included.length > 0 && included.every((g) => missingRoles(plan.kind, g.mapping).length === 0);
}

export interface WordsOutcome {
  kind: 'words';
  notes: WordNote[];
  skipped: Partial<Record<SkipReason, number>>;
  skippedExamples: string[];
  furiganaIgnored: number;
}

export interface KanjiOutcome {
  kind: 'kanji';
  entries: KanjiEntry[];
  skipped: number;
}

export type ImportOutcome = WordsOutcome | KanjiOutcome;

export function runImport(plan: ImportPlan): ImportOutcome {
  const groups = plan.groups.filter((g) => g.include && missingRoles(plan.kind, g.mapping).length === 0);

  if (plan.kind === 'kanji') {
    const entries = new Map<string, KanjiEntry>();
    let skipped = 0;
    for (const g of groups) {
      const result = importKanji(g.exp, g.mapping);
      skipped += result.skipped;
      for (const e of result.entries) if (!entries.has(e.kanji)) entries.set(e.kanji, e);
    }
    return { kind: 'kanji', entries: [...entries.values()], skipped };
  }

  const notes = new Map<string, WordNote>();
  const skipped: Partial<Record<SkipReason, number>> = {};
  const skippedExamples: string[] = [];
  let furiganaIgnored = 0;
  const skip = (reason: SkipReason, text: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
    if (skippedExamples.length < 20 && text) skippedExamples.push(text.split('\n')[0]);
  };

  for (const g of groups) {
    const result = importWords(g.exp, g.mapping);
    furiganaIgnored += result.furiganaIgnored;
    for (const s of result.skipped) skip(s.reason, s.text);
    for (const note of result.notes) {
      const key = `${note.word}|${note.reading}`;
      if (notes.has(key)) skip('duplicate', note.word);
      else notes.set(key, note);
    }
  }
  return { kind: 'words', notes: [...notes.values()], skipped, skippedExamples, furiganaIgnored };
}

/** The first notes a mapping produces, for the preview on the mapping screen. */
export function previewGroup(kind: DeckKind, group: PlanGroup, count = 3): ImportOutcome {
  const sample = { ...group.exp, rows: group.exp.rows.slice(0, 40) };
  const outcome = runImport({ kind, groups: [{ ...group, exp: sample, include: true }] });
  return outcome.kind === 'words'
    ? { ...outcome, notes: outcome.notes.slice(0, count) }
    : { ...outcome, entries: outcome.entries.slice(0, count) };
}

/** Splits rows by the note type column; one group when the export has a single note type. */
export function splitByNoteType(exp: WordFile): { noteType: string; exp: WordFile }[] {
  const column = exp.meta.notetypeColumn;
  if (column == null) return [{ noteType: exp.meta.notetype ?? '', exp }];

  const byType = new Map<string, string[][]>();
  for (const row of exp.rows) {
    const name = row[column] ?? '';
    const rows = byType.get(name) ?? [];
    rows.push(row);
    byType.set(name, rows);
  }
  if (byType.size === 1) return [{ noteType: [...byType.keys()][0], exp }];
  return [...byType]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([noteType, rows]) => ({ noteType, exp: { ...exp, rows } }));
}
