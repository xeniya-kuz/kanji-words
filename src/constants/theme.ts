import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0f1020',
    background: '#f6f6fb',
    backgroundElement: '#ffffff',
    backgroundSelected: '#e6e7f2',
    textSecondary: '#62647a',
    accent: '#5b5bf0',
    onAccent: '#ffffff',
    accentSoft: '#e9e9fe',
    border: '#e3e4ef',
    correct: '#168a4f',
    correctSoft: '#e1f5ea',
    wrong: '#d6403f',
    wrongSoft: '#fbe5e5',
  },
  // Deep blue-black canvas with slightly lighter, hairline-bordered surfaces and a violet accent.
  dark: {
    text: '#f2f2f8',
    background: '#09090f',
    backgroundElement: '#14141d',
    backgroundSelected: '#23232f',
    textSecondary: '#9a9bb0',
    accent: '#8b8cff',
    onAccent: '#0b0b18',
    accentSoft: '#22224a',
    border: '#252533',
    correct: '#4ade98',
    correctSoft: '#11291f',
    wrong: '#ff7a85',
    wrongSoft: '#2e1519',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    mono: 'monospace',
  },
});

/** Bundled Noto Sans JP, so kanji use Japanese glyph shapes whatever the phone's language. */
export const JapaneseFont = 'NotoSansJP';

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Corner radii: cards and big tiles, buttons and inputs, and small chips. */
export const Radius = {
  card: 20,
  control: 16,
  small: 10,
} as const;

export const MaxContentWidth = 800;
