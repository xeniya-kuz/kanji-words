import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';

import { Furigana } from '@/components/furigana';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { LEARNED_BOX, type Progress } from '@/core/quiz/srs';
import { Spacing } from '@/constants/theme';
import { listNotes } from '@/db/notes';
import { getProgressMap } from '@/db/progress';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';

type Stage = 'new' | 'learning' | 'learned';

const stageOf = (p: Progress | undefined): Stage => (!p ? 'new' : p.box >= LEARNED_BOX ? 'learned' : 'learning');

export default function WordsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const query = useCallback(
    async () => ({ notes: await listNotes(db, search), progress: await getProgressMap(db) }),
    [db, search],
  );
  const { data } = useFocusQuery(query);
  const stageColor: Record<Stage, string> = {
    new: theme.textSecondary,
    learning: theme.accent,
    learned: theme.correct,
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
        style={[styles.search, { backgroundColor: theme.backgroundElement, color: theme.text }]}
      />
      <FlatList
        data={data?.notes ?? []}
        keyExtractor={(note) => note.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.backgroundSelected }]} />}
        ListEmptyComponent={
          data ? (
            <ThemedText themeColor="textSecondary">
              {search ? 'Nothing found.' : 'No words yet. Import a word list on the Practice tab.'}
            </ThemedText>
          ) : undefined
        }
        renderItem={({ item }) => {
          const stage = stageOf(data?.progress.get(item.id));
          return (
            <View style={styles.row}>
              <Furigana word={item.word} reading={item.reading} segments={item.furigana} size={22} />
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.translation}>
                {item.translation}
              </ThemedText>
              <ThemedText type="small" style={[styles.stage, { color: stageColor[stage] }]}>
                {stage}
              </ThemedText>
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
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  list: { paddingBottom: Spacing.five },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three, paddingVertical: Spacing.two },
  translation: { flex: 1 },
  stage: { minWidth: 56, textAlign: 'right' },
  separator: { height: StyleSheet.hairlineWidth },
});
