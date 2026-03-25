import { HealthData, HealthMetricEntry, HealthReadings, WeightEntry } from "../types";

// Seeded pseudo-random for deterministic data
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function generateMockHealthData(): HealthData {
  const rand = seededRandom(42);
  const today = new Date();
  const days = 30;
  const metrics: HealthMetricEntry[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = formatDate(d);
    const dayOfWeek = d.getDay(); // 0=Sun
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Steps: 5000-14000, weekends slightly lower
    const baseSteps = isWeekend ? 6000 : 8000;
    const steps = Math.round(baseSteps + rand() * 6000);

    // Active calories: correlated with steps
    const activeEnergy = Math.round(steps * 0.04 + rand() * 100);

    // Distance: ~0.7m per step
    const distance = Math.round(steps * 0.7);

    // Resting HR: 55-72 bpm
    const restingHeartRate = Math.round(58 + rand() * 14);
    const heartRateMin = restingHeartRate - Math.round(rand() * 5);
    const heartRateMax = Math.round(restingHeartRate + 40 + rand() * 30);

    // HRV: 25-65ms
    const hrv = Math.round(30 + rand() * 35);
    const hrvMin = Math.round(hrv - 10 - rand() * 5);
    const hrvMax = Math.round(hrv + 10 + rand() * 10);

    // SpO2: 95-99%
    const oxygenSaturation = Math.round(96 + rand() * 3);

    // Blood pressure
    const bloodPressureSys = Math.round(115 + rand() * 15);
    const bloodPressureDia = Math.round(72 + rand() * 10);

    // Respiratory rate: 12-18
    const respiratoryRate = Math.round(13 + rand() * 5);

    // Body temperature: 36.2-36.8
    const bodyTemperature = Math.round((36.3 + rand() * 0.5) * 10) / 10;

    // Weight: slight downward trend from 82 to ~80.5
    const weightTrend = 82 - (i > 0 ? ((days - 1 - i) / (days - 1)) * 1.5 : 1.5);
    const weight = Math.round((weightTrend + (rand() - 0.5) * 0.6) * 10) / 10;
    const bodyFat = Math.round((18.5 - ((days - 1 - i) / (days - 1)) * 0.8 + (rand() - 0.5) * 0.4) * 10) / 10;
    const bmi = Math.round((weight / (1.78 * 1.78)) * 10) / 10;
    const musclePct = Math.round((42 + ((days - 1 - i) / (days - 1)) * 0.5 + (rand() - 0.5) * 0.3) * 10) / 10;
    const waterPct = Math.round((55 + rand() * 3) * 10) / 10;
    const boneMassKg = Math.round((3.2 + rand() * 0.2) * 10) / 10;
    const visceralFat = Math.round(8 + rand() * 2);
    const bmr = Math.round(1750 + rand() * 100);

    // Sleep: 5.5-8.5h
    const sleepHours = Math.round((6.5 + rand() * 2) * 10) / 10;
    const totalSleepMin = Math.round(sleepHours * 60);
    const deepSleepMinutes = Math.round(totalSleepMin * (0.15 + rand() * 0.1));
    const remSleepMinutes = Math.round(totalSleepMin * (0.2 + rand() * 0.05));
    const lightSleepMinutes = totalSleepMin - deepSleepMinutes - remSleepMinutes;

    metrics.push({
      date,
      steps,
      activeEnergy,
      distance,
      restingHeartRate,
      heartRateMin,
      heartRateMax,
      heartRateCount: Math.round(800 + rand() * 400),
      hrv,
      hrvMin,
      hrvMax,
      hrvCount: Math.round(40 + rand() * 20),
      bloodPressureSys,
      bloodPressureDia,
      oxygenSaturation,
      spo2Min: oxygenSaturation - Math.round(rand() * 2),
      spo2Max: Math.min(oxygenSaturation + Math.round(rand() * 2), 100),
      spo2Count: Math.round(20 + rand() * 10),
      respiratoryRate,
      bodyTemperature,
      weight,
      bmi,
      bodyFat,
      musclePct,
      waterPct,
      boneMassKg,
      visceralFat,
      bmr,
      sleepHours,
      deepSleepMinutes,
      remSleepMinutes,
      lightSleepMinutes,
    });
  }

  // Generate granular readings for the last 7 days
  const readings = generateMockReadings(rand);

  return {
    metrics,
    readings,
    sources: {
      appleFiles: [],
      googleSynced: false,
      lastSync: "mock",
    },
  };
}

