import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Furigana } from '@/components/furigana';
import { KanjiBreakdown, type KanjiNote } from '@/components/quiz/kanji-breakdown';
import { OptionButton, type OptionState } from '@/components/quiz/option-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { WordNote } from '@/core/import/import-words';
import type { KanjiData } from '@/core/quiz/kanji-data';
import { buildQuestion, type Question } from '@/core/quiz/question';
import { knownKanjiSet } from '@/core/quiz/known-kanji';
import { changedKanji, kanjiOf, score, type AnswerRecord } from '@/core/quiz/session';
import {
  askableIn,
  buildQueue,
  directionsOf,
  EXTRA_PRACTICE_SIZE,
  selectExtraItems,
  type ProgressByDirection,
  type SessionItem,
} from '@/core/quiz/srs';
import type { Settings } from '@/core/settings';
import { startOfDay } from '@/core/stats';
import { JapaneseFont, MaxContentWidth, Spacing } from '@/constants/theme';
import { useKanjiData } from '@/db/kanji-db';
import { listNotes } from '@/db/notes';
import { getProgressMap, getTodayStats, recordAnswer } from '@/db/progress';
import { getUserFrames, getUserKanji } from '@/db/user-kanji';
import { useTheme } from '@/hooks/use-theme';
import { getSettings } from '@/state/settings';

interface Session {
  /** Questions to ask, in order. Words answered wrong are appended once more. */
  items: SessionItem<WordNote>[];
  deckWords: string[];
  known: Set<string>;
  /** Settings at the start of the session, so changing them mid-session doesn't mix things up. */
  settings: Settings;
  /** Imported words before deck filtering, to tell "no words" from "all decks turned off". */
  totalWords: number;
  /** Words in the decks turned on, to tell "all decks turned off" from "nothing to ask this way". */
  selectedWords: number;
  /** Questions that can be asked in the chosen direction, to tell "nothing to ask this way" from "done for today". */
  askableWords: number;
}

interface Prepared {
  question: Question<WordNote>;
  kanji: Map<string, KanjiNote>;
}

type SQLiteDatabase = ReturnType<typeof useSQLiteContext>;

/** Builds the question and looks up keywords/meanings for every kanji in its options. */
async function prepare(
  { note, direction }: SessionItem<WordNote>,
  session: Session,
  data: KanjiData,
  db: SQLiteDatabase,
): Promise<Prepared> {
  const question = await buildQuestion(note, data, {
    direction,
    isKnown: (k) => session.known.has(k),
    deckWords: session.deckWords.filter((w) => w !== note.word),
    difficulty: session.settings.difficulty,
  });
  // The kanji of the word are always needed for the explanation, the ones in the options for wrong picks.
  const all = kanjiOf(note.word + question.options.join(''));
  const user = await getUserKanji(db, all);
  const entries = await Promise.all(
    all.map(async (k): Promise<[string, KanjiNote]> => {
      const info = await data.info(k);
      const own = user.get(k);
      return [
        k,
        {
          kanji: k,
          keyword: own?.keyword ?? undefined,
          frame: own?.frame ?? undefined,
          meaning: info?.meanings.split('; ').slice(0, 3).join(', ') || undefined,
        },
      ];
    }),
  );
  return { question, kanji: new Map(entries) };
}

