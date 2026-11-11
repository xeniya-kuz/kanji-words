import { Pressable, StyleSheet, Text } from 'react-native';

import { JapaneseFont, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type OptionState = 'idle' | 'correct' | 'wrong' | 'dimmed';

type OptionButtonProps = {
  text: string;
  state: OptionState;
  onPress: () => void;
};

export function OptionButton({ text, state, onPress }: OptionButtonProps) {
  const theme = useTheme();
  const borderColor = state === 'correct' ? theme.correct : state === 'wrong' ? theme.wrong : theme.border;
  const backgroundColor =
    state === 'correct' ? theme.correctSoft : state === 'wrong' ? theme.wrongSoft : theme.backgroundElement;
  // Long phrases get a smaller font so they stay on one line.
  const size = text.length > 7 ? 22 : text.length > 4 ? 28 : 34;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={state !== 'idle'}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: pressed ? theme.backgroundSelected : backgroundColor,
          borderColor,
          opacity: state === 'dimmed' ? 0.4 : 1,
        },
      ]}>
      <Text
        style={{ fontFamily: JapaneseFont, fontSize: size, lineHeight: size * 1.4, color: theme.text }}
        numberOfLines={1}
        adjustsFontSizeToFit>
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    minHeight: 72,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
