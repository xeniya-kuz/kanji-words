import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Furigana } from '@/components/furigana';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { DIRECTIONS, type Direction } from '@/core/quiz/session';
import { askableIn, LEARNED_BOX, MAX_BOX } from '@/core/quiz/srs';
import { accuracy, dayKey, streakDays } from '@/core/stats';
import { DIRECTION_LABEL } from '@/constants/directions';
import { Spacing } from '@/constants/theme';
import { listNotes } from '@/db/notes';
import { answerTimestamps, answerTotals, getProgressMap, mostMissed } from '@/db/progress';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/state/settings';

const DAY = 24 * 60 * 60 * 1000;

/** Everything shown for one direction: the two directions are learned and counted separately. */
async function directionStats(db: ReturnType<typeof useSQLiteContext>, direction: Direction, now: number) {
  const notes = askableIn(await listNotes(db), direction);
  const progress = await getProgressMap(db, direction);
  // Words per box; index MAX_BOX + 1 holds new words.
  const boxes = Array.from({ length: MAX_BOX + 2 }, () => 0);
  for (const note of notes) {
    const p = progress.get(note.id);
    boxes[p ? p.box : MAX_BOX + 1]++;
  }
  return {
    total: notes.length,
    boxes,
    learned: boxes.slice(LEARNED_BOX, MAX_BOX + 1).reduce((a, b) => a + b, 0),
    week: await answerTotals(db, now - 7 * DAY, direction),
    allTime: await answerTotals(db, 0, direction),
    missed: await mostMissed(db, direction, 10),
  };
}

export default function StatsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const settings = useSettings();
  // Starts on what the learner practices; "mixed" has two sets of numbers, so it starts on the first.
  const [direction, setDirection] = useState<Direction>(
    settings.direction === 'mixed' ? 'to-kanji' : settings.direction,
  );
  const query = useCallback(async () => {
    const now = Date.now();
    const days = new Set((await answerTimestamps(db, now - 400 * DAY)).map(dayKey));
    return {
      streak: streakDays(days, now),
      today: await answerTotals(db, new Date(new Date(now).setHours(0, 0, 0, 0)).getTime()),
      by: {
        'to-kanji': await directionStats(db, 'to-kanji', now),
        'to-reading': await directionStats(db, 'to-reading', now),
      } as Record<Direction, Awaited<ReturnType<typeof directionStats>>>,
    };
  }, [db]);
  const { data } = useFocusQuery(query);

  if (!data) return <Screen />;

  const stats = data.by[direction];
  const newWords = stats.boxes[MAX_BOX + 1];
  const segments = [
    { label: 'new', count: newWords, color: theme.backgroundSelected },
    { label: 'learning', count: stats.total - newWords - stats.learned, color: theme.accent },
    { label: 'learned', count: stats.learned, color: theme.correct },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">Stats</ThemedText>

        <Card style={styles.tiles}>
          <Tile value={String(data.streak)} label={data.streak === 1 ? 'day streak' : 'days streak'} />
          <Tile value={String(data.today.total)} label="answers today" />
        </Card>

        <Segmented
          options={DIRECTIONS.map((d) => ({ value: d, label: DIRECTION_LABEL[d] }))}
          value={direction}
          onChange={setDirection}
        />

        <Card style={styles.tiles}>
          <Tile value={percent(accuracy(stats.week.correct, stats.week.total))} label="correct, 7 days" />
          <Tile value={percent(accuracy(stats.allTime.correct, stats.allTime.total))} label="correct, all time" />
          <Tile value={String(stats.allTime.total)} label="answers" />
        </Card>

        <Card>
          <ThemedText type="smallBold">
            {stats.learned} of {stats.total} words learned
          </ThemedText>
          <View style={[styles.bar, { backgroundColor: theme.backgroundSelected }]}>
            {segments.map((s) =>
              s.count > 0 ? <View key={s.label} style={{ flex: s.count, backgroundColor: s.color }} /> : null,
            )}
          </View>
          <View style={styles.legend}>
            {segments.map((s) => (
              <View key={s.label} style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: s.color }]} />
                <ThemedText type="small" themeColor="textSecondary">
                  {s.count} {s.label}
                </ThemedText>
              </View>
            ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            A word counts as learned after {LEARNED_BOX} correct answers in a row on different days.
            {direction === 'to-reading' && ' Words without kanji can’t be asked this way and aren’t counted.'}
          </ThemedText>
        </Card>

        {stats.missed.length > 0 && (
          <>
            <ThemedText type="smallBold">Most missed · {DIRECTION_LABEL[direction]}</ThemedText>
            <Card>
              {stats.missed.map(({ note, wrong, correct }) => (
                <View key={note.id} style={styles.missedRow}>
                  <Furigana word={note.word} reading={note.reading} segments={note.furigana} size={22} />
                  <View style={styles.fill}>
                    <ThemedText type="small" numberOfLines={1}>
                      {note.translation}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {wrong} wrong · {correct} right
                    </ThemedText>
                  </View>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const percent = (value: number | null) => (value == null ? '—' : `${value}%`);

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.tile}>
      <ThemedText type="subtitle">{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  content: { gap: Spacing.three, paddingBottom: Spacing.five },
  tiles: { flexDirection: 'row', justifyContent: 'space-around' },
  tile: { alignItems: 'center', flex: 1 },
  bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden' },
  legend: { flexDirection: 'row', gap: Spacing.three, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  dot: { width: 10, height: 10, borderRadius: 5 },
  missedRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three, paddingVertical: Spacing.one },
});
