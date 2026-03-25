import {
  HealthData,
  HealthDataSource,
  HealthMetricEntry,
  HealthMetricPreferenceKey,
  HealthReadings,
  HealthSourcePreferences,
} from '../types';

const METRIC_FIELDS: HealthMetricPreferenceKey[] = [
  'steps',
  'activeEnergy',
  'distance',
  'activityMinutes',
  'restingHeartRate',
  'hrv',
  'bloodPressureSys',
  'oxygenSaturation',
  'respiratoryRate',
  'bodyTemperature',
  'weight',
  'bodyFat',
  'sleepHours',
];

const READING_SOURCE_MAP: Partial<Record<keyof HealthReadings, HealthMetricPreferenceKey>> = {
  heartRate: 'restingHeartRate',
  hrv: 'hrv',
  spo2: 'oxygenSaturation',
  respiratoryRate: 'respiratoryRate',
  bodyTemperature: 'bodyTemperature',
  weight: 'weight',
  bloodPressure: 'bloodPressureSys',
  steps: 'steps',
  calories: 'activeEnergy',
  distance: 'distance',
};

const collectMetricCoverage = (data: HealthData): HealthMetricPreferenceKey[] => {
  const coverage = new Set<HealthMetricPreferenceKey>();

  data.metrics.forEach((metric) => {
    METRIC_FIELDS.forEach((key) => {
      if (metric[key] !== undefined && metric[key] !== null) {
        coverage.add(key);
      }
    });
  });

  if (data.readings) {
    (Object.keys(data.readings) as (keyof HealthReadings)[]).forEach((key) => {
      if ((data.readings?.[key] || []).length === 0) {
        return;
      }
      const mappedMetric = READING_SOURCE_MAP[key];
      if (mappedMetric) {
        coverage.add(mappedMetric);
      }
    });
  }

  return Array.from(coverage);
};

const shouldAcceptMetricValue = (
  existingValue: unknown,
  source: HealthDataSource,
  preferredSource?: HealthDataSource,
) => existingValue === undefined || existingValue === null || !preferredSource || preferredSource === source;

const mergeMetricEntry = (
  existing: HealthMetricEntry | undefined,
  incoming: HealthMetricEntry,
  source: HealthDataSource,
  preferences?: HealthSourcePreferences,
): HealthMetricEntry => {
  const merged: HealthMetricEntry = { ...(existing || { date: incoming.date }) };

  for (const key of METRIC_FIELDS) {
    const incomingValue = incoming[key];
    if (incomingValue === undefined || incomingValue === null) {
      continue;
    }
    if (shouldAcceptMetricValue(merged[key], source, preferences?.[key])) {
      merged[key] = incomingValue as never;
    }
  }

  // Sleep stage details — follow sleepHours source preference
  const sleepDetailFields = ['deepSleepMinutes', 'remSleepMinutes', 'lightSleepMinutes'] as const;
  for (const key of sleepDetailFields) {
    const val = incoming[key];
    if (val !== undefined && val !== null) {
      if (shouldAcceptMetricValue(merged[key], source, preferences?.sleepHours)) {
        (merged as any)[key] = val;
      }
    }
  }

  // Segmental body composition (object fields, not covered by METRIC_FIELDS)
  if (incoming.segmentalFatKg) merged.segmentalFatKg = incoming.segmentalFatKg;
  if (incoming.segmentalMuscleKg) merged.segmentalMuscleKg = incoming.segmentalMuscleKg;

  return merged;
};

const mergeReadings = (
  existing: HealthReadings | undefined,
  incoming: HealthReadings | undefined,
  source: HealthDataSource,
  preferences?: HealthSourcePreferences,
) => {
  if (!incoming) {
    return { readings: existing, chosenSources: {} as Partial<Record<keyof HealthReadings, HealthDataSource>> };
  }

  const merged: Partial<HealthReadings> = { ...(existing || {}) };
  const chosenSources: Partial<Record<keyof HealthReadings, HealthDataSource>> = {};
  (Object.keys(incoming) as (keyof HealthReadings)[]).forEach((key) => {
    const incomingValues = incoming[key];
    if (!incomingValues || incomingValues.length === 0) {
      return;
    }
    const preferredMetric = READING_SOURCE_MAP[key];
    const preferredSource = preferredMetric ? preferences?.[preferredMetric] : undefined;
    const existingValues = existing?.[key];
    if (!existingValues || existingValues.length === 0) {
      // No existing data — use incoming directly
      (merged as Record<string, unknown>)[key] = incomingValues;
      chosenSources[key] = source;
    } else if (!preferredSource || preferredSource === source) {
      // MERGE instead of replace: combine existing + incoming, deduplicate by timestamp
      const existingArr = existingValues as { time: string }[];
      const incomingArr = incomingValues as { time: string }[];
      const byTime = new Map<string, any>();
      existingArr.forEach(r => byTime.set(r.time, r));
      incomingArr.forEach(r => byTime.set(r.time, r)); // incoming wins on conflicts
      const combined = Array.from(byTime.values()).sort((a, b) => a.time.localeCompare(b.time));
      (merged as Record<string, unknown>)[key] = combined;
      chosenSources[key] = source;
    }
  });

  return { readings: merged as HealthReadings, chosenSources };
};

