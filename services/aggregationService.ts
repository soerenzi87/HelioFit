import {
  HealthData,
  HealthMetricEntry,
  WorkoutLog,
  UserProfile,
  AIContextSize,
  AI_CONTEXT_PRESETS,
  AggregatedHealthSummary,
  AggregatedWorkoutSummary,
  AggregatedProfileSummary,
  ExerciseProgressEntry,
} from '../types';

function avg(values: (number | undefined | null)[]): number {
  const valid = values.filter((v): v is number => v != null && !isNaN(v));
  if (valid.length === 0) return 0;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

function lastValid(values: (number | undefined | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] != null && !isNaN(values[i]!)) return values[i]!;
  }
  return null;
}

function firstValid(values: (number | undefined | null)[]): number | null {
  for (const v of values) {
    if (v != null && !isNaN(v)) return v;
  }
  return null;
}

export function getContextPreset(profile?: UserProfile): typeof AI_CONTEXT_PRESETS['medium'] {
  const size: AIContextSize = profile?.aiConfig?.contextSize || 'medium';
  return AI_CONTEXT_PRESETS[size];
}

export function aggregateHealthMetrics(
  healthData: HealthData | null,
  days: number
): AggregatedHealthSummary {
  const empty: AggregatedHealthSummary = {
    avgSteps: 0, avgSleep: 0, avgRestingHR: 0, avgHRV: 0,
    weightStart: null, weightCurrent: null, weightDelta: null,
    avgBodyFat: null, avgBloodGlucose: null, avgBodyTemp: null,
    avgSpo2: null, avgBloodPressureSys: null, avgBloodPressureDia: null,
    periodDays: 0,
  };

  if (!healthData?.metrics?.length) return empty;

  const metrics = healthData.metrics.slice(-days);

  const weights = metrics.map(m => m.weight);
  const wStart = firstValid(weights);
  const wCurrent = lastValid(weights);

  return {
    avgSteps: avg(metrics.map(m => m.steps)),
    avgSleep: avg(metrics.map(m => m.sleepHours)),
    avgRestingHR: avg(metrics.map(m => m.restingHeartRate)),
    avgHRV: avg(metrics.map(m => m.hrv)),
    weightStart: wStart,
    weightCurrent: wCurrent,
    weightDelta: wStart != null && wCurrent != null ? Math.round((wCurrent - wStart) * 10) / 10 : null,
    avgBodyFat: avg(metrics.map(m => m.bodyFat)) || null,
    avgBloodGlucose: avg(metrics.map(m => m.bloodGlucose)) || null,
    avgBodyTemp: avg(metrics.map(m => m.bodyTemperature)) || null,
    avgSpo2: avg(metrics.map(m => m.oxygenSaturation)) || null,
    avgBloodPressureSys: avg(metrics.map(m => m.bloodPressureSys)) || null,
    avgBloodPressureDia: avg(metrics.map(m => m.bloodPressureDia)) || null,
    periodDays: metrics.length,
  };
}

export function aggregateWorkoutLogs(
  logs: WorkoutLog[],
  weeks: number,
  topN: number
): AggregatedWorkoutSummary {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);

  const recentLogs = logs.filter(l => new Date(l.date) >= cutoff);

  const exerciseMap = new Map<string, { bestWeight: number; lastWeight: number; lastReps: number[]; count: number; prevBest: number }>();

  for (const log of recentLogs) {
    for (const ex of log.exercises) {
      const maxWeight = Math.max(...ex.sets.filter(s => !s.skipped).map(s => s.weight || 0), 0);
      const reps = ex.sets.filter(s => !s.skipped).map(s => s.reps || 0);
      const prev = exerciseMap.get(ex.exerciseName);

      exerciseMap.set(ex.exerciseName, {
        bestWeight: Math.max(prev?.bestWeight || 0, maxWeight),
        lastWeight: maxWeight,
        lastReps: reps,
        count: (prev?.count || 0) + 1,
        prevBest: prev?.bestWeight || 0,
      });
    }
  }

  // Calculate total volume per session
  let totalVolume = 0;
  for (const log of recentLogs) {
    let sessionVolume = 0;
    for (const ex of log.exercises) {
      for (const s of ex.sets) {
        if (!s.skipped) sessionVolume += (s.weight || 0) * (s.reps || 0);
      }
    }
    totalVolume += sessionVolume;
  }

  const topExercises: ExerciseProgressEntry[] = Array.from(exerciseMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, topN)
    .map(([name, data]) => ({
      name,
      bestWeight: data.bestWeight,
      lastWeight: data.lastWeight,
      lastReps: data.lastReps.join(','),
      sessionCount: data.count,
      trend: data.lastWeight > data.prevBest ? '↑' : data.lastWeight === data.prevBest ? '→' : '↓',
    }));

  return {
    totalSessions: recentLogs.length,
    periodWeeks: weeks,
    avgVolumePerSession: recentLogs.length > 0 ? Math.round(totalVolume / recentLogs.length) : 0,
    consistencyPct: 0, // Caller can set this if they know planned sessions
    topExercises,
  };
}