export default function QuizScreen() {
  const db = useSQLiteContext();
  const data = useKanjiData();
  const theme = useTheme();
  const scroll = useRef<ScrollViewInstance>(null);
  const prepared = useRef(new Map<number, Promise<Prepared>>());
  // "Practice ahead" from the home screen: words that aren't due yet instead of today's queue.
  const ahead = useLocalSearchParams<{ extra?: string }>().extra === '1';

  const [session, setSession] = useState<Session | null>(null);
  const [index, setIndex] = useState(0);
  const [current, setCurrent] = useState<Prepared | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [answers, setAnswers] = useState<AnswerRecord<WordNote>[]>([]);

  const loadSession = useCallback(async (): Promise<Session> => {
    const settings = getSettings();
    const all = await listNotes(db);
    const excluded = new Set(settings.excludedDecks);
    const notes = all.filter((n) => !excluded.has(n.deck ?? ''));
    const deckWords = all.map((n) => n.word);
    const known = knownKanjiSet(settings.knownKanji, settings.courseLimit, {
      deckWords,
      userFrames: await getUserFrames(db),
      bundled: await data.allKanji(),
    });
    const progress: ProgressByDirection = {
      'to-kanji': await getProgressMap(db, 'to-kanji'),
      'to-reading': await getProgressMap(db, 'to-reading'),
    };
    const now = Date.now();
    const items = ahead
      ? selectExtraItems(notes, progress, settings.direction, EXTRA_PRACTICE_SIZE, now)
      : buildQueue(
          notes,
          progress,
          settings.direction,
          { newPerDay: settings.newPerDay, reviewsPerDay: settings.reviewsPerDay },
          await getTodayStats(db, startOfDay(now)),
          now,
        ).items;
    return {
      items,
      deckWords,
      known,
      settings,
      totalWords: all.length,
      selectedWords: notes.length,
      askableWords: directionsOf(settings.direction).reduce((sum, d) => sum + askableIn(notes, d).length, 0),
    };
  }, [db, data, ahead]);

  useEffect(() => {
    let active = true;
    loadSession().then((s) => {
      if (active) setSession(s);
    });
    return () => {
      active = false;
    };
  }, [loadSession]);

  async function restart() {
    const s = await loadSession();
    prepared.current.clear();
    setSession(s);
    setIndex(0);
    setAnswers([]);
    setChosen(null);
    setCurrent(null);
  }

  // Load the current question and start preparing the next one while the learner answers.
  useEffect(() => {
    if (!session || index >= session.items.length) return;
    const get = (i: number) => {
      let p = prepared.current.get(i);
      if (!p && i < session.items.length) {
        p = prepare(session.items[i], session, data, db);
        prepared.current.set(i, p);
      }
      return p;
    };
    let active = true;
    get(index)?.then((p) => {
      if (active) setCurrent(p);
    });
    get(index + 1);
    return () => {
      active = false;
    };
  }, [session, index, data, db]);

  function answer(optionIndex: number) {
    if (!current || chosen != null) return;
    const { question } = current;
    const { note, direction } = question;
    const correct = optionIndex === question.correctIndex;
    const retry = answers.some((a) => a.note.id === note.id);
    setChosen(optionIndex);
    setAnswers((list) => [...list, { note, chosen: question.options[optionIndex], correct, retry }]);
    // Only the first attempt counts for spaced repetition; a missed word is asked once more at the end.
    recordAnswer(db, note.id, correct, !retry, direction).catch((e) => console.warn('Could not save answer', e));
    if (!correct && !retry) setSession((s) => s && { ...s, items: [...s.items, { note, direction }] });
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
  }

  function next() {
    setChosen(null);
    setCurrent(null);
    setIndex((i) => i + 1);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  if (!session) return <Loading />;

  if (session.items.length === 0) {
    return (
      <Centered>
        <ThemedText style={styles.center}>
          {session.totalWords === 0
            ? 'No words yet. Import a word list first.'
            : session.selectedWords === 0
              ? 'All decks are turned off. Choose decks to practice in Settings.'
              : session.askableWords === 0
                ? 'None of the selected words can be asked this way: reading questions need a word with kanji and a hiragana reading.'
                : ahead
                  ? 'No started words to practice ahead.'
                  : 'Done for today! New words and reviews come back tomorrow, or raise the daily limits in Settings.'}
        </ThemedText>
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </Centered>
    );
  }

  if (index >= session.items.length) {
    const { correct, total } = score(answers);
    const missed = answers.filter((a) => !a.correct && !a.retry);
    return (
      <ThemedView style={styles.fill}>
        <SafeAreaView edges={['bottom']} style={styles.fill}>
          <ScrollView contentContainerStyle={styles.content}>
            <ThemedText type="subtitle" style={styles.center}>
              {correct} / {total}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.center}>
              {missed.length === 0 ? 'All correct!' : 'Words to look at again:'}
            </ThemedText>
            {missed.map((a) => (
              <Card key={a.note.id}>
                <Furigana word={a.note.word} reading={a.note.reading} segments={a.note.furigana} size={26} />
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                  {a.note.translation}
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.wrong }}>
                  You chose <Text style={{ fontFamily: JapaneseFont }}>{a.chosen}</Text>
                </ThemedText>
              </Card>
            ))}
            <Button title="Practice again" onPress={restart} />
            <Button title="Done" variant="secondary" onPress={() => router.back()} />
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (!current) return <Loading />;

  const { question } = current;
  const { note, direction } = question;
  const answered = chosen != null;
  const isCorrect = chosen === question.correctIndex;
  const optionState = (i: number): OptionState => {
    if (!answered) return 'idle';
    if (i === question.correctIndex) return 'correct';
    return i === chosen ? 'wrong' : 'dimmed';
  };
  const breakdown = (word: string) => kanjiOf(word).map((k) => current.kanji.get(k) ?? { kanji: k });
  const chosenText = chosen != null ? question.options[chosen] : '';
  const mode = session.settings.promptMode;
  // For a spelling the reading is the answer, so the word itself is the prompt and the translation a hint.
  // A word without a translation still needs something to show.
  const toReading = direction === 'to-reading';
  const showWord = toReading;
  const showReading = !toReading && (mode !== 'translation' || !note.translation);
  const showTranslation = mode !== 'reading' && !!note.translation;
  const isRetry = session.items.findIndex((item) => item.note.id === note.id) < index;

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView edges={['bottom']} style={styles.fill}>
        <ScrollView ref={scroll} contentContainerStyle={styles.content}>
          <View style={styles.progressRow}>
            <View style={[styles.progressTrack, { backgroundColor: theme.backgroundElement }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: theme.accent, width: `${(index / session.items.length) * 100}%` },
                ]}
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {index + 1} / {session.items.length}
            </ThemedText>
          </View>

          <Card style={styles.prompt}>
            {isRetry && (
              <ThemedText type="small" themeColor="textSecondary">
                Once more
              </ThemedText>
            )}
            {showWord && <Text style={[styles.reading, { color: theme.text }]}>{note.word}</Text>}
            {showReading && (
              <Text style={[styles.reading, { color: theme.text }]}>{note.readingLabel ?? note.reading}</Text>
            )}
            {showTranslation && (
              <ThemedText style={styles.center} themeColor={showReading || showWord ? 'textSecondary' : 'text'}>
                {note.translation}
              </ThemedText>
            )}
          </Card>

          <View style={styles.options}>
            {question.options.map((option, i) => (
              <OptionButton key={option} text={option} state={optionState(i)} onPress={() => answer(i)} />
            ))}
          </View>

          {answered && (
            <Card>
              <ThemedText type="smallBold" style={{ color: isCorrect ? theme.correct : theme.wrong }}>
                {isCorrect ? 'Correct!' : 'Not quite'}
              </ThemedText>
              <Furigana word={note.word} reading={note.reading} segments={note.furigana} size={36} />
              <ThemedText type="small" themeColor="textSecondary">
                {note.translation}
              </ThemedText>
              <KanjiBreakdown kanji={breakdown(note.word)} />
              {!isCorrect && changedKanji(note.word, chosenText).length > 0 && (
                <>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.chosenLabel}>
                    You chose <Text style={{ fontFamily: JapaneseFont }}>{chosenText}</Text>:
                  </ThemedText>
                  <KanjiBreakdown kanji={changedKanji(note.word, chosenText).map((k) => current.kanji.get(k) ?? { kanji: k })} />
                </>
              )}
            </Card>
          )}

          {answered && (
            <Button title={index + 1 < session.items.length ? 'Next' : 'See results'} onPress={next} />
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Loading() {
  const theme = useTheme();
  return (
    <Centered>
      <ActivityIndicator size="large" color={theme.accent} />
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <ThemedView style={[styles.fill, styles.centered]}>{children}</ThemedView>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  center: { textAlign: 'center' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  progressTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  prompt: { alignItems: 'center', paddingVertical: Spacing.four },
  reading: { fontFamily: JapaneseFont, fontSize: 34, lineHeight: 48, textAlign: 'center' },
  options: { gap: Spacing.two },
  chosenLabel: { marginTop: Spacing.two },
});