// Fields that are "spot measurements" — only keep when value actually changed from previous day.
// Cumulative fields (steps, calories, distance, sleep, activityMinutes, activeEnergy) are excluded
// because every day is a unique accumulation.
const SPOT_METRIC_FIELDS: (keyof HealthMetricEntry)[] = [
  'weight', 'bodyFat', 'bmi', 'leanBodyMass',
  'musclePct', 'muscleMassKg', 'waterPct', 'proteinPct',
  'boneMassKg', 'fatMassKg', 'visceralFat', 'bmr',
  'bodyAge', 'healthScore', 'waistHipRatio', 'skeletalMuscleIndex',
  'vo2Max',
];

/**
 * Removes repeated identical spot-metric values across consecutive days.
 * Only keeps a value on the day it first appeared or actually changed.
 * This prevents e.g. the same weight being stored for 10 days straight
 * when the scale was only used once.
 */
/**
 * Removes consecutive identical readings (same value, different timestamp).
 * Keeps only the first occurrence when the value changes.
 */
const deduplicateReadingsByValue = <T extends { time: string; value: number }>(arr: T[]): T[] => {
  if (arr.length <= 1) return arr;
  const sorted = [...arr].sort((a, b) => a.time.localeCompare(b.time));
  return sorted.filter((item, i) => i === 0 || item.value !== sorted[i - 1].value);
};

export const deduplicateSpotMetrics = (metrics: HealthMetricEntry[]): HealthMetricEntry[] => {
  if (metrics.length <= 1) return metrics;

  // Sort chronologically (should already be, but be safe)
  const sorted = [...metrics].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const lastSeen: Partial<Record<keyof HealthMetricEntry, number | undefined>> = {};

  const result: HealthMetricEntry[] = [];

  for (const entry of sorted) {
    const cleaned: HealthMetricEntry = { ...entry };
    let hasNonDateField = false;

    // For spot metrics: strip if value identical to last seen
    for (const field of SPOT_METRIC_FIELDS) {
      const value = cleaned[field] as number | undefined;
      if (value === undefined || value === null) continue;

      if (lastSeen[field] !== undefined && lastSeen[field] === value) {
        // Same value as before → remove from this day
        delete (cleaned as any)[field];
      } else {
        // New or changed value → keep and update tracker
        lastSeen[field] = value;
      }
    }

    // Check if the entry still has any meaningful data beyond 'date'
    for (const [key, val] of Object.entries(cleaned)) {
      if (key !== 'date' && val !== undefined && val !== null) {
        hasNonDateField = true;
        break;
      }
    }

    if (hasNonDateField) {
      result.push(cleaned);
    }
  }

  return result;
};

