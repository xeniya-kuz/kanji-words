import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

export default function StatsScreen() {
  return (
    <Screen>
      <ThemedText type="subtitle">Stats</ThemedText>
      <ThemedText themeColor="textSecondary">Your progress will appear here.</ThemedText>
    </Screen>
  );
}
