import { StyleSheet, Text, View } from 'react-native';

import type { FuriganaSegment } from '@/core/text/furigana';
import { JapaneseFont } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type FuriganaProps = {
  word: string;
  reading: string;
  /** Per-kanji readings; without them the reading is shown above the whole word. */
  segments?: FuriganaSegment[];
  size?: number;
  showReading?: boolean;
};

/**
 * React Native has no <ruby>, so each segment is a small column: reading on top, base text below.
 * Plain kana segments get an empty reading line so all bases stay on one baseline.
 */
export function Furigana({ word, reading, segments, size = 28, showReading = true }: FuriganaProps) {
  const theme = useTheme();
  const parts = segments && segments.length > 0 ? segments : [{ text: word, reading }];
  const rubySize = Math.round(size * 0.45);

  return (
    <View style={styles.row}>
      {parts.map((part, i) => (
        <View key={i} style={styles.segment}>
          {showReading && (
            <Text
              style={{
                fontFamily: JapaneseFont,
                fontSize: rubySize,
                lineHeight: rubySize * 1.4,
                color: theme.textSecondary,
              }}>
              {part.reading ?? ' '}
            </Text>
          )}
          <Text style={{ fontFamily: JapaneseFont, fontSize: size, lineHeight: size * 1.4, color: theme.text }}>
            {part.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  segment: {
    alignItems: 'center',
  },
});
