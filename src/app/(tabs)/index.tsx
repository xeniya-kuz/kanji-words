import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import type { DirectionMode } from '@/core/quiz/session';
import { askableIn, directionsOf, EXTRA_PRACTICE_SIZE, modeCounts, selectExtraItems } from '@/core/quiz/srs';
import { startOfDay } from '@/core/stats';
import { Spacing } from '@/constants/theme';
import { getDeckSummaries, listNotes } from '@/db/notes';
import { getProgressMap, getTodayStats } from '@/db/progress';
import { countUserKanji } from '@/db/user-kanji';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { updateSettings, useSettings } from '@/state/settings';
import { formatDeck } from '@/utils/format';

export default function PracticeScreen() {
  const db = useSQLiteContext();
  const settings = useSettings();
  const query = useCallback(async () => {
    const excluded = new Set(settings.excludedDecks);
    const notes = (await listNotes(db)).filter((n) => !excluded.has(n.deck ?? ''));
    const progress = {
      'to-kanji': await getProgressMap(db, 'to-kanji'),
      'to-reading': await getProgressMap(db, 'to-reading'),
    };
    const now = Date.now();
    const limits = { newPerDay: settings.newPerDay, reviewsPerDay: settings.reviewsPerDay };
    return {
      decks: await getDeckSummaries(db),
      counts: modeCounts(notes, progress, settings.direction, limits, await getTodayStats(db, startOfDay(now)), now),
      // Started words that aren't due yet, for practicing ahead once today's queue is done.
      ahead: selectExtraItems(notes, progress, settings.direction, EXTRA_PRACTICE_SIZE, now).length,
      // Questions available in the chosen direction, e.g. words without kanji can't be asked for their reading.
      selected: notes.length,
      practiced: directionsOf(settings.direction).reduce((sum, d) => sum + askableIn(notes, d).length, 0),
      kanjiCount: await countUserKanji(db),
    };
  }, [db, settings.excludedDecks, settings.direction, settings.newPerDay, settings.reviewsPerDay]);
  const { data } = useFocusQuery(query);
  const total = data?.decks.reduce((sum, d) => sum + d.count, 0) ?? 0;
  const queued = data ? data.counts.due + data.counts.fresh : 0;
  const unit = settings.direction === 'mixed' ? 'questions' : 'words';

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">Practice</ThemedText>

        {data && total === 0 && (
          <Card>
            <ThemedText>Import a word list to start practicing.</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              You will see a word’s reading or translation and choose how it is written with kanji.
            </ThemedText>
          </Card>
        )}

        {data && total > 0 && (
          <>
            <Card style={styles.countsCard}>
              <Count value={data.counts.due} label="due" />
              <Count value={data.counts.fresh} label="new" />
              <Count value={data.counts.learned} label="learned" />
            </Card>

            <Card>
              <ThemedText type="smallBold">
                {data.selected === total ? `${total} words` : `${data.selected} of ${total} words selected`}
              </ThemedText>
              {data.decks.map((d) => {
                const off = settings.excludedDecks.includes(d.deck);
                return (
                  <View key={d.deck} style={styles.deckRow}>
                    <ThemedText
                      type="small"
                      themeColor={off ? 'textSecondary' : 'text'}
                      style={styles.deckName}
                      numberOfLines={1}>
                      {formatDeck(d.deck)}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {off ? 'off' : d.count}
                    </ThemedText>
                  </View>
                );
              })}
            </Card>

            {data.kanjiCount === 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                Optional: import a kanji list (e.g. Remembering the Kanji) to see keywords.
              </ThemedText>
            )}

            <View style={styles.mode}>
              <Segmented
                options={DIRECTION_OPTIONS}
                value={settings.direction}
                onChange={(direction) => updateSettings({ direction })}
              />
              <ThemedText type="small" themeColor="textSecondary" style={styles.modeHint}>
                {DIRECTION_HINTS[settings.direction]}
              </ThemedText>
            </View>

            {queued > 0 || data.practiced === 0 ? (
              <Button
                title={`Start practice · ${queued} ${unit}`}
                disabled={queued === 0}
                onPress={() => router.push('/quiz')}
              />
            ) : (
              <>
                <ThemedText themeColor="textSecondary" style={styles.modeHint}>
                  Done for today. Change the daily limits in Settings to learn more.
                </ThemedText>
                {data.ahead > 0 && (
                  <Button
                    title={`Practice ahead · ${data.ahead} ${unit}`}
                    variant="secondary"
                    onPress={() => router.push({ pathname: '/quiz', params: { extra: '1' } })}
                  />
                )}
              </>
            )}
          </>
        )}

        <Button
          title={total > 0 ? 'Import more words' : 'Import words'}
          variant={total > 0 ? 'secondary' : 'primary'}
          onPress={() => router.push('/import')}
        />
      </ScrollView>
    </Screen>
  );
}

const DIRECTION_OPTIONS = [
  { value: 'to-kanji', label: 'Kanji' },
  { value: 'to-reading', label: 'Reading' },
  { value: 'mixed', label: 'Mixed' },
] as const;

const DIRECTION_HINTS: Record<DirectionMode, string> = {
  'to-kanji': 'Choose how the word is written, from its reading or translation.',
  'to-reading': 'Choose how a word written in kanji is read.',
  mixed: 'Both kinds of questions. Each keeps its own progress.',
};

function Count({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.count}>
      <ThemedText type="subtitle">{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.three, paddingBottom: Spacing.four },
  countsCard: { flexDirection: 'row', justifyContent: 'space-around' },
  count: { alignItems: 'center' },
  deckRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.three },
  deckName: { flex: 1 },
  mode: { gap: Spacing.two },
  modeHint: { textAlign: 'center' },
});
