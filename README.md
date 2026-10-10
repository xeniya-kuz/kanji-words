# Kanji Words

An Android app for learning to recognize Japanese words by their kanji. It imports your Anki decks
and quizzes you: you see a word's reading and/or translation and pick its correct spelling among
four look-alike options.

Built with Expo (React Native) and TypeScript.

## Run it on your phone

1. Install **Expo Go** from Google Play.
2. In this folder run:
   ```sh
   npm install
   npx expo start
   ```
3. Scan the QR code with Expo Go. The phone and the computer must be on the same Wi-Fi
   (otherwise use `npx expo start --tunnel`).

## Development

```sh
npm test            # unit tests (Jest)
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm run build:kanji-db   # rebuild assets/db/kanji.db from dictionary sources
```

`assets/db/kanji.db` is committed, so rebuilding is only needed to update the data. Sources and
licenses are listed in [assets/db/README.md](assets/db/README.md).

Real Anki exports can be put in `test-data/private/` (`words.txt`, `rtk.txt`) to run the importer
tests on them. That folder is git-ignored so personal decks are never committed.

## Project structure

```
src/app/            screens (Expo Router: every file is a route)
src/components/     shared UI components
scripts/            build-kanji-db.mts (runs on plain Node 24)
assets/db/          kanji.db: bundled kanji, look-alikes, readings, JMdict words
src/core/           plain TypeScript logic, no React: tested with Jest
  anki/             Anki export parsing, column detection, word and kanji importers
  text/             HTML cleanup, furigana (ruby / 漢字[かんじ]) parsing, Japanese helpers
```

## Importing decks

In Anki: **File → Export → Notes in Plain Text (.txt)**, with "Include HTML" and
"Include unique identifier" checked. The app detects which column is the word, reading,
translation and furigana and lets you confirm before importing.

An optional kanji deck (e.g. Remembering the Kanji) adds keywords and frame numbers. Keywords
come only from the user's own deck and are never bundled with the app.
