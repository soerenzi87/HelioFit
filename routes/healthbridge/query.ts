import { Router } from "express";
import type { Pool } from "pg";
import { resolveToken, type HbTokenRequest } from "./middleware.js";

export function createQueryRouter(pool: Pool): Router {
  const router = Router();

  // All ingest query endpoints resolve the user token
  router.use("/ingest/:token", resolveToken(pool));

  // Helper: cutoff date
  function cutoff(days: number): Date {
    return new Date(Date.now() - days * 86400000);
  }

  // Helper: clamp days param
  function parseDays(val: unknown, defaultVal: number): number {
    const n = parseInt(val as string, 10);
    if (isNaN(n) || n < 1) return defaultVal;
    return Math.min(n, 365);
  }

  // GET /hb/ingest/:token/latest
  router.get("/ingest/:token/latest", async (req: HbTokenRequest, res) => {
    const uid = req.hbUserId!;
    try {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);

      const [weight, hr, hrv, bp, spo2, resp, temp, sleep, scale, stepsSum, calSum, distSum] = await Promise.all([
        pool.query("SELECT weight_kg AS weight, bmi, body_fat_percent, source, timestamp FROM weight_records WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1", [uid]),
        pool.query("SELECT bpm, source, timestamp FROM heart_rate_records WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1", [uid]),
        pool.query("SELECT rmssd_ms AS rmssd, source, timestamp FROM hrv_records WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1", [uid]),
        pool.query("SELECT systolic, diastolic, source, timestamp FROM blood_pressure_records WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1", [uid]),
        pool.query("SELECT percentage, source, timestamp FROM oxygen_saturation_records WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1", [uid]),
        pool.query("SELECT breaths_per_minute, source, timestamp FROM respiratory_rate_records WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1", [uid]),
        pool.query("SELECT celsius, source, timestamp FROM body_temperature_records WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1", [uid]),
        pool.query(
          `SELECT s.*, json_agg(json_build_object('start_time', st.start_time, 'end_time', st.end_time, 'type', st.type)) FILTER (WHERE st.id IS NOT NULL) AS stages
           FROM sleep_sessions s LEFT JOIN sleep_stages st ON st.session_id = s.id
           WHERE s.user_id = $1
           GROUP BY s.id ORDER BY s.start_time DESC LIMIT 1`, [uid]
        ),
        pool.query("SELECT * FROM scale_measurements WHERE user_id = $1 ORDER BY measured_at DESC LIMIT 1", [uid]),
        pool.query("SELECT COALESCE(SUM(count), 0) AS total FROM steps_records WHERE user_id = $1 AND start_time >= $2", [uid, todayStart]),
        pool.query("SELECT COALESCE(SUM(kilocalories), 0) AS total FROM active_calories_records WHERE user_id = $1 AND start_time >= $2", [uid, todayStart]),
        pool.query("SELECT COALESCE(SUM(meters), 0) AS total FROM distance_records WHERE user_id = $1 AND start_time >= $2", [uid, todayStart]),
      ]);

      const scaleRow = scale.rows[0] || null;

      res.json({
        weight: weight.rows[0] || null,
        heart_rate: hr.rows[0] || null,
        hrv: hrv.rows[0] || null,
        blood_pressure: bp.rows[0] || null,
        spo2: spo2.rows[0] || null,
        sleep: sleep.rows[0] ? {
          start_time: sleep.rows[0].start_time,
          end_time: sleep.rows[0].end_time,
          duration_minutes: sleep.rows[0].duration_minutes,
          deep_sleep_minutes: sleep.rows[0].deep_sleep_minutes,
          rem_sleep_minutes: sleep.rows[0].rem_sleep_minutes,
          light_sleep_minutes: sleep.rows[0].light_sleep_minutes,
          source: sleep.rows[0].source,
          stages: sleep.rows[0].stages || [],
        } : null,
        respiratory_rate: resp.rows[0] || null,
        body_temperature: temp.rows[0] || null,
        scale: scaleRow ? formatScale(scaleRow) : null,
        today_steps: parseInt(stepsSum.rows[0].total, 10),
        today_calories: parseFloat(calSum.rows[0].total),
        today_distance: parseFloat(distSum.rows[0].total),
      });
    } catch (error) {
      console.error("Error fetching latest metrics:", error);
      res.status(500).json({ error: "Failed to fetch latest metrics" });
    }
  });

  // History endpoints - generic helper
  async function historyEndpoint(
    uid: string,
    res: any,
    metric: string,
    table: string,
    timeCol: string,
    columns: string,
    defaultDays: number,
    days: number,
  ) {
    try {
      const d = parseDays(days, defaultDays);
      const result = await pool.query(
        `SELECT ${columns} FROM ${table} WHERE user_id = $1 AND ${timeCol} >= $2 ORDER BY ${timeCol} DESC`,
        [uid, cutoff(d)]
      );
      res.json({ metric, count: result.rows.length, records: result.rows });
    } catch (error) {
      console.error(`Error fetching ${metric} history:`, error);
      res.status(500).json({ error: `Failed to fetch ${metric} history` });
    }
  }

  // GET /hb/ingest/:token/weight
  router.get("/ingest/:token/weight", (req: HbTokenRequest, res) => {
    historyEndpoint(req.hbUserId!, res, "weight", "weight_records", "timestamp",
      "weight_kg AS weight, bmi, body_fat_percent, source, timestamp", 30, req.query.days as any);
  });

  // GET /hb/ingest/:token/heart-rate
  router.get("/ingest/:token/heart-rate", (req: HbTokenRequest, res) => {
    historyEndpoint(req.hbUserId!, res, "heart_rate", "heart_rate_records", "timestamp",
      "bpm, source, timestamp", 7, req.query.days as any);
  });

  // GET /hb/ingest/:token/hrv
  router.get("/ingest/:token/hrv", (req: HbTokenRequest, res) => {
    historyEndpoint(req.hbUserId!, res, "hrv", "hrv_records", "timestamp",
      "rmssd_ms AS rmssd, source, timestamp", 7, req.query.days as any);
  });

  // GET /hb/ingest/:token/blood-pressure
  router.get("/ingest/:token/blood-pressure", (req: HbTokenRequest, res) => {
    historyEndpoint(req.hbUserId!, res, "blood_pressure", "blood_pressure_records", "timestamp",
      "systolic, diastolic, source, timestamp", 30, req.query.days as any);
  });

  // GET /hb/ingest/:token/spo2
  router.get("/ingest/:token/spo2", (req: HbTokenRequest, res) => {
    historyEndpoint(req.hbUserId!, res, "spo2", "oxygen_saturation_records", "timestamp",
      "percentage, source, timestamp", 7, req.query.days as any);
  });

  // GET /hb/ingest/:token/steps
  router.get("/ingest/:token/steps", (req: HbTokenRequest, res) => {
    historyEndpoint(req.hbUserId!, res, "steps", "steps_records", "start_time",
      "count, source, start_time, end_time", 30, req.query.days as any);
  });

  // GET /hb/ingest/:token/calories
  router.get("/ingest/:token/calories", (req: HbTokenRequest, res) => {
    historyEndpoint(req.hbUserId!, res, "calories", "active_calories_records", "start_time",
      "kilocalories, source, start_time, end_time", 30, req.query.days as any);
  });

  // GET /hb/ingest/:token/distance
  router.get("/ingest/:token/distance", (req: HbTokenRequest, res) => {
    historyEndpoint(req.hbUserId!, res, "distance", "distance_records", "start_time",
      "meters, source, start_time, end_time", 30, req.query.days as any);
  });

  // GET /hb/ingest/:token/sleep
  router.get("/ingest/:token/sleep", async (req: HbTokenRequest, res) => {
    const uid = req.hbUserId!;
    try {
      const d = parseDays(req.query.days, 14);
      const result = await pool.query(
        `SELECT s.*, json_agg(json_build_object('start_time', st.start_time, 'end_time', st.end_time, 'type', st.type)) FILTER (WHERE st.id IS NOT NULL) AS stages
         FROM sleep_sessions s LEFT JOIN sleep_stages st ON st.session_id = s.id
         WHERE s.user_id = $1 AND s.start_time >= $2
         GROUP BY s.id ORDER BY s.start_time DESC`,
        [uid, cutoff(d)]
      );
      const records = result.rows.map(r => ({
        start_time: r.start_time,
        end_time: r.end_time,
        duration_minutes: r.duration_minutes,
        deep_sleep_minutes: r.deep_sleep_minutes,
        rem_sleep_minutes: r.rem_sleep_minutes,
        light_sleep_minutes: r.light_sleep_minutes,
        source: r.source,
        stages: r.stages || [],
      }));
      res.json({ metric: "sleep", count: records.length, records });
    } catch (error) {
      console.error("Error fetching sleep history:", error);
      res.status(500).json({ error: "Failed to fetch sleep history" });
    }
  });

  // GET /hb/ingest/:token/respiratory-rate
  router.get("/ingest/:token/respiratory-rate", (req: HbTokenRequest, res) => {
    historyEndpoint(req.hbUserId!, res, "respiratory_rate", "respiratory_rate_records", "timestamp",
      "breaths_per_minute, source, timestamp", 7, req.query.days as any);
  });

  // GET /hb/ingest/:token/body-temperature
  router.get("/ingest/:token/body-temperature", (req: HbTokenRequest, res) => {
    historyEndpoint(req.hbUserId!, res, "body_temperature", "body_temperature_records", "timestamp",
      "celsius, source, timestamp", 7, req.query.days as any);
  });

  // GET /hb/ingest/:token/summary
  router.get("/ingest/:token/summary", async (req: HbTokenRequest, res) => {
    const uid = req.hbUserId!;
    try {
      const d = parseDays(req.query.days, 7);
      const c = cutoff(d);
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);

      const summary: Record<string, any> = { period_days: d, data_freshness: now.toISOString() };

      // Weight
      const w = await pool.query("SELECT weight_kg, bmi, body_fat_percent FROM weight_records WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1", [uid]);
      if (w.rows[0]) {
        summary.weight = { latest_kg: w.rows[0].weight_kg, bmi: w.rows[0].bmi, body_fat_percent: w.rows[0].body_fat_percent };
      }

      // Heart rate stats
      const hrStats = await pool.query(
        "SELECT AVG(bpm) AS avg, MIN(bpm) AS min, MAX(bpm) AS max FROM heart_rate_records WHERE user_id = $1 AND timestamp >= $2", [uid, c]
      );
      const hrLatest = await pool.query("SELECT bpm FROM heart_rate_records WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1", [uid]);
      if (hrLatest.rows[0]) {
        summary.heart_rate = {
          latest_bpm: hrLatest.rows[0].bpm,
          avg_bpm: hrStats.rows[0].avg ? Math.round(parseFloat(hrStats.rows[0].avg) * 10) / 10 : null,
          min_bpm: hrStats.rows[0].min,
          max_bpm: hrStats.rows[0].max,
          unit: "bpm",
        };
      }

      // HRV
      const hrvStats = await pool.query("SELECT AVG(rmssd_ms) AS avg FROM hrv_records WHERE user_id = $1 AND timestamp >= $2", [uid, c]);
      const hrvLatest = await pool.query("SELECT rmssd_ms FROM hrv_records WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1", [uid]);
      if (hrvLatest.rows[0]) {
        summary.hrv = {
          latest_ms: hrvLatest.rows[0].rmssd_ms,
          avg_ms: hrvStats.rows[0].avg ? Math.round(parseFloat(hrvStats.rows[0].avg) * 10) / 10 : 0,
          unit: "ms",
        };
      }

      // Blood pressure
      const bpLatest = await pool.query("SELECT systolic, diastolic FROM blood_pressure_records WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1", [uid]);
      if (bpLatest.rows[0]) {
        summary.blood_pressure = {
          latest_systolic: bpLatest.rows[0].systolic,
          latest_diastolic: bpLatest.rows[0].diastolic,
          unit: "mmHg",
        };
      }

      // SpO2
      const spo2Stats = await pool.query("SELECT AVG(percentage) AS avg FROM oxygen_saturation_records WHERE user_id = $1 AND timestamp >= $2", [uid, c]);
      const spo2Latest = await pool.query("SELECT percentage FROM oxygen_saturation_records WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1", [uid]);
      if (spo2Latest.rows[0]) {
        summary.spo2 = {
          latest_percent: spo2Latest.rows[0].percentage,
          avg_percent: spo2Stats.rows[0].avg ? Math.round(parseFloat(spo2Stats.rows[0].avg) * 10) / 10 : 0,
          unit: "%",
        };
      }

      // Today's activity
      const [steps, cal, dist, dailySteps] = await Promise.all([
        pool.query("SELECT COALESCE(SUM(count), 0) AS total FROM steps_records WHERE user_id = $1 AND start_time >= $2", [uid, todayStart]),
        pool.query("SELECT COALESCE(SUM(kilocalories), 0) AS total FROM active_calories_records WHERE user_id = $1 AND start_time >= $2", [uid, todayStart]),
        pool.query("SELECT COALESCE(SUM(meters), 0) AS total FROM distance_records WHERE user_id = $1 AND start_time >= $2", [uid, todayStart]),
        pool.query("SELECT AVG(count) AS avg FROM steps_records WHERE user_id = $1 AND start_time >= $2", [uid, c]),
      ]);
      summary.activity = {
        today_steps: parseInt(steps.rows[0].total, 10),
        today_calories_kcal: Math.round(parseFloat(cal.rows[0].total) * 10) / 10,
        today_distance_meters: Math.round(parseFloat(dist.rows[0].total) * 10) / 10,
        daily_avg_steps: dailySteps.rows[0].avg ? Math.round(parseFloat(dailySteps.rows[0].avg)) : 0,
      };

      // Sleep
      const sleepLatest = await pool.query("SELECT duration_minutes, deep_sleep_minutes, rem_sleep_minutes, light_sleep_minutes FROM sleep_sessions WHERE user_id = $1 ORDER BY start_time DESC LIMIT 1", [uid]);
      if (sleepLatest.rows[0]) {
        const sleepAvg = await pool.query("SELECT AVG(duration_minutes) AS avg FROM sleep_sessions WHERE user_id = $1 AND start_time >= $2", [uid, c]);
        summary.sleep = {
          last_duration_minutes: sleepLatest.rows[0].duration_minutes,
          last_deep_minutes: sleepLatest.rows[0].deep_sleep_minutes,
          last_rem_minutes: sleepLatest.rows[0].rem_sleep_minutes,
          last_light_minutes: sleepLatest.rows[0].light_sleep_minutes,
          avg_duration_minutes: sleepAvg.rows[0].avg ? Math.round(parseFloat(sleepAvg.rows[0].avg)) : 0,
        };
      }

      // Respiratory rate
      const respLatest = await pool.query("SELECT breaths_per_minute FROM respiratory_rate_records WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1", [uid]);
      if (respLatest.rows[0]) {
        summary.respiratory_rate = { latest_bpm: respLatest.rows[0].breaths_per_minute, unit: "breaths/min" };
      }

      // Body temperature
      const tempLatest = await pool.query("SELECT celsius FROM body_temperature_records WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1", [uid]);
      if (tempLatest.rows[0]) {
        summary.body_temperature = { latest_celsius: tempLatest.rows[0].celsius, unit: "celsius" };
      }

      // Scale / body composition
      const scaleLatest = await pool.query("SELECT * FROM scale_measurements WHERE user_id = $1 ORDER BY measured_at DESC LIMIT 1", [uid]);
      if (scaleLatest.rows[0]) {
        const s = scaleLatest.rows[0];
        summary.body_composition = {
          weight_kg: s.weight_kg, bmi: s.bmi, body_fat_pct: s.body_fat_pct,
          muscle_pct: s.muscle_pct, water_pct: s.water_pct, protein_pct: s.protein_pct,
          visceral_fat: s.visceral_fat, bone_mass_kg: s.bone_mass_kg,
          bmr_kcal: s.bmr_kcal, body_age: s.body_age, score: s.score,
          muscle_mass_kg: s.muscle_mass_kg, fat_mass_kg: s.fat_mass_kg,
          skeletal_muscle_mass_kg: s.skeletal_muscle_mass_kg,
          measured_at: s.measured_at, source: "xiaomi_scale",
        };
      }

      res.json(summary);
    } catch (error) {
      console.error("Error fetching summary:", error);
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  });

  return router;
}

