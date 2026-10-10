/** Local calendar day of a timestamp, e.g. "2026-10-10". */
export function dayKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Consecutive days with practice, ending today (or yesterday, so the streak isn't lost
 * before you practice today).
 */
export function streakDays(practiceDays: Set<string>, now: number): number {
  const DAY = 24 * 60 * 60 * 1000;
  let cursor = now;
  if (!practiceDays.has(dayKey(cursor))) cursor -= DAY;
  let streak = 0;
  while (practiceDays.has(dayKey(cursor))) {
    streak++;
    cursor -= DAY;
  }
  return streak;
}

export function accuracy(correct: number, total: number): number | null {
  return total > 0 ? Math.round((correct / total) * 100) : null;
}
