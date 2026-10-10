import { NotoSansJP_400Regular } from '@expo-google-fonts/noto-sans-jp/400Regular';
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
  // Only the Regular weight is bundled: each Noto Sans JP weight is ~5.6 MB.
  const [fontsLoaded, fontError] = useFonts({ [JapaneseFont]: NotoSansJP_400Regular });
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
