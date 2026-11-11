import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Colors, JapaneseFont } from '@/constants/theme';
import { KanjiDbProvider } from '@/db/kanji-db';
import { APP_DB_NAME, migrateAppDb } from '@/db/schema';

SplashScreen.preventAutoHideAsync();

/** Navigation colors (headers, backgrounds) taken from the app palette so they match the screens. */
function navigationTheme(scheme: 'light' | 'dark') {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Colors[scheme];
  return {
    ...base,
    colors: { ...base.colors, primary: c.accent, background: c.background, card: c.background, text: c.text, border: c.border },
  };
}

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
    <ThemeProvider value={navigationTheme(colorScheme === 'dark' ? 'dark' : 'light')}>
      <KanjiDbProvider>
        <SQLiteProvider databaseName={APP_DB_NAME} onInit={migrateAppDb}>
          <Stack screenOptions={{ headerShadowVisible: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="import" options={{ title: 'Import' }} />
            <Stack.Screen name="quiz" options={{ title: 'Practice' }} />
          </Stack>
        </SQLiteProvider>
      </KanjiDbProvider>
    </ThemeProvider>
  );
}
