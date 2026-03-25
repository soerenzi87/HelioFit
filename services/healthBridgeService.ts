import { HealthData, HealthMetricEntry, HealthBridgeConfig, HealthReadings, HealthDataSource } from "../types";

type HealthBridgeSyncResult = HealthData & {
  sourcePayloads?: Partial<Record<Extract<HealthDataSource, 'xiaomiScale' | 'healthSync'>, HealthData>>;
};

/**
 * Validates the sync token against the server, then returns it.
 * The apiKey field in HealthBridgeConfig stores the sync token.
 */
export async function loginHealthBridge(config: HealthBridgeConfig): Promise<string> {
  if (!config.apiKey || config.apiKey.length < 32) {
    throw new Error("Sync Token ist erforderlich (mindestens 32 Zeichen)");
  }
  // Validate by fetching the latest endpoint (lightweight)
  const resp = await fetch(`/hb/ingest/${config.apiKey}/latest`);
  if (!resp.ok) {
    throw new Error(`Ungültiger Sync Token (Server: ${resp.status})`);
  }
  return config.apiKey;
}

export async function fetchHealthBridgeData(config: HealthBridgeConfig, token: string, lastSync?: string): Promise<HealthBridgeSyncResult> {
  // Always fetch full history for scale data (small payload, prevents data loss)
  // Only apply delta for high-frequency data (heart rate, steps, etc.)
  let daysFull = 365; // for weight/scale data — always full to prevent data loss
  let daysIncremental = 90; // for HR, steps, sleep, etc.
  if (lastSync) {
    const lastSyncDate = new Date(lastSync);
    if (!isNaN(lastSyncDate.getTime())) {
      const diffMs = Date.now() - lastSyncDate.getTime();
      const diffDays = Math.ceil(diffMs / 86400000) + 1; // +1 day buffer
      daysIncremental = Math.max(diffDays, 2); // at least 2 days
    }
  }

  // Token is the sync token - used directly in the URL path
  const basePath = `/hb/ingest/${token}`;

  const d = daysIncremental;
  const endpoints = [
    // Weight, scale & sleep data: ALWAYS full history (small payload, prevents data loss)
    { key: 'weight', path: `${basePath}/weight`, params: { days: daysFull } },
    { key: 'scale_history', path: `${basePath}/scale/history`, params: { days: daysFull } },
    { key: 'sleep', path: `${basePath}/sleep`, params: { days: daysFull } },
    // High-frequency data: incremental (large payloads)
    { key: 'heart_rate', path: `${basePath}/heart-rate`, params: { days: d } },
    { key: 'hrv', path: `${basePath}/hrv`, params: { days: d } },
    { key: 'blood_pressure', path: `${basePath}/blood-pressure`, params: { days: d } },
    { key: 'spo2', path: `${basePath}/spo2`, params: { days: d } },
    { key: 'steps', path: `${basePath}/steps`, params: { days: d } },
    { key: 'calories', path: `${basePath}/calories`, params: { days: d } },
    { key: 'distance', path: `${basePath}/distance`, params: { days: d } },
    { key: 'respiratory_rate', path: `${basePath}/respiratory-rate`, params: { days: d } },
    { key: 'body_temperature', path: `${basePath}/body-temperature`, params: { days: d } },
    { key: 'latest', path: `${basePath}/latest`, params: {} },
  ];

  console.log(`Starting HealthBridge fetch for ${endpoints.length} endpoints...`);

  const results = await Promise.allSettled(
    endpoints.map(async (e) => {
      const queryParams = new URLSearchParams(
        Object.entries(e.params).map(([k, v]) => [k, String(v)])
      ).toString();
      const url = queryParams ? `${e.path}?${queryParams}` : e.path;

      const resp = await fetch(url);
      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`Failed to fetch ${e.key}: ${resp.status} ${errText}`);
        throw new Error(`Failed to fetch ${e.key}`);
      }
      const data = await resp.json();
      console.log(`Fetched ${e.key}: ${data.records?.length || 0} records`);
      return { key: e.key, data };
    })
  );

  // ── Daily metrics (one entry per day) ──
  const metricsMap: Record<string, HealthMetricEntry> = {};

  // ── Individual timestamped readings ──
  const readings: HealthReadings = {
    heartRate: [],
    hrv: [],
    spo2: [],
    respiratoryRate: [],
    bodyTemperature: [],
    weight: [],
    bloodPressure: [],
    steps: [],
    calories: [],
    distance: [],
  };

  // ── Per-day value collectors for computing min/max/avg ──
  const dayCollectors: Record<string, { hr: number[]; hrv: number[]; spo2: number[] }> = {};

  const getDayKey = (dateStr: any): string => {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    try {
      if (typeof dateStr === 'number') return new Date(dateStr * 1000).toISOString().split('T')[0];
      if (typeof dateStr === 'string') return dateStr.split('T')[0];
      return new Date(dateStr).toISOString().split('T')[0];
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  };

  const toISOTime = (dateStr: any): string => {
    if (!dateStr) return new Date().toISOString();
    try {
      if (typeof dateStr === 'number') return new Date(dateStr * 1000).toISOString();
      if (typeof dateStr === 'string') {
        if (dateStr.includes('T')) return dateStr;
        return dateStr + 'T00:00:00Z';
      }
      return new Date(dateStr).toISOString();
    } catch {
      return new Date().toISOString();
    }
  };

  const ensureEntry = (date: any): HealthMetricEntry => {
    const key = getDayKey(date);
    if (!metricsMap[key]) {
      metricsMap[key] = { date: key + 'T12:00:00Z' };
    }
    return metricsMap[key];
  };

  const ensureCollector = (date: any) => {
    const key = getDayKey(date);
    if (!dayCollectors[key]) {
      dayCollectors[key] = { hr: [], hrv: [], spo2: [] };
    }
    return dayCollectors[key];
  };

  const numStats = (arr: number[]) => {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10,
      count: arr.length,
    };
  };

  results.forEach((res) => {
    if (res.status !== 'fulfilled') return;
    const { key, data } = res.value;

    if (key === 'latest') {
      const latest = data;
      const now = new Date().toISOString();

      if (latest && typeof latest === 'object') {
        if (latest.weight) {
          const entry = ensureEntry(latest.weight.timestamp || now);
          entry.weight = latest.weight.weight;
          if (latest.weight.body_fat_percent) entry.bodyFat = latest.weight.body_fat_percent;
        }
        if (latest.heart_rate) {
          const entry = ensureEntry(latest.heart_rate.timestamp || now);
          entry.restingHeartRate = latest.heart_rate.bpm;
        }
        if (latest.hrv) {
          const entry = ensureEntry(latest.hrv.timestamp || now);
          entry.hrv = latest.hrv.rmssd;
        }
        if (latest.blood_pressure) {
          const entry = ensureEntry(latest.blood_pressure.timestamp || now);
          entry.bloodPressureSys = latest.blood_pressure.systolic;
          entry.bloodPressureDia = latest.blood_pressure.diastolic;
        }
        if (latest.spo2) {
          const entry = ensureEntry(latest.spo2.timestamp || now);
          entry.oxygenSaturation = latest.spo2.percentage;
        }
        if (latest.respiratory_rate) {
          const entry = ensureEntry(latest.respiratory_rate.timestamp || now);
          entry.respiratoryRate = latest.respiratory_rate.breaths_per_minute;
        }
        if (latest.body_temperature) {
          const entry = ensureEntry(latest.body_temperature.timestamp || now);
          entry.bodyTemperature = latest.body_temperature.celsius;
        }

        // Today's aggregates
        const todayEntry = ensureEntry(now);
        if (latest.today_steps) todayEntry.steps = Number(latest.today_steps);
        if (latest.today_calories) todayEntry.activeEnergy = Number(latest.today_calories);
      }

      return;
    }

    const records = data.records || (Array.isArray(data) ? data : []);
    records.forEach((rec: any) => {
      const timestamp = rec.timestamp || rec.start_time || rec.end_time || rec.measured_at;
      if (!timestamp) return;

      const entry = ensureEntry(timestamp);
      const time = toISOTime(timestamp);

      switch (key) {
        case 'weight':
          entry.weight = rec.weight;
          if (rec.body_fat_percent) entry.bodyFat = rec.body_fat_percent;
          readings.weight.push({ time, value: rec.weight, bodyFat: rec.body_fat_percent, bmi: rec.bmi });
          break;
        case 'heart_rate':
          entry.restingHeartRate = rec.bpm;
          readings.heartRate.push({ time, value: rec.bpm });
          ensureCollector(timestamp).hr.push(rec.bpm);
          break;
        case 'hrv':
          entry.hrv = rec.rmssd;
          readings.hrv.push({ time, value: rec.rmssd });
          ensureCollector(timestamp).hrv.push(rec.rmssd);
          break;
        case 'blood_pressure':
          entry.bloodPressureSys = rec.systolic;
          entry.bloodPressureDia = rec.diastolic;
          readings.bloodPressure.push({ time, systolic: rec.systolic, diastolic: rec.diastolic });
          break;
        case 'spo2':
          entry.oxygenSaturation = rec.percentage;
          readings.spo2.push({ time, value: rec.percentage });
          ensureCollector(timestamp).spo2.push(rec.percentage);
          break;
        case 'steps':
          entry.steps = (entry.steps || 0) + Number(rec.count);
          readings.steps.push({ time, count: Number(rec.count) });
          break;
        case 'calories':
          entry.activeEnergy = (entry.activeEnergy || 0) + Number(rec.kilocalories);
          readings.calories.push({ time, kilocalories: Number(rec.kilocalories) });
          break;
        case 'distance':
          entry.distance = (entry.distance || 0) + (Number(rec.meters) || 0);
          readings.distance.push({ time, meters: Number(rec.meters) || 0 });
          break;
        case 'sleep': {
          // Keep the longest session per day (avoid duplicates inflating totals)
          const dur = Number(rec.duration_minutes);
          const existingDur = (entry.sleepHours || 0) * 60;
          if (dur > existingDur) {
            entry.sleepHours = dur / 60;
            entry.deepSleepMinutes = Number(rec.deep_sleep_minutes) || 0;
            entry.remSleepMinutes = Number(rec.rem_sleep_minutes) || 0;
            entry.lightSleepMinutes = Number(rec.light_sleep_minutes) || 0;
          }
          break;
        }
        case 'respiratory_rate':
          entry.respiratoryRate = rec.breaths_per_minute;
          readings.respiratoryRate.push({ time, value: rec.breaths_per_minute });
          break;
        case 'body_temperature':
          entry.bodyTemperature = rec.celsius;
          readings.bodyTemperature.push({ time, value: rec.celsius });
          break;
        case 'scale_history': {
          // ScaleBridge body composition data from scale_measurements
          const ts = rec.measured_at || timestamp;
          const scaleEntry = ensureEntry(ts);
          if (rec.weight_kg) scaleEntry.weight = rec.weight_kg;
          if (rec.bmi) scaleEntry.bmi = rec.bmi;
          if (rec.body_fat_pct) scaleEntry.bodyFat = rec.body_fat_pct;
          if (rec.muscle_pct) scaleEntry.musclePct = rec.muscle_pct;
          if (rec.muscle_mass_kg) scaleEntry.muscleMassKg = rec.muscle_mass_kg;
          if (rec.water_pct) scaleEntry.waterPct = rec.water_pct;
          if (rec.protein_pct) scaleEntry.proteinPct = rec.protein_pct;
          if (rec.bone_mass_kg) scaleEntry.boneMassKg = rec.bone_mass_kg;
          if (rec.fat_mass_kg) scaleEntry.fatMassKg = rec.fat_mass_kg;
          if (rec.visceral_fat) scaleEntry.visceralFat = rec.visceral_fat;
          if (rec.bmr_kcal) scaleEntry.bmr = rec.bmr_kcal;
          if (rec.body_age) scaleEntry.bodyAge = rec.body_age;
          if (rec.score) scaleEntry.healthScore = rec.score;
          if (rec.waist_hip_ratio) scaleEntry.waistHipRatio = rec.waist_hip_ratio;
          if (rec.skeletal_muscle_index) scaleEntry.skeletalMuscleIndex = rec.skeletal_muscle_index;
          // Segmental body composition (per-limb data from Xiaomi Scale)
          if (rec.segmental_data) {
            const sd = rec.segmental_data;
            if (sd.segmentalFatKg) scaleEntry.segmentalFatKg = sd.segmentalFatKg;
            if (sd.segmentalMuscleKg) scaleEntry.segmentalMuscleKg = sd.segmentalMuscleKg;
          }
          // Calculate lean body mass if we have weight and fat
          if (rec.weight_kg && rec.body_fat_pct) {
            scaleEntry.leanBodyMass = +(rec.weight_kg * (1 - rec.body_fat_pct / 100)).toFixed(1);
          }
          // Also push to weight readings from scale
          if (rec.weight_kg) {
            readings.weight.push({
              time: toISOTime(ts),
              value: rec.weight_kg,
              bodyFat: rec.body_fat_pct,
              bmi: rec.bmi,
            });
          }
          break;
        }
      }
    });
  });

  // ── Apply daily min/max/avg stats ──
  Object.entries(dayCollectors).forEach(([dayKey, col]) => {
    const entry = metricsMap[dayKey];
    if (!entry) return;

    const hrStats = numStats(col.hr);
    if (hrStats) {
      entry.restingHeartRate = hrStats.avg;
      entry.heartRateMin = hrStats.min;
      entry.heartRateMax = hrStats.max;
      entry.heartRateCount = hrStats.count;
    }

    const hrvStats = numStats(col.hrv);
    if (hrvStats) {
      entry.hrv = hrvStats.avg;
      entry.hrvMin = hrvStats.min;
      entry.hrvMax = hrvStats.max;
      entry.hrvCount = hrvStats.count;
    }

    const spo2Stats = numStats(col.spo2);
    if (spo2Stats) {
      entry.oxygenSaturation = spo2Stats.avg;
      entry.spo2Min = spo2Stats.min;
      entry.spo2Max = spo2Stats.max;
      entry.spo2Count = spo2Stats.count;
    }
  });

  // ── Deduplicate & sort all readings by time ──
  const sortByTime = (a: { time: string }, b: { time: string }) => a.time.localeCompare(b.time);

  const dedupByTime = <T extends { time: string }>(arr: T[]): T[] => {
    const seen = new Set<string>();
    return arr.filter(r => {
      if (seen.has(r.time)) return false;
      seen.add(r.time);
      return true;
    });
  };

  readings.heartRate = dedupByTime(readings.heartRate);
  readings.hrv = dedupByTime(readings.hrv);
  readings.spo2 = dedupByTime(readings.spo2);
  readings.respiratoryRate = dedupByTime(readings.respiratoryRate);
  readings.bodyTemperature = dedupByTime(readings.bodyTemperature);
  readings.weight = dedupByTime(readings.weight);
  readings.bloodPressure = dedupByTime(readings.bloodPressure);
  readings.steps = dedupByTime(readings.steps);
  readings.calories = dedupByTime(readings.calories);
  readings.distance = dedupByTime(readings.distance);

  readings.heartRate.sort(sortByTime);
  readings.hrv.sort(sortByTime);
  readings.spo2.sort(sortByTime);
  readings.respiratoryRate.sort(sortByTime);
  readings.bodyTemperature.sort(sortByTime);
  readings.weight.sort(sortByTime);
  readings.bloodPressure.sort(sortByTime);
  readings.steps.sort(sortByTime);
  readings.calories.sort(sortByTime);
  readings.distance.sort(sortByTime);

  const metrics = Object.values(metricsMap).sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const xiaomiScaleMetrics = metrics
    .map((entry) => ({
      date: entry.date,
      weight: entry.weight,
      bmi: entry.bmi,
      bodyFat: entry.bodyFat,
      leanBodyMass: entry.leanBodyMass,
      musclePct: entry.musclePct,
      muscleMassKg: entry.muscleMassKg,
      waterPct: entry.waterPct,
      proteinPct: entry.proteinPct,
      boneMassKg: entry.boneMassKg,
      fatMassKg: entry.fatMassKg,
      visceralFat: entry.visceralFat,
      bmr: entry.bmr,
      bodyAge: entry.bodyAge,
      healthScore: entry.healthScore,
      waistHipRatio: entry.waistHipRatio,
      skeletalMuscleIndex: entry.skeletalMuscleIndex,
      segmentalFatKg: entry.segmentalFatKg,
      segmentalMuscleKg: entry.segmentalMuscleKg,
    }))
    .filter((entry) => Object.entries(entry).some(([key, value]) => key !== 'date' && value !== undefined && value !== null));

  const healthSyncMetrics = metrics
    .map((entry) => ({
      date: entry.date,
      steps: entry.steps,
      activeEnergy: entry.activeEnergy,
      activityMinutes: entry.activityMinutes,
      distance: entry.distance,
      restingHeartRate: entry.restingHeartRate,
      heartRateMin: entry.heartRateMin,
      heartRateMax: entry.heartRateMax,
      heartRateCount: entry.heartRateCount,
      hrv: entry.hrv,
      hrvMin: entry.hrvMin,
      hrvMax: entry.hrvMax,
      hrvCount: entry.hrvCount,
      bloodPressureSys: entry.bloodPressureSys,
      bloodPressureDia: entry.bloodPressureDia,
      oxygenSaturation: entry.oxygenSaturation,
      spo2Min: entry.spo2Min,
      spo2Max: entry.spo2Max,
      spo2Count: entry.spo2Count,
      respiratoryRate: entry.respiratoryRate,
      bodyTemperature: entry.bodyTemperature,
      sleepHours: entry.sleepHours,
      deepSleepMinutes: entry.deepSleepMinutes,
      remSleepMinutes: entry.remSleepMinutes,
      lightSleepMinutes: entry.lightSleepMinutes,
    }))
    .filter((entry) => Object.entries(entry).some(([key, value]) => key !== 'date' && value !== undefined && value !== null));

  console.log(`HealthBridge data: ${metrics.length} daily entries, readings: HR=${readings.heartRate.length} HRV=${readings.hrv.length} SpO2=${readings.spo2.length} Steps=${readings.steps.length} Weight=${readings.weight.length}`);

  return {
    metrics,
    readings,
    sourcePayloads: {
      xiaomiScale: {
        metrics: xiaomiScaleMetrics,
        readings: {
          heartRate: [],
          hrv: [],
          spo2: [],
          respiratoryRate: [],
          bodyTemperature: [],
          weight: readings.weight,
          bloodPressure: [],
          steps: [],
          calories: [],
          distance: [],
        },
      },
      healthSync: {
        metrics: healthSyncMetrics,
        readings: {
          heartRate: readings.heartRate,
          hrv: readings.hrv,
          spo2: readings.spo2,
          respiratoryRate: readings.respiratoryRate,
          bodyTemperature: readings.bodyTemperature,
          weight: [],
          bloodPressure: readings.bloodPressure,
          steps: readings.steps,
          calories: readings.calories,
          distance: readings.distance,
        },
      },
    },
  };
}
