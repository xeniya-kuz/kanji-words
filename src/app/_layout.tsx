import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { JapaneseFont } from '@/constants/theme';
import { KanjiDbProvider } from '@/db/kanji-db';
import { APP_DB_NAME, migrateAppDb } from '@/db/schema';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // Noto Sans JP Regular, reduced to the characters the app shows (see scripts/build-font.mts).
  const [fontsLoaded, fontError] = useFonts({ [JapaneseFont]: require('@/assets/fonts/NotoSansJP-Subset.ttf') });
  const ready = fontsLoaded || fontError != null;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <KanjiDbProvider>
        <SQLiteProvider databaseName={APP_DB_NAME} onInit={migrateAppDb}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="import" options={{ title: 'Import' }} />
            <Stack.Screen name="quiz" options={{ title: 'Practice' }} />
          </Stack>
        </SQLiteProvider>
      </KanjiDbProvider>
    </ThemeProvider>
  );
}
