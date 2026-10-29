import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { backupSummary, createBackup, type Backup } from '@/core/backup';
import { MAX_COURSE_LIMIT, SESSION_SIZES, type Settings } from '@/core/settings';
import { Spacing } from '@/constants/theme';
import { readBackupContent, restoreBackup } from '@/db/backup';
import { deleteAllNotes, getDeckSummaries } from '@/db/notes';
import { resetProgress } from '@/db/progress';
import { countUserKanji, deleteUserKanji } from '@/db/user-kanji';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';
import { updateSettings, useSettings } from '@/state/settings';
import { pickBackup, shareBackup } from '@/utils/backup-file';
import { formatDeck } from '@/utils/format';

const SOURCE_URL = 'https://github.com/xeniya-kuz/kanji-words';

const DIFFICULTY_HINTS: Record<Settings['difficulty'], string> = {
  easy: 'Clearly different kanji that you know.',
  normal: 'A mix of look-alike kanji, kanji with the same reading and other words.',
  hard: 'The most confusing: closest look-alikes, kanji that look and sound alike, real homophones.',
};

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const settings = useSettings();
  const query = useCallback(
    async () => ({ decks: await getDeckSummaries(db), kanjiCount: await countUserKanji(db) }),
    [db],
  );
  const { data, reload } = useFocusQuery(query);
  const [limitText, setLimitText] = useState(String(settings.courseLimit));
  const [backupBusy, setBackupBusy] = useState(false);

  const confirm = (title: string, message: string, action: () => Promise<void>) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          action().then(reload);
        },
      },
    ]);

  const failure = (title: string, e: unknown) => Alert.alert(title, e instanceof Error ? e.message : String(e));

  const backUp = async () => {
    setBackupBusy(true);
    try {
      await shareBackup(createBackup(await readBackupContent(db, settings)));
    } catch (e) {
      failure("Couldn't create the backup", e);
    } finally {
      setBackupBusy(false);
    }
  };

  const restore = async () => {
    let backup: Backup | null;
    try {
      backup = await pickBackup();
    } catch (e) {
      failure("Couldn't read the backup", e);
      return;
    }
    if (!backup) return;
    const chosen = backup;
    Alert.alert(
      'Restore this backup?',
      `Made on ${new Date(chosen.exportedAt).toLocaleDateString()}:\n${backupSummary(chosen)}\n\nEverything in the app now is replaced with it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setBackupBusy(true);
            try {
              await restoreBackup(db, chosen);
              updateSettings(chosen.settings);
              setLimitText(String(chosen.settings.courseLimit));
              reload();
              Alert.alert('Backup restored');
            } catch (e) {
              failure("Couldn't restore the backup", e);
            } finally {
              setBackupBusy(false);
            }
          },
        },
      ],
    );
  };

  const setLimit = (limit: number) => {
    updateSettings({ courseLimit: limit });
    setLimitText(String(Math.min(MAX_COURSE_LIMIT, Math.max(1, limit))));
  };

  const toggleDeck = (deck: string, on: boolean) => {
    const excluded = new Set(settings.excludedDecks);
    if (on) excluded.delete(deck);
    else excluded.add(deck);
    updateSettings({ excludedDecks: [...excluded] });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">Settings</ThemedText>

        <Section title="Question shows">
          <Segmented
            options={[
              { value: 'reading', label: 'Reading' },
              { value: 'translation', label: 'Translation' },
              { value: 'both', label: 'Both' },
            ]}
            value={settings.promptMode}
            onChange={(promptMode) => updateSettings({ promptMode })}
          />
        </Section>

        <Section title="Words per session">
          <Segmented
            options={SESSION_SIZES.map((n) => ({ value: n, label: String(n) }))}
            value={settings.sessionSize}
            onChange={(sessionSize) => updateSettings({ sessionSize })}
          />
        </Section>

        <Section title="Wrong answers" hint={DIFFICULTY_HINTS[settings.difficulty]}>
          <Segmented
            options={[
              { value: 'easy', label: 'Easy' },
              { value: 'normal', label: 'Normal' },
              { value: 'hard', label: 'Hard' },
            ]}
            value={settings.difficulty}
            onChange={(difficulty) => updateSettings({ difficulty })}
          />
        </Section>

        <Section title="Kanji you know" hint="Wrong answers are built mostly from these kanji.">
          <Segmented
            options={[
              { value: 'deck', label: 'In my words' },
              { value: 'course', label: 'First N kanji' },
              { value: 'joyo', label: 'All Jōyō' },
            ]}
            value={settings.knownKanji}
            onChange={(knownKanji) => updateSettings({ knownKanji })}
          />
          {settings.knownKanji === 'course' && (
            <>
              <View style={styles.limitRow}>
                <Button title="−100" variant="secondary" onPress={() => setLimit(settings.courseLimit - 100)} />
                <View style={styles.limitField}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Kanji 1 to
                  </ThemedText>
                  <TextInput
                    value={limitText}
                    onChangeText={setLimitText}
                    onEndEditing={() => setLimit(parseInt(limitText, 10) || settings.courseLimit)}
                    keyboardType="number-pad"
                    style={[styles.limitInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                  />
                </View>
                <Button title="+100" variant="secondary" onPress={() => setLimit(settings.courseLimit + 100)} />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {data?.kanjiCount
                  ? 'Counted in the order of your kanji deck (its order number column, e.g. RTK frame or lesson).'
                  : 'No kanji deck imported, so the most common kanji are counted. Import your kanji deck to use the order of your own course.'}
              </ThemedText>
            </>
          )}
          {settings.knownKanji === 'deck' && (
            <ThemedText type="small" themeColor="textSecondary">
              Every kanji that appears in your imported words counts as known. Grows as you add words.
            </ThemedText>
          )}
          {settings.knownKanji === 'joyo' && (
            <ThemedText type="small" themeColor="textSecondary">
              All 2,136 Jōyō (everyday) kanji count as known. More variety, less tied to your own words.
            </ThemedText>
          )}
        </Section>

        {data && data.decks.length > 0 && (
          <Section title="Decks to practice">
            <Card>
              {data.decks.map((d) => (
                <View key={d.deck} style={styles.deckRow}>
                  <View style={styles.fill}>
                    <ThemedText type="small" numberOfLines={1}>
                      {formatDeck(d.deck)}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {d.count} words
                    </ThemedText>
                  </View>
                  <Switch
                    value={!settings.excludedDecks.includes(d.deck)}
                    onValueChange={(on) => toggleDeck(d.deck, on)}
                  />
                </View>
              ))}
            </Card>
          </Section>
        )}

        <Section
          title="Backup"
          hint="Saves your words, progress and settings to a file. Send it to Google Drive, your email or a messenger, and restore it later or on another phone.">
          <Button title="Back up…" loading={backupBusy} onPress={backUp} />
          <Button title="Restore from backup file" variant="secondary" disabled={backupBusy} onPress={restore} />
        </Section>

        <Section title="Data">
          <Button title="Import words" variant="secondary" onPress={() => router.push('/import')} />
          <Button
            title="Reset progress"
            variant="danger"
            onPress={() =>
              confirm('Reset progress?', 'All words become new again and statistics are cleared.', () =>
                resetProgress(db),
              )
            }
          />
          <Button
            title="Delete all words"
            variant="danger"
            onPress={() =>
              confirm(
                'Delete all words?',
                'Your imported words are removed. Progress is kept and comes back if you import the same deck again.',
                () => deleteAllNotes(db),
              )
            }
          />
          {!!data?.kanjiCount && (
            <Button
              title={`Delete kanji deck (${data.kanjiCount} kanji)`}
              variant="danger"
              onPress={() =>
                confirm('Delete kanji deck?', 'Kanji keywords and frame numbers are removed.', () =>
                  deleteUserKanji(db),
                )
              }
            />
          )}
        </Section>

        <Section title="About">
          <Card>
            <ThemedText type="smallBold">Kanji Words {Constants.expoConfig?.version}</ThemedText>
            <ThemedText type="small" style={{ color: theme.accent }} onPress={() => Linking.openURL(SOURCE_URL)}>
              Source code on GitHub
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Kanji data: KANJIDIC2, KRADFILE and JMdict by the Electronic Dictionary Research and Development Group
              (CC BY-SA 4.0). Kanji similarity: Lars Yencken’s kanji confusion datasets (CC BY 3.0). Japanese font:
              Noto Sans JP (SIL Open Font License).
            </ThemedText>
          </Card>
        </Section>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {hint && (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: Spacing.four, paddingBottom: Spacing.five },
  section: { gap: Spacing.two },
  limitRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  limitField: { flex: 1, alignItems: 'center' },
  limitInput: {
    minWidth: 90,
    textAlign: 'center',
    fontSize: 18,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.one,
  },
  deckRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});
