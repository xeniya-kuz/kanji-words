import { StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { JapaneseFont, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface KanjiNote {
  kanji: string;
  /** From the user's kanji deck (e.g. RTK keyword). */
  keyword?: string;
  /** Position in the user's kanji deck (e.g. RTK frame). */
  frame?: number;
  /** English meanings from KANJIDIC2, used when there is no keyword. */
  meaning?: string;
}

/** One row per kanji: the character, its keyword (or meaning) and its number in the user's kanji deck. */
export function KanjiBreakdown({ kanji }: { kanji: KanjiNote[] }) {
  const theme = useTheme();
  return (
    <View style={styles.list}>
      {kanji.map((k) => (
        <View key={k.kanji} style={styles.row}>
          <Text style={[styles.kanji, { color: theme.text }]}>{k.kanji}</Text>
          <View style={styles.text}>
            <ThemedText type={k.keyword ? 'smallBold' : 'small'}>{k.keyword ?? k.meaning ?? '—'}</ThemedText>
            {k.frame != null && (
              <ThemedText type="small" themeColor="textSecondary">
                #{k.frame}
              </ThemedText>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  kanji: { fontFamily: JapaneseFont, fontSize: 30, lineHeight: 42, width: 40, textAlign: 'center' },
  text: { flex: 1 },
});
