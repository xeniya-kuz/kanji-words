import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { sessionCounts } from '@/core/quiz/srs';
import { Spacing } from '@/constants/theme';
import { getDeckSummaries, listNotes } from '@/db/notes';
import { getProgressMap } from '@/db/progress';
import { countUserKanji } from '@/db/user-kanji';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useSettings } from '@/state/settings';
import { formatDeck } from '@/utils/format';

export default function PracticeScreen() {
  const db = useSQLiteContext();
  const settings = useSettings();
  const query = useCallback(async () => {
    const excluded = new Set(settings.excludedDecks);
    const notes = (await listNotes(db)).filter((n) => !excluded.has(n.deck ?? ''));
    return {
      decks: await getDeckSummaries(db),
      counts: sessionCounts(
        notes.map((n) => n.id),
        await getProgressMap(db),
        Date.now(),
      ),
      practiced: notes.length,
      kanjiCount: await countUserKanji(db),
    };
  }, [db, settings.excludedDecks]);
  const { data } = useFocusQuery(query);
  const total = data?.decks.reduce((sum, d) => sum + d.count, 0) ?? 0;

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
                {data.practiced === total ? `${total} words` : `${data.practiced} of ${total} words selected`}
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

            <Button
              title={`Start practice · ${Math.min(settings.sessionSize, data.practiced)} words`}
              disabled={data.practiced === 0}
              onPress={() => router.push('/quiz')}
            />
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
});
