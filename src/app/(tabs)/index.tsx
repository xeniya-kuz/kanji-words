import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { getDeckSummaries } from '@/db/notes';
import { countUserKanji } from '@/db/user-kanji';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { formatDeck } from '@/utils/format';

export default function PracticeScreen() {
  const db = useSQLiteContext();
  const query = useCallback(
    async () => ({ decks: await getDeckSummaries(db), kanjiCount: await countUserKanji(db) }),
    [db],
  );
  const { data } = useFocusQuery(query);
  const total = data?.decks.reduce((sum, d) => sum + d.count, 0) ?? 0;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">Practice</ThemedText>

        {data && total === 0 && (
          <Card>
            <ThemedText>Import an Anki deck to start practicing.</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              You will see a word’s reading or translation and choose how it is written with kanji.
            </ThemedText>
          </Card>
        )}

        {data && total > 0 && (
          <>
            <Card>
              <ThemedText type="smallBold">{total} words</ThemedText>
              {data.decks.map((d) => (
                <View key={d.deck} style={styles.deckRow}>
                  <ThemedText type="small" style={styles.deckName} numberOfLines={1}>
                    {formatDeck(d.deck)}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {d.count}
                  </ThemedText>
                </View>
              ))}
            </Card>
            <Card>
              <ThemedText type="small" themeColor="textSecondary">
                {data.kanjiCount > 0
                  ? `Kanji deck: ${data.kanjiCount} kanji with keywords`
                  : 'Optional: import a kanji deck (e.g. Remembering the Kanji) to see keywords.'}
              </ThemedText>
            </Card>
            <Button title="Start practice (coming soon)" disabled />
          </>
        )}

        <Button
          title={total > 0 ? 'Import another deck' : 'Import Anki deck'}
          variant={total > 0 ? 'secondary' : 'primary'}
          onPress={() => router.push('/import')}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.three, paddingBottom: Spacing.four },
  deckRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.three },
  deckName: { flex: 1 },
});