export const mergeHealthDataByPreference = (
  existing: HealthData | null,
  incoming: HealthData,
  source: HealthDataSource,
  preferences?: HealthSourcePreferences,
  appleFileName?: string,
): HealthData => {
  const byDate = new Map<string, HealthMetricEntry>();
  const metricSources: Record<string, Partial<Record<HealthMetricPreferenceKey, HealthDataSource>>> = {
    ...(existing?.sources?.metricSources || {}),
  };

  // ── Store raw per-source metrics for live switching ──
  const rawMetrics: Record<string, Partial<Record<HealthDataSource, Partial<HealthMetricEntry>>>> = {
    ...(existing?.rawMetrics || {}),
  };

  (existing?.metrics || []).forEach((metric) => {
    byDate.set(metric.date.split('T')[0], { ...metric });
  });

  incoming.metrics.forEach((metric) => {
    const dateKey = metric.date.split('T')[0];

    // Store raw incoming data per source
    if (!rawMetrics[dateKey]) rawMetrics[dateKey] = {};
    const existingRaw = rawMetrics[dateKey][source] || {};
    const rawEntry: Partial<HealthMetricEntry> = { ...existingRaw };
    METRIC_FIELDS.forEach((key) => {
      const val = metric[key];
      if (val !== undefined && val !== null) {
        (rawEntry as any)[key] = val;
      }
    });
    // Sleep stage details — store alongside sleepHours
    if (metric.deepSleepMinutes != null) rawEntry.deepSleepMinutes = metric.deepSleepMinutes;
    if (metric.remSleepMinutes != null) rawEntry.remSleepMinutes = metric.remSleepMinutes;
    if (metric.lightSleepMinutes != null) rawEntry.lightSleepMinutes = metric.lightSleepMinutes;
    if (metric.segmentalFatKg) rawEntry.segmentalFatKg = metric.segmentalFatKg;
    if (metric.segmentalMuscleKg) rawEntry.segmentalMuscleKg = metric.segmentalMuscleKg;
    rawMetrics[dateKey][source] = rawEntry;

    const existingEntry = byDate.get(dateKey);
    const mergedEntry = mergeMetricEntry(existingEntry, metric, source, preferences);
    const nextMetricSources = { ...(metricSources[dateKey] || {}) };
    METRIC_FIELDS.forEach((key) => {
      const incomingValue = metric[key];
      if (incomingValue === undefined || incomingValue === null) {
        return;
      }
      const existingValue = existingEntry?.[key];
      if (shouldAcceptMetricValue(existingValue, source, preferences?.[key])) {
        nextMetricSources[key] = source;
      }
    });
    metricSources[dateKey] = nextMetricSources;
    byDate.set(dateKey, mergedEntry);
  });

  const appleFiles = new Set(existing?.sources?.appleFiles || []);
  if (source === 'apple' && appleFileName) {
    appleFiles.add(appleFileName);
  }

  const mergedCoverage: Partial<Record<HealthDataSource, HealthMetricPreferenceKey[]>> = {
    ...(existing?.sources?.metricCoverage || {}),
  };
  const nextCoverage = collectMetricCoverage(incoming);
  mergedCoverage[source] = Array.from(
    new Set([...(mergedCoverage[source] || []), ...nextCoverage]),
  );

  // ── Store raw per-source readings for live switching ──
  const rawReadings: Partial<Record<HealthDataSource, HealthReadings>> = {
    ...(existing?.rawReadings || {}),
  };
  if (incoming.readings) {
    const existingSourceReadings = rawReadings[source] || {} as HealthReadings;
    const mergedSourceReadings = { ...existingSourceReadings };
    (Object.keys(incoming.readings) as (keyof HealthReadings)[]).forEach((key) => {
      const incomingArr = incoming.readings![key];
      if (incomingArr && incomingArr.length > 0) {
        const existingArr = (mergedSourceReadings as any)[key] || [];
        const byTime = new Map<string, any>();
        existingArr.forEach((r: any) => byTime.set(r.time, r));
        incomingArr.forEach((r: any) => byTime.set(r.time, r));
        (mergedSourceReadings as any)[key] = Array.from(byTime.values()).sort((a: any, b: any) => a.time.localeCompare(b.time));
      }
    });
    rawReadings[source] = mergedSourceReadings as HealthReadings;
  }

  const mergedReadings = mergeReadings(existing?.readings, incoming.readings, source, preferences);

  // Deduplicate spot-measurement readings (weight, bodyTemperature) by consecutive value
  if (mergedReadings.readings) {
    if (mergedReadings.readings.weight) {
      mergedReadings.readings.weight = deduplicateReadingsByValue(
        mergedReadings.readings.weight as (typeof mergedReadings.readings.weight[0] & { value: number })[]
      );
    }
    if (mergedReadings.readings.bodyTemperature) {
      mergedReadings.readings.bodyTemperature = deduplicateReadingsByValue(mergedReadings.readings.bodyTemperature);
    }
  }

  const readingSources = {
    ...(existing?.sources?.readingSources || {}),
    ...mergedReadings.chosenSources,
  };

  return {
    metrics: deduplicateSpotMetrics(
      Array.from(byDate.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    ),
    readings: mergedReadings.readings,
    rawMetrics,
    rawReadings,
    sources: {
      appleFiles: Array.from(appleFiles),
      googleSynced: source === 'google' ? true : (existing?.sources?.googleSynced || false),
      xiaomiScaleSynced: source === 'xiaomiScale' ? true : (existing?.sources?.xiaomiScaleSynced || false),
      healthSyncSynced: source === 'healthSync' ? true : (existing?.sources?.healthSyncSynced || false),
      lastSync: new Date().toISOString(),
      metricCoverage: mergedCoverage,
      metricSources,
      readingSources,
    },
  };
};

/**
 * Re-derive metrics and readings from raw per-source data using given preferences.
 * This allows live source switching without re-syncing.
 */
export const reapplySourcePreferences = (
  data: HealthData,
  preferences: HealthSourcePreferences,
): HealthData => {
  if (!data.rawMetrics) return data; // No raw data stored yet, return as-is

  const byDate = new Map<string, HealthMetricEntry>();
  const metricSources: Record<string, Partial<Record<HealthMetricPreferenceKey, HealthDataSource>>> = {};

  // Rebuild metrics from raw per-source data
  for (const [dateKey, sourcesMap] of Object.entries(data.rawMetrics)) {
    const merged: HealthMetricEntry = { date: dateKey };
    const dateSources: Partial<Record<HealthMetricPreferenceKey, HealthDataSource>> = {};

    for (const [src, rawEntry] of Object.entries(sourcesMap)) {
      const source = src as HealthDataSource;
      if (!rawEntry) continue;

      for (const key of METRIC_FIELDS) {
        const val = rawEntry[key];
        if (val === undefined || val === null) continue;

        const preferredSource = preferences[key];
        const existingVal = merged[key];

        // Accept if: no existing value, no preference set, or this IS the preferred source
        if (existingVal === undefined || existingVal === null || !preferredSource || preferredSource === source) {
          merged[key] = val as never;
          dateSources[key] = source;
        }
      }
      // Sleep stage details — follow sleepHours preference
      if (rawEntry.deepSleepMinutes != null || rawEntry.remSleepMinutes != null || rawEntry.lightSleepMinutes != null) {
        const sleepPref = preferences.sleepHours;
        if (!sleepPref || sleepPref === source || merged.deepSleepMinutes == null) {
          if (rawEntry.deepSleepMinutes != null) merged.deepSleepMinutes = rawEntry.deepSleepMinutes;
          if (rawEntry.remSleepMinutes != null) merged.remSleepMinutes = rawEntry.remSleepMinutes;
          if (rawEntry.lightSleepMinutes != null) merged.lightSleepMinutes = rawEntry.lightSleepMinutes;
        }
      }
      // Segmental data
      if (rawEntry.segmentalFatKg) merged.segmentalFatKg = rawEntry.segmentalFatKg;
      if (rawEntry.segmentalMuscleKg) merged.segmentalMuscleKg = rawEntry.segmentalMuscleKg;
    }

    byDate.set(dateKey, merged);
    metricSources[dateKey] = dateSources;
  }

  // Rebuild readings from raw per-source readings
  let mergedReadings: HealthReadings | undefined;
  const readingSources: Partial<Record<keyof HealthReadings, HealthDataSource>> = {};

  if (data.rawReadings) {
    mergedReadings = {} as HealthReadings;
    for (const [src, readings] of Object.entries(data.rawReadings)) {
      const source = src as HealthDataSource;
      if (!readings) continue;

      for (const key of Object.keys(readings) as (keyof HealthReadings)[]) {
        const arr = readings[key];
        if (!arr || arr.length === 0) continue;

        const preferredMetric = READING_SOURCE_MAP[key];
        const preferredSource = preferredMetric ? preferences[preferredMetric] : undefined;
        const existingArr = (mergedReadings as any)[key];

        if (!existingArr || existingArr.length === 0) {
          (mergedReadings as any)[key] = arr;
          readingSources[key] = source;
        } else if (!preferredSource || preferredSource === source) {
          const byTime = new Map<string, any>();
          existingArr.forEach((r: any) => byTime.set(r.time, r));
          (arr as any[]).forEach((r: any) => byTime.set(r.time, r));
          (mergedReadings as any)[key] = Array.from(byTime.values()).sort((a: any, b: any) => a.time.localeCompare(b.time));
          readingSources[key] = source;
        }
      }
    }
  }

  return {
    ...data,
    metrics: deduplicateSpotMetrics(
      Array.from(byDate.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    ),
    readings: mergedReadings || data.readings,
    sources: {
      ...data.sources!,
      metricSources,
      readingSources,
    },
  };
};

/**
 * Cleans up an existing HealthData object by removing duplicate spot metrics
 * and consecutive identical readings. Use this to sanitize already-persisted data.
 */
export const cleanupHealthData = (data: HealthData): HealthData => {
  if (!data?.metrics?.length) return data;

  const cleanedMetrics = deduplicateSpotMetrics(
    [...data.metrics].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  );

  const cleanedReadings = data.readings ? { ...data.readings } : undefined;
  if (cleanedReadings) {
    if (cleanedReadings.weight) {
      cleanedReadings.weight = deduplicateReadingsByValue(
        cleanedReadings.weight as (typeof cleanedReadings.weight[0] & { value: number })[]
      );
    }
    if (cleanedReadings.bodyTemperature) {
      cleanedReadings.bodyTemperature = deduplicateReadingsByValue(cleanedReadings.bodyTemperature);
    }
  }

  return { ...data, metrics: cleanedMetrics, readings: cleanedReadings };
};
