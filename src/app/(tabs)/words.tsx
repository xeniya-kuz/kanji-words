import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

export default function WordsScreen() {
  return (
    <Screen>
      <ThemedText type="subtitle">Words</ThemedText>
      <ThemedText themeColor="textSecondary">Your imported words will appear here.</ThemedText>
    </Screen>
  );
}
