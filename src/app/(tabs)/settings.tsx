import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

export default function SettingsScreen() {
  return (
    <Screen>
      <ThemedText type="subtitle">Settings</ThemedText>
      <ThemedText themeColor="textSecondary">Quiz and import settings will appear here.</ThemedText>
    </Screen>
  );
}
