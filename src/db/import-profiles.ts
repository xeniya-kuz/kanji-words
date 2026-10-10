// Column mappings remembered per note type, so re-importing the same deck needs no setup.

import type { SQLiteDatabase } from 'expo-sqlite';

import type { DeckKind } from '@/core/anki/detect-columns';
import type { AnyMapping, ImportPlan, SavedMappings } from '@/core/anki/import-plan';

export async function loadSavedMappings(db: SQLiteDatabase): Promise<SavedMappings> {
  const rows = await db.getAllAsync<{ kind: DeckKind; note_type: string; mapping: string }>(
    'SELECT kind, note_type, mapping FROM import_profile',
  );
  const byKey = new Map(rows.map((r) => [`${r.kind}|${r.note_type}`, JSON.parse(r.mapping) as AnyMapping]));
  return (kind, noteType) => byKey.get(`${kind}|${noteType}`);
}

export async function saveMappings(db: SQLiteDatabase, plan: ImportPlan) {
  for (const group of plan.groups) {
    if (!group.include) continue;
    await db.runAsync(
      `INSERT INTO import_profile (kind, note_type, mapping) VALUES (?, ?, ?)
       ON CONFLICT (kind, note_type) DO UPDATE SET mapping = excluded.mapping`,
      plan.kind,
      group.noteType,
      JSON.stringify(group.mapping),
    );
  }
}
