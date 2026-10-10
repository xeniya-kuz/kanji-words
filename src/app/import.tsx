import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Furigana } from '@/components/furigana';
import { MappingEditor } from '@/components/import/mapping-editor';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { DeckKind } from '@/core/import/detect-columns';
import {
  canImport,
  createImportPlan,
  missingRoles,
  previewGroup,
  runImport,
  type AnyMapping,
  type ImportPlan,
  type SavedMappings,
} from '@/core/import/import-plan';
import type { SkipReason } from '@/core/import/import-words';
import { parseWordFile, type WordFile } from '@/core/import/word-file';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { loadSavedMappings, saveMappings } from '@/db/import-profiles';
import { saveNotes } from '@/db/notes';
import { replaceUserKanji } from '@/db/user-kanji';
import { useTheme } from '@/hooks/use-theme';

type Stage = 'pick' | 'reading' | 'map' | 'saving' | 'done';

interface Loaded {
  fileName: string;
  exp: WordFile;
  saved: SavedMappings;
}

const SKIP_LABELS: Record<SkipReason, string> = {
  'no-kanji': 'without kanji (kana-only words)',
  'no-word': 'with an empty word field',
  'no-reading': 'without a reading',
  duplicate: 'duplicates',
};

/** Lets the JS thread paint a spinner before heavy synchronous work. */
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 50));

