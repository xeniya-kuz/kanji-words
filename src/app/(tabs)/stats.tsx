import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Furigana } from '@/components/furigana';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { LEARNED_BOX, MAX_BOX } from '@/core/quiz/srs';
import { accuracy, dayKey, streakDays } from '@/core/stats';
import { Spacing } from '@/constants/theme';
import { listNotes } from '@/db/notes';
import { answerTimestamps, answerTotals, getProgressMap, mostMissed } from '@/db/progress';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';

const DAY = 24 * 60 * 60 * 1000;

export default function StatsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const query = useCallback(async () => {
    const now = Date.now();
    const notes = await listNotes(db);
    const progress = await getProgressMap(db);
    // Words per box; index MAX_BOX + 1 holds new words.
    const boxes = Array.from({ length: MAX_BOX + 2 }, () => 0);
    for (const note of notes) {
      const p = progress.get(note.id);
      boxes[p ? p.box : MAX_BOX + 1]++;
    }
    const days = new Set((await answerTimestamps(db, now - 400 * DAY)).map(dayKey));
    return {
      total: notes.length,
      boxes,
      learned: boxes.slice(LEARNED_BOX, MAX_BOX + 1).reduce((a, b) => a + b, 0),
      streak: streakDays(days, now),
      today: await answerTotals(db, new Date(new Date(now).setHours(0, 0, 0, 0)).getTime()),
      week: await answerTotals(db, now - 7 * DAY),
      allTime: await answerTotals(db),
      missed: await mostMissed(db, 10),
    };
  }, [db]);
  const { data } = useFocusQuery(query);

  if (!data) return <Screen />;

  const newWords = data.boxes[MAX_BOX + 1];
  const segments = [
    { label: 'new', count: newWords, color: theme.backgroundSelected },
    { label: 'learning', count: data.total - newWords - data.learned, color: theme.accent },
    { label: 'learned', count: data.learned, color: theme.correct },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">Stats</ThemedText>

        <Card style={styles.tiles}>
          <Tile value={String(data.streak)} label={data.streak === 1 ? 'day streak' : 'days streak'} />
          <Tile value={String(data.today.total)} label="answers today" />
          <Tile value={percent(accuracy(data.week.correct, data.week.total))} label="correct, 7 days" />
        </Card>

        <Card>
          <ThemedText type="smallBold">
            {data.learned} of {data.total} words learned
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
          </ThemedText>
        </Card>

        <Card>
          <ThemedText type="smallBold">All time</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {data.allTime.total} answers · {percent(accuracy(data.allTime.correct, data.allTime.total))} correct
          </ThemedText>
        </Card>

        {data.missed.length > 0 && (
          <>
            <ThemedText type="smallBold">Most missed</ThemedText>
            <Card>
              {data.missed.map(({ note, wrong, correct }) => (
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