function formatScale(r: any) {
  return {
    measured_at: r.measured_at,
    weight_kg: r.weight_kg,
    bmi: r.bmi,
    body_fat_pct: r.body_fat_pct,
    muscle_pct: r.muscle_pct,
    water_pct: r.water_pct,
    protein_pct: r.protein_pct,
    visceral_fat: r.visceral_fat,
    bone_mass_kg: r.bone_mass_kg,
    bmr_kcal: r.bmr_kcal,
    body_age: r.body_age,
    score: r.score,
    heart_rate_bpm: r.heart_rate_bpm,
    body_water_mass_kg: r.body_water_mass_kg,
    fat_mass_kg: r.fat_mass_kg,
    protein_mass_kg: r.protein_mass_kg,
    muscle_mass_kg: r.muscle_mass_kg,
    skeletal_muscle_mass_kg: r.skeletal_muscle_mass_kg,
    fat_free_body_weight_kg: r.fat_free_body_weight_kg,
    skeletal_muscle_index: r.skeletal_muscle_index,
    recommended_calorie_intake_kcal: r.recommended_calorie_intake_kcal,
    waist_hip_ratio: r.waist_hip_ratio,
    bone_mineral_pct: r.bone_mineral_pct,
    segmental_data: r.segmental_data,
    source: r.source,
  };
}