export default function ImportScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [stage, setStage] = useState<Stage>('pick');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [groupIndex, setGroupIndex] = useState(0);
  const [summary, setSummary] = useState<string[]>([]);

  const group = plan?.groups[groupIndex];
  const preview = useMemo(() => (plan && group ? previewGroup(plan.kind, group) : null), [plan, group]);

  async function pickFile() {
    setError(null);
    // expo-file-system's own picker grants read access to the chosen file; a URI from another picker
    // may be outside the app's sandbox (Expo Go rejects reading it).
    let file: File;
    try {
      const picked = await File.pickFileAsync();
      if (picked.canceled) return;
      file = picked.result;
    } catch (e) {
      setError(`Couldn't open the file picker. ${e instanceof Error ? e.message : ''}`);
      return;
    }

    setStage('reading');
    try {
      const text = await file.text();
      await nextFrame();
      const exp = parseWordFile(text);
      if (exp.rows.length === 0 || exp.columnCount < 2) {
        throw new Error('No columns found: separate them with tabs, commas or semicolons.');
      }
      const saved = await loadSavedMappings(db);
      setLoaded({ fileName: file.name, exp, saved });
      setPlan(createImportPlan(exp, saved));
      setGroupIndex(0);
      setStage('map');
    } catch (e) {
      setError(`Couldn't read "${file.name}". ${e instanceof Error ? e.message : ''}`);
      setStage('pick');
    }
  }

  function switchKind(kind: DeckKind) {
    if (!loaded || plan?.kind === kind) return;
    setPlan(createImportPlan(loaded.exp, loaded.saved, kind));
    setGroupIndex(0);
  }

  function updateGroup(index: number, patch: { mapping?: AnyMapping; include?: boolean }) {
    setPlan((current) =>
      current && { ...current, groups: current.groups.map((g, i) => (i === index ? { ...g, ...patch } : g)) },
    );
  }

  async function startImport() {
    if (!plan) return;
    setStage('saving');
    await nextFrame();
    try {
      const outcome = runImport(plan);
      const lines: string[] = [];
      if (outcome.kind === 'words') {
        const { added, updated } = await saveNotes(db, outcome.notes);
        lines.push(`${added} new words added`);
        if (updated) lines.push(`${updated} existing words updated`);
        for (const [reason, count] of Object.entries(outcome.skipped)) {
          lines.push(`${count} notes skipped ${SKIP_LABELS[reason as SkipReason]}`);
        }
        if (outcome.furiganaIgnored) {
          lines.push(`${outcome.furiganaIgnored} words where the furigana didn't match the reading (shown without it)`);
        }
      } else {
        await replaceUserKanji(db, outcome.entries);
        lines.push(`${outcome.entries.length} kanji imported`);
        if (outcome.skipped) lines.push(`${outcome.skipped} notes without a kanji skipped`);
      }
      await saveMappings(db, plan);
      setSummary(lines);
      setStage('done');
    } catch (e) {
      setError(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      setStage('map');
    }
  }

  if (stage === 'reading' || stage === 'saving') {
    return (
      <ThemedView style={[styles.fill, styles.center]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <ThemedText themeColor="textSecondary">{stage === 'reading' ? 'Reading file…' : 'Importing…'}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView edges={['bottom']} style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content}>
          {error && (
            <Card>
              <ThemedText style={{ color: theme.wrong }}>{error}</ThemedText>
            </Card>
          )}

          {stage === 'pick' && (
            <>
              <ThemedText type="subtitle" style={styles.title}>
                Import words
              </ThemedText>
              <ThemedText type="small">
                Any text file works: one word per line, columns separated by tabs, commas or semicolons (.txt, .csv,
                .tsv), saved as UTF-8. You confirm which column is which on the next screen.
              </ThemedText>
              <Card>
                <ThemedText type="smallBold">A word list needs</ThemedText>
                <ThemedText type="small">• the word written with kanji: 聞く</ThemedText>
                <ThemedText type="small">• its reading in kana: きく</ThemedText>
                <ThemedText type="small">• a translation in your language</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Furigana (ruby or 漢字[かんじ]) is optional. A kanji list, one kanji per line with a keyword, adds
                  keywords to each kanji.
                </ThemedText>
              </Card>
              <Card>
                <ThemedText type="smallBold">Where to get the file</ThemedText>
                <ThemedText type="small">
                  • Anki: File → Export → Notes in Plain Text, with “Include HTML”, “unique identifier”, “deck name”
                  and “notetype name” checked.
                </ThemedText>
                <ThemedText type="small">• Google Sheets: File → Download → Tab-separated values (.tsv).</ThemedText>
                <ThemedText type="small">• Excel: Save As → CSV UTF-8.</ThemedText>
                <ThemedText type="small">• Other flashcard apps: their export to text or CSV.</ThemedText>
              </Card>
              <Button title="Choose file" onPress={pickFile} />
            </>
          )}

          {stage === 'map' && plan && group && loaded && (
            <>
              <View>
                <ThemedText type="smallBold">{loaded.fileName}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {loaded.exp.rows.length} notes · {loaded.exp.columnCount} columns
                </ThemedText>
              </View>

              <Segmented
                options={[
                  { value: 'words', label: 'Word deck' },
                  { value: 'kanji', label: 'Kanji deck' },
                ]}
                value={plan.kind}
                onChange={switchKind}
              />

              {plan.groups.length > 1 && (
                <View style={styles.groups}>
                  <ThemedText type="small" themeColor="textSecondary">
                    This file has several note types. Check the columns of each one.
                  </ThemedText>
                  {plan.groups.map((g, i) => (
                    <Pressable
                      key={g.noteType}
                      onPress={() => setGroupIndex(i)}
                      style={[
                        styles.groupRow,
                        { backgroundColor: i === groupIndex ? theme.backgroundSelected : theme.backgroundElement },
                      ]}>
                      <View style={styles.fill}>
                        <ThemedText type="smallBold">{g.noteType || 'Notes'}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {g.exp.rows.length} notes
                          {g.include && missingRoles(plan.kind, g.mapping).length > 0 ? ' · columns missing' : ''}
                        </ThemedText>
                      </View>
                      <Switch value={g.include} onValueChange={(include) => updateGroup(i, { include })} />
                    </Pressable>
                  ))}
                </View>
              )}

              <ThemedText type="smallBold">Columns</ThemedText>
              <MappingEditor
                kind={plan.kind}
                group={group}
                onChange={(mapping) => updateGroup(groupIndex, { mapping })}
              />

              <ThemedText type="smallBold">Preview</ThemedText>
              <Card>
                {preview?.kind === 'words' &&
                  (preview.notes.length === 0 ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      No words with these columns yet.
                    </ThemedText>
                  ) : (
                    preview.notes.map((note) => (
                      <View key={note.id} style={styles.previewRow}>
                        <Furigana word={note.word} reading={note.reading} segments={note.furigana} size={24} />
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.fill}>
                          {note.translation}
                        </ThemedText>
                      </View>
                    ))
                  ))}
                {preview?.kind === 'kanji' &&
                  preview.entries.map((entry) => (
                    <View key={entry.kanji} style={styles.previewRow}>
                      <ThemedText style={styles.kanji}>{entry.kanji}</ThemedText>
                      <View style={styles.fill}>
                        <ThemedText type="small">{entry.keyword ?? '—'}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {[entry.frame && `#${entry.frame}`, ...entry.onyomi, ...entry.kunyomi]
                            .filter(Boolean)
                            .join('  ')}
                        </ThemedText>
                      </View>
                    </View>
                  ))}
              </Card>

              {plan.kind === 'kanji' && (
                <ThemedText type="small" themeColor="textSecondary">
                  Importing a kanji deck replaces the one imported before.
                </ThemedText>
              )}
              <Button title="Import" onPress={startImport} disabled={!canImport(plan)} />
            </>
          )}

          {stage === 'done' && (
            <>
              <ThemedText type="subtitle" style={styles.title}>
                Import finished
              </ThemedText>
              <Card>
                {summary.map((line) => (
                  <ThemedText key={line} type="small">
                    {line}
                  </ThemedText>
                ))}
              </Card>
              <Button title="Done" onPress={() => router.back()} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  title: { fontSize: 28, lineHeight: 36 },
  groups: { gap: Spacing.two },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  previewRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three },
  kanji: { fontSize: 32, lineHeight: 40 },
});