export function aggregateProfile(profile: UserProfile): AggregatedProfileSummary {
  return {
    name: profile.name,
    age: profile.age,
    weight: profile.weight,
    height: profile.height,
    gender: profile.gender,
    bodyFat: profile.bodyFat,
    goals: profile.goals,
    activityLevel: profile.activityLevel,
  };
}

// ── Correlation Analysis ──────────────────────────────────────────────

/** Compute Pearson correlation coefficient between two number arrays */
export function pearsonR(xs: number[], ys: number[]): number {
  // Only use indices where both values exist
  const paired: { x: number; y: number }[] = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    if (xs[i] != null && ys[i] != null && !isNaN(xs[i]) && !isNaN(ys[i])) {
      paired.push({ x: xs[i], y: ys[i] });
    }
  }
  // Return 0 if fewer than 5 paired values
  if (paired.length < 5) return 0;

  const n = paired.length;
  const sumX = paired.reduce((s, p) => s + p.x, 0);
  const sumY = paired.reduce((s, p) => s + p.y, 0);
  const sumXY = paired.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = paired.reduce((s, p) => s + p.x * p.x, 0);
  const sumY2 = paired.reduce((s, p) => s + p.y * p.y, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return 0;
  // Standard Pearson formula
  return Math.round((numerator / denominator) * 1000) / 1000;
}

interface CorrelationPair {
  nameA: string;
  nameB: string;
  fieldA: keyof HealthMetricEntry;
  fieldB: keyof HealthMetricEntry;
  // If fieldB needs lag (e.g. nextDayHRV after steps), specify offset
  lagDays?: number;
}

const CORRELATION_PAIRS: CorrelationPair[] = [
  { nameA: 'Schlaf', nameB: 'HRV', fieldA: 'sleepHours', fieldB: 'hrv' },
  { nameA: 'Schritte', nameB: 'Deep Sleep', fieldA: 'steps', fieldB: 'deepSleepMinutes', lagDays: 0 },
  { nameA: 'Schlaf', nameB: 'Ruhepuls', fieldA: 'sleepHours', fieldB: 'restingHeartRate' },
  { nameA: 'Schritte', nameB: 'Aktive Energie', fieldA: 'steps', fieldB: 'activeEnergy' },
  { nameA: 'HRV', nameB: 'Ruhepuls', fieldA: 'hrv', fieldB: 'restingHeartRate' },
  { nameA: 'Schlaf', nameB: 'SpO2', fieldA: 'sleepHours', fieldB: 'oxygenSaturation' },
  { nameA: 'Deep Sleep', nameB: 'HRV', fieldA: 'deepSleepMinutes', fieldB: 'hrv' },
  { nameA: 'Schritte', nameB: 'Schlaf', fieldA: 'steps', fieldB: 'sleepHours', lagDays: 0 },
];

export interface CorrelationDataPoint {
  date: string;
  [key: string]: number | string | undefined;
}

/** Build a dataset of aligned daily values for correlation analysis.
 *  Returns the paired data + pre-computed Pearson r for each pair.
 */
export function buildCorrelationDataset(
  healthData: HealthData,
  days: number
): { pairs: { nameA: string; nameB: string; r: number; n: number }[]; dailyData: CorrelationDataPoint[] } {
  const metrics = healthData.metrics?.slice(-days) || [];

  // Build daily data points
  const dailyData: CorrelationDataPoint[] = metrics.map(m => ({
    date: m.date,
    sleepHours: m.sleepHours,
    hrv: m.hrv,
    steps: m.steps,
    deepSleepMinutes: m.deepSleepMinutes,
    restingHeartRate: m.restingHeartRate,
    activeEnergy: m.activeEnergy,
    oxygenSaturation: m.oxygenSaturation,
  }));

  // For each pair in CORRELATION_PAIRS:
  const pairs = CORRELATION_PAIRS.map(pair => {
    const lag = pair.lagDays ?? 0;

    // 1. Extract values from last N metrics where BOTH fields are non-null
    const xs: number[] = [];
    const ys: number[] = [];

    for (let i = 0; i < metrics.length; i++) {
      // 2. Apply lagDays offset if specified (shift fieldB by lagDays)
      const jIdx = i + lag;
      if (jIdx < 0 || jIdx >= metrics.length) continue;

      const valA = metrics[i][pair.fieldA];
      const valB = metrics[jIdx][pair.fieldB];

      if (typeof valA === 'number' && typeof valB === 'number' && !isNaN(valA) && !isNaN(valB)) {
        xs.push(valA);
        ys.push(valB);
      }
    }

    // 3. Compute pearsonR
    const r = pearsonR(xs, ys);

    return { nameA: pair.nameA, nameB: pair.nameB, r, n: xs.length };
  });

  // 4. Return sorted by abs(r) descending
  pairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  return { pairs, dailyData };
}
