import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

export default function PracticeScreen() {
  return (
    <Screen>
      <ThemedText type="subtitle">Practice</ThemedText>
      <ThemedText themeColor="textSecondary">Import an Anki deck to start practicing.</ThemedText>
    </Screen>
  );
}