function generateMockReadings(rand: () => number): HealthReadings {
  const today = new Date();
  const heartRate: { time: string; value: number }[] = [];
  const hrv: { time: string; value: number }[] = [];
  const spo2: { time: string; value: number }[] = [];
  const respiratoryRate: { time: string; value: number }[] = [];
  const bodyTemperature: { time: string; value: number }[] = [];
  const weight: { time: string; value: number; bodyFat?: number; bmi?: number }[] = [];
  const bloodPressure: { time: string; systolic: number; diastolic: number }[] = [];
  const steps: { time: string; count: number }[] = [];
  const calories: { time: string; kilocalories: number }[] = [];
  const distance: { time: string; meters: number }[] = [];

  for (let day = 6; day >= 0; day--) {
    const d = new Date(today);
    d.setDate(d.getDate() - day);
    const dateStr = formatDate(d);

    // HR readings every 30 min during waking hours (7-23)
    for (let h = 7; h < 23; h++) {
      for (const m of [0, 30]) {
        const time = `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
        const isActive = (h >= 7 && h <= 8) || (h >= 17 && h <= 18);
        const base = isActive ? 110 + rand() * 40 : 60 + rand() * 20;
        heartRate.push({ time, value: Math.round(base) });
      }
    }

    // HRV: a few readings per day
    for (const h of [7, 12, 22]) {
      hrv.push({
        time: `${dateStr}T${String(h).padStart(2, "0")}:00:00`,
        value: Math.round(30 + rand() * 35),
      });
    }

    // SpO2: morning reading
    spo2.push({
      time: `${dateStr}T07:30:00`,
      value: Math.round(96 + rand() * 3),
    });

    // Weight: morning
    const w = 82 - ((6 - day) / 6) * 1.2 + (rand() - 0.5) * 0.4;
    weight.push({
      time: `${dateStr}T07:00:00`,
      value: Math.round(w * 10) / 10,
      bodyFat: Math.round((18.2 + rand() * 0.8) * 10) / 10,
      bmi: Math.round((w / (1.78 * 1.78)) * 10) / 10,
    });

    // Blood pressure: morning
    bloodPressure.push({
      time: `${dateStr}T07:15:00`,
      systolic: Math.round(115 + rand() * 15),
      diastolic: Math.round(72 + rand() * 10),
    });

    // Steps: hourly buckets
    for (let h = 7; h < 22; h++) {
      const time = `${dateStr}T${String(h).padStart(2, "0")}:00:00`;
      const isActive = (h >= 7 && h <= 8) || (h >= 12 && h <= 13) || (h >= 17 && h <= 18);
      const count = isActive ? Math.round(1500 + rand() * 1500) : Math.round(200 + rand() * 500);
      steps.push({ time, count });
    }

    // Calories: hourly
    for (let h = 7; h < 22; h++) {
      calories.push({
        time: `${dateStr}T${String(h).padStart(2, "0")}:00:00`,
        kilocalories: Math.round(50 + rand() * 150),
      });
    }

    // Distance: hourly
    for (let h = 7; h < 22; h++) {
      distance.push({
        time: `${dateStr}T${String(h).padStart(2, "0")}:00:00`,
        meters: Math.round(100 + rand() * 800),
      });
    }

    // Respiratory rate
    respiratoryRate.push({
      time: `${dateStr}T22:00:00`,
      value: Math.round(13 + rand() * 5),
    });

    // Body temperature
    bodyTemperature.push({
      time: `${dateStr}T07:00:00`,
      value: Math.round((36.3 + rand() * 0.5) * 10) / 10,
    });
  }

  return { heartRate, hrv, spo2, respiratoryRate, bodyTemperature, weight, bloodPressure, steps, calories, distance };
}

export function generateMockWeightHistory(): WeightEntry[] {
  const rand = seededRandom(99);
  const today = new Date();
  const entries: WeightEntry[] = [];

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const trend = 82 - ((29 - i) / 29) * 1.5;
    entries.push({
      date: formatDate(d),
      weight: Math.round((trend + (rand() - 0.5) * 0.6) * 10) / 10,
    });
  }

  return entries;
}
