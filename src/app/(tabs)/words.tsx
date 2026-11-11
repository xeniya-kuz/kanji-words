import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';

import { Furigana } from '@/components/furigana';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { DIRECTIONS, type Direction } from '@/core/quiz/session';
import { askableIn, LEARNED_BOX, type Progress } from '@/core/quiz/srs';
import { DIRECTION_SHORT } from '@/constants/directions';
import { Radius, Spacing } from '@/constants/theme';
import { listNotes } from '@/db/notes';
import { getProgressMap } from '@/db/progress';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';

type Stage = 'new' | 'learning' | 'learned' | 'n/a';

const stageOf = (p: Progress | undefined): Stage => (!p ? 'new' : p.box >= LEARNED_BOX ? 'learned' : 'learning');

export default function WordsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const query = useCallback(
    async () => ({
      notes: await listNotes(db, search),
      progress: {
        'to-kanji': await getProgressMap(db, 'to-kanji'),
        'to-reading': await getProgressMap(db, 'to-reading'),
      } as Record<Direction, Map<string, Progress>>,
    }),
    [db, search],
  );
  const { data } = useFocusQuery(query);
  const stageColor: Record<Stage, string> = {
    new: theme.textSecondary,
    learning: theme.accent,
    learned: theme.correct,
    'n/a': theme.textSecondary,
  };

  return (
    <Screen style={styles.screen}>
      <ThemedText type="subtitle">Words</ThemedText>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search word, reading or translation"
        placeholderTextColor={theme.textSecondary}
        autoCorrect={false}
        style={[styles.search, { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text }]}
      />
      <FlatList
        data={data?.notes ?? []}
        keyExtractor={(note) => note.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
        ListEmptyComponent={
          data ? (
            <ThemedText themeColor="textSecondary">
              {search ? 'Nothing found.' : 'No words yet. Import a word list on the Practice tab.'}
            </ThemedText>
          ) : undefined
        }
        renderItem={({ item }) => {
          return (
            <View style={styles.row}>
              <Furigana word={item.word} reading={item.reading} segments={item.furigana} size={22} />
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.translation}>
                {item.translation}
              </ThemedText>
              <View style={styles.stages}>
                {DIRECTIONS.map((direction) => {
                  // Words without kanji can't be asked for their reading.
                  const stage: Stage =
                    askableIn([item], direction).length === 0 ? 'n/a' : stageOf(data?.progress[direction].get(item.id));
                  return (
                    <ThemedText key={direction} type="small" style={styles.stage}>
                      <ThemedText type="small" themeColor="textSecondary">
                        {DIRECTION_SHORT[direction]}{' '}
                      </ThemedText>
                      <ThemedText type="small" style={{ color: stageColor[stage] }}>
                        {stage}
                      </ThemedText>
                    </ThemedText>
                  );
                })}
              </View>
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  search: {
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  list: { paddingBottom: Spacing.five },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three, paddingVertical: Spacing.two },
  translation: { flex: 1 },
  stages: { minWidth: 104, alignItems: 'flex-end' },
  stage: { textAlign: 'right' },
  separator: { height: StyleSheet.hairlineWidth },
});
