import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';

import { Furigana } from '@/components/furigana';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { listNotes } from '@/db/notes';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';

export default function WordsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const query = useCallback(() => listNotes(db, search), [db, search]);
  const { data: notes } = useFocusQuery(query);

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
        data={notes ?? []}
        keyExtractor={(note) => note.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.backgroundSelected }]} />}
        ListEmptyComponent={
          notes ? (
            <ThemedText themeColor="textSecondary">
              {search ? 'Nothing found.' : 'No words yet. Import an Anki deck on the Practice tab.'}
            </ThemedText>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Furigana word={item.word} reading={item.reading} segments={item.furigana} size={22} />
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.translation}>
              {item.translation}
            </ThemedText>
          </View>
        )}
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
  separator: { height: StyleSheet.hairlineWidth },
});
