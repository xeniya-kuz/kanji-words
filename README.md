# Kanji Words

An Android app for learning to recognize Japanese words by their kanji, using your own word lists.

You see a word's reading and/or translation and pick its correct spelling among four options. The
wrong options look or sound like the right one, so you can't answer by the reading alone. You
have to recognize the kanji.

## Features

- **Imports your own word lists**: Anki exports, CSV/TSV files from Google Sheets or Excel, or any
  other text file with one word per line. The app detects which column is the word, reading,
  translation and furigana (ruby or `漢字[かんじ]`), and you confirm it.
- **Believable wrong answers** built from look-alike kanji, kanji with the same reading, real
  homophones (期間 / 機関) and words from your decks, balanced so the answer can't be guessed from
  which kanji repeats most.
- **Three difficulty levels**: easy (clearly different kanji), normal (a mix), hard (the most
  confusing look-alikes and homophones).
- **Optional kanji deck** (e.g. Remembering the Kanji) to show keywords for each kanji and to
  focus wrong answers on the kanji you have already learned.
- **Spaced repetition**: words you miss come back sooner; words you know come back less often.
- Statistics, dark mode, works fully offline.

## Install on Android

1. Open the APK download link on your phone and download the file.
2. Open it. Android asks to allow installing apps from this source (your browser or file manager):
   allow it.
3. If Google Play Protect warns about an unknown app, choose **Install anyway**: the app isn't
   published on Google Play, so Play doesn't know it yet.

Works on Android 7 and newer.

## Import your words

Any text file works: one word per line, columns separated by tabs, commas or semicolons
(`.txt`, `.csv`, `.tsv`), saved as UTF-8. A first row with column names (`word,reading,meaning`)
is recognized automatically.

- A **word list** needs the word written with kanji (聞く), its reading in kana (きく) and a
  translation. Furigana is optional. Words written only in kana are skipped.
- Optional parts of a reading in parentheses, like `(に)きく` or `あに (き)`, are shown in the
  question as written, while the furigana uses the reading that fits the word.
- A **kanji list** needs one kanji per line; a keyword, an order number (like an RTK frame) and
  readings are optional.

Where to get the file:

- **Anki**: File → Export → **Notes in Plain Text (.txt)**, with **Include HTML and media
  references**, **Include unique identifier**, **Include deck name** and **Include notetype name**
  checked. Re-importing the same deck later updates its words and keeps your progress.
- **Google Sheets**: File → Download → **Tab-separated values (.tsv)**.
- **Excel**: Save As → **CSV UTF-8**.
- **Other flashcard apps**: their export to text or CSV.

Copy the file to your phone (USB, Google Drive, a messenger…), then in the app:
**Practice → Import words → Choose file**, check the columns and the preview, and tap **Import**.

## Development

Built with [Expo](https://expo.dev) (React Native) and TypeScript.

```sh
npm install
npx expo start          # then scan the QR code with Expo Go on your phone
npm test                # unit tests (Jest)
npm run typecheck       # TypeScript
npm run lint            # ESLint
npm run build:kanji-db  # rebuild assets/db/kanji.db from dictionary sources
npm run build:icons     # regenerate the app icon and splash image
```

Real word lists can be put in `test-data/private/` (`words.txt`, `rtk.txt`) to run the tests on
them. That folder is git-ignored so personal decks are never committed.

### Building the APK

The APK is built in the cloud with [EAS Build](https://docs.expo.dev/build/introduction/), so no
Android Studio is needed. You need a free Expo account.

```sh
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

The first build links the project to your Expo account and creates the app's signing key (answer
yes to both questions). When the build finishes, the terminal and the Expo website show a link to
the APK, which can be shared directly. Keep using the same Expo account for later builds: the
signing key is stored there, and Android only installs updates signed with the same key.

### Project structure

```
src/app/            screens (Expo Router: every file is a route)
src/components/     shared UI components (furigana, buttons, quiz pieces…)
src/core/           plain TypeScript logic, no React: tested with Jest
  import/           word file parsing, column detection, word and kanji importers
  quiz/             wrong-answer generator, spaced repetition, session helpers
  text/             HTML cleanup, furigana parsing, Japanese text helpers
src/db/             SQLite: the app's own database and the bundled kanji database
src/state/          settings
scripts/            build-kanji-db.mts, build-icons.mts (plain Node 24)
assets/db/          kanji.db: bundled kanji, look-alikes, readings, JMdict words
```

## Data and licenses

The app code is MIT licensed (see [LICENSE](LICENSE)). The bundled dictionary data is not:

- **KANJIDIC2, KRADFILE, JMdict**: © Electronic Dictionary Research and Development Group,
  [CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html), via
  [jmdict-simplified](https://github.com/scriptin/jmdict-simplified).
- **Kanji similarity sets**: Lars Yencken,
  [kanji confusion datasets](https://lars.yencken.org/datasets/kanji-confusion),
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- **Noto Sans JP** font: Google, [SIL Open Font License](https://openfontlicense.org).

Details in [assets/db/README.md](assets/db/README.md). Keywords from a user's kanji deck (such as
Remembering the Kanji) are only ever imported by the user and never bundled with the app.
