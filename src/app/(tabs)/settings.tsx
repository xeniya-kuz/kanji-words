import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { deleteAllNotes } from '@/db/notes';
import { deleteUserKanji } from '@/db/user-kanji';

export default function SettingsScreen() {
  const db = useSQLiteContext();

  const confirm = (title: string, message: string, action: () => Promise<void>) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void action() },
    ]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">Settings</ThemedText>

        <ThemedText type="smallBold">Decks</ThemedText>
        <Button title="Import Anki deck" onPress={() => router.push('/import')} />
        <Button
          title="Delete all words"
          variant="danger"
          onPress={() =>
            confirm('Delete all words?', 'Your imported words will be removed. Re-import a deck to get them back.', () =>
              deleteAllNotes(db),
            )
          }
        />
        <Button
          title="Delete kanji deck"
          variant="danger"
          onPress={() => confirm('Delete kanji deck?', 'Kanji keywords and frame numbers will be removed.', () => deleteUserKanji(db))}
        />

        <ThemedText type="smallBold">About</ThemedText>
        <Card>
          <ThemedText type="small">
            Kanji data: KANJIDIC2, KRADFILE and JMdict by the Electronic Dictionary Research and Development Group
            (CC BY-SA 4.0). Kanji similarity: Lars Yencken’s kanji confusion datasets (CC BY 3.0).
          </ThemedText>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.three, paddingBottom: Spacing.four },
});
