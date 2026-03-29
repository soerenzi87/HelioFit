import { WorkoutLog, HealthMetricEntry } from '../types';

// ── Types ────────────────────────────────────────────────────────────────

export interface RecoveryEntry {
  workoutDate: string;
  workoutTitle: string;
  workoutVolume: number;
  workoutDuration?: number;
  trainingLoad: number;
  nextDayHRV?: number;
  nextDayRestingHR?: number;
  nextDaySleepHours?: number;
  nextDayDeepSleepMin?: number;
  baselineHRV?: number;
  baselineRestingHR?: number;
  baselineSleepHours?: number;
  recoveryScore: number;
  recoveryStatus: 'optimal' | 'adequate' | 'insufficient' | 'pending';
  pending?: boolean;    // true when health data for next day is not yet available
}

export interface TrainingRecoverySummary {
  entries: RecoveryEntry[];
  avgRecoveryScore: number;
  avgTrainingLoad: number;
  loadToRecoveryRatio: number;
  trend: 'improving' | 'stable' | 'declining';
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Normalize any ISO date string to YYYY-MM-DD. */
function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Add `days` to a YYYY-MM-DD string and return YYYY-MM-DD. */
function addDays(dateKey: string, days: number): string {
  const d = new Date(dateKey + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Find a HealthMetricEntry whose date matches the given YYYY-MM-DD key. */
function getMetricForDate(
  metrics: HealthMetricEntry[],
  date: string,
): HealthMetricEntry | undefined {
  return metrics.find((m) => toDateKey(m.date) === date);
}

/**
 * Compute the rolling average of a numeric field over `days` days
 * immediately before `beforeDate` (exclusive).
 * Returns undefined when no data points are available.
 */
function computeBaseline(
  metrics: HealthMetricEntry[],
  beforeDate: string,
  field: keyof HealthMetricEntry,
  days: number = 7,
): number | undefined {
  const values: number[] = [];
  for (let i = 1; i <= days; i++) {
    const key = addDays(beforeDate, -i);
    const entry = getMetricForDate(metrics, key);
    if (entry) {
      const val = entry[field];
      if (typeof val === 'number') {
        values.push(val);
      }
    }
  }
  if (values.length === 0) return undefined;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// ── Public functions ─────────────────────────────────────────────────────

/**
 * Compute the training load for a single workout log.
 * Sum of (weight * reps) for all non-skipped sets, divided by 1000.
 */
export function computeTrainingLoad(log: WorkoutLog): number {
  let volume = 0;
  for (const exercise of log.exercises) {
    for (const set of exercise.sets) {
      if (set.skipped) continue;
      volume += (set.weight ?? 0) * (set.reps ?? 0);
    }
  }
  return volume / 1000;
}

/**
 * Compute a recovery score (0-100) from partial recovery data.
 *
 * Components:
 *   - HRV recovery  (weight 40): min(100, nextDayHRV / baselineHRV * 100)
 *   - Sleep quality  (weight 30): min(100, nextDaySleepHours / 8 * 100)
 *   - HR recovery    (weight 30): min(100, baselineRestingHR / nextDayRestingHR * 100)
 *
 * When a component's data is missing its weight is redistributed proportionally
 * among the remaining components. Returns 50 when no data is available at all.
 */
export function computeRecoveryScore(entry: Partial<RecoveryEntry>): number | null {
  const components: { value: number; weight: number }[] = [];

  // HRV recovery
  if (
    entry.nextDayHRV != null &&
    entry.baselineHRV != null &&
    entry.baselineHRV > 0
  ) {
    components.push({
      value: Math.min(100, (entry.nextDayHRV / entry.baselineHRV) * 100),
      weight: 40,
    });
  }

  // Sleep quality
  if (entry.nextDaySleepHours != null) {
    components.push({
      value: Math.min(100, (entry.nextDaySleepHours / 8) * 100),
      weight: 30,
    });
  }

  // HR recovery (lower resting HR is better)
  if (
    entry.nextDayRestingHR != null &&
    entry.baselineRestingHR != null &&
    entry.nextDayRestingHR > 0
  ) {
    components.push({
      value: Math.min(
        100,
        (entry.baselineRestingHR / entry.nextDayRestingHR) * 100,
      ),
      weight: 30,
    });
  }

  if (components.length === 0) return null; // no health data yet → pending

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const score = components.reduce(
    (s, c) => s + (c.value * c.weight) / totalWeight,
    0,
  );

  return Math.round(Math.min(100, Math.max(0, score)));
}

/** Map a numeric recovery score to a status label. */
function scoreToStatus(
  score: number | null,
): 'optimal' | 'adequate' | 'insufficient' | 'pending' {
  if (score === null) return 'pending';
  if (score >= 75) return 'optimal';
  if (score >= 50) return 'adequate';
  return 'insufficient';
}

/**
 * Link workout logs to health/recovery data.
 *
 * For each WorkoutLog the function:
 *  1. Computes training volume and load.
 *  2. Looks up health metrics from the day after the workout.
 *  3. Computes 7-day rolling baselines before the workout date.
 *  4. Derives a recovery score and status.
 */
export function computeRecoveryEntries(
  logs: WorkoutLog[],
  metrics: HealthMetricEntry[],
): RecoveryEntry[] {
  if (logs.length === 0) return [];

  // Sort logs by date ascending for consistent ordering
  const sorted = [...logs].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  return sorted.map((log) => {
    const workoutDate = toDateKey(log.date);
    const nextDay = addDays(workoutDate, 1);

    // Training metrics
    let volume = 0;
    for (const exercise of log.exercises) {
      for (const set of exercise.sets) {
        if (!set.skipped) {
          volume += (set.weight ?? 0) * (set.reps ?? 0);
        }
      }
    }
    const trainingLoad = computeTrainingLoad(log);

    // Next-day health data
    const nextDayMetric = getMetricForDate(metrics, nextDay);

    // Baselines (7 days before workout)
    const baselineHRV = computeBaseline(metrics, workoutDate, 'hrv', 7);
    const baselineRestingHR = computeBaseline(
      metrics,
      workoutDate,
      'restingHeartRate',
      7,
    );
    const baselineSleepHours = computeBaseline(
      metrics,
      workoutDate,
      'sleepHours',
      7,
    );

    const partial: Partial<RecoveryEntry> = {
      nextDayHRV: nextDayMetric?.hrv,
      nextDayRestingHR: nextDayMetric?.restingHeartRate,
      nextDaySleepHours: nextDayMetric?.sleepHours,
      baselineHRV,
      baselineRestingHR,
      baselineSleepHours,
    };

    const rawScore = computeRecoveryScore(partial);
    const isPending = rawScore === null;

    return {
      workoutDate,
      workoutTitle: log.sessionTitle,
      workoutVolume: volume,
      workoutDuration: log.durationMinutes,
      trainingLoad,
      nextDayHRV: nextDayMetric?.hrv,
      nextDayRestingHR: nextDayMetric?.restingHeartRate,
      nextDaySleepHours: nextDayMetric?.sleepHours,
      nextDayDeepSleepMin: nextDayMetric?.deepSleepMinutes,
      baselineHRV,
      baselineRestingHR,
      baselineSleepHours,
      recoveryScore: rawScore ?? 0,
      recoveryStatus: scoreToStatus(rawScore),
      pending: isPending,
    };
  });
}

/**
 * Compute aggregate statistics from an array of RecoveryEntry items.
 *
 * Trend detection compares the average recovery score of the first half of
 * entries to the second half. A difference of more than 5 points in either
 * direction signals 'improving' or 'declining'; otherwise 'stable'.
 */
export function computeRecoverySummary(
  entries: RecoveryEntry[],
): TrainingRecoverySummary {
  if (entries.length === 0) {
    return {
      entries: [],
      avgRecoveryScore: 0,
      avgTrainingLoad: 0,
      loadToRecoveryRatio: 0,
      trend: 'stable',
    };
  }

  // Only use entries with actual health data for averages/trend
  const scored = entries.filter((e) => !e.pending);

  const avgRecoveryScore = scored.length > 0
    ? scored.reduce((s, e) => s + e.recoveryScore, 0) / scored.length
    : 0;
  const avgTrainingLoad =
    entries.reduce((s, e) => s + e.trainingLoad, 0) / entries.length;
  const loadToRecoveryRatio =
    avgRecoveryScore > 0 ? avgTrainingLoad / avgRecoveryScore : 0;

  // Trend detection (only from scored entries)
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (scored.length >= 2) {
    const mid = Math.floor(scored.length / 2);
    const firstHalf = scored.slice(0, mid);
    const secondHalf = scored.slice(mid);

    const avgFirst =
      firstHalf.reduce((s, e) => s + e.recoveryScore, 0) / firstHalf.length;
    const avgSecond =
      secondHalf.reduce((s, e) => s + e.recoveryScore, 0) / secondHalf.length;

    if (avgSecond > avgFirst + 5) {
      trend = 'improving';
    } else if (avgSecond < avgFirst - 5) {
      trend = 'declining';
    }
  }

  return {
    entries,
    avgRecoveryScore: Math.round(avgRecoveryScore * 10) / 10,
    avgTrainingLoad: Math.round(avgTrainingLoad * 10) / 10,
    loadToRecoveryRatio: Math.round(loadToRecoveryRatio * 100) / 100,
    trend,
  };
}
