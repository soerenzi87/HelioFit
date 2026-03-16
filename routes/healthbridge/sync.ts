import { Router } from "express";
import type { Pool } from "pg";
import { resolveToken, type HbTokenRequest } from "./middleware.js";

export function createSyncRouter(pool: Pool): Router {
  const router = Router();

  // POST /hb/ingest/:token/health-connect - Bulk upload from Health Connect app
  router.post("/ingest/:token/health-connect", resolveToken(pool), async (req: HbTokenRequest, res) => {
    const uid = req.hbUserId!;
    const body = req.body;
    let inserted = 0;
    let skipped = 0;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Weight records
      for (const r of body.weight_records || []) {
        const result = await client.query(
          `INSERT INTO weight_records (user_id, weight_kg, bmi, body_fat_percent, source, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT ON CONSTRAINT uq_weight DO NOTHING`,
          [uid, r.weight, r.bmi ?? null, r.body_fat_percent ?? null, r.source || "HEALTH_CONNECT", r.timestamp]
        );
        result.rowCount ? inserted++ : skipped++;
      }

      // Heart rate records
      for (const r of body.heart_rate_records || []) {
        const result = await client.query(
          `INSERT INTO heart_rate_records (user_id, bpm, source, timestamp)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT ON CONSTRAINT uq_heart_rate DO NOTHING`,
          [uid, r.bpm, r.source || "HEALTH_CONNECT", r.timestamp]
        );
        result.rowCount ? inserted++ : skipped++;
      }

      // HRV records
      for (const r of body.hrv_records || []) {
        const result = await client.query(
          `INSERT INTO hrv_records (user_id, rmssd_ms, source, timestamp)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT ON CONSTRAINT uq_hrv DO NOTHING`,
          [uid, r.rmssd, r.source || "HEALTH_CONNECT", r.timestamp]
        );
        result.rowCount ? inserted++ : skipped++;
      }

      // Blood pressure records
      for (const r of body.blood_pressure_records || []) {
        const result = await client.query(
          `INSERT INTO blood_pressure_records (user_id, systolic, diastolic, source, timestamp)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT ON CONSTRAINT uq_blood_pressure DO NOTHING`,
          [uid, r.systolic, r.diastolic, r.source || "HEALTH_CONNECT", r.timestamp]
        );
        result.rowCount ? inserted++ : skipped++;
      }

      // Oxygen saturation records
      for (const r of body.oxygen_saturation_records || []) {
        const result = await client.query(
          `INSERT INTO oxygen_saturation_records (user_id, percentage, source, timestamp)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT ON CONSTRAINT uq_spo2 DO NOTHING`,
          [uid, r.percentage, r.source || "HEALTH_CONNECT", r.timestamp]
        );
        result.rowCount ? inserted++ : skipped++;
      }

      // Steps records
      for (const r of body.steps_records || []) {
        const result = await client.query(
          `INSERT INTO steps_records (user_id, count, source, start_time, end_time)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT ON CONSTRAINT uq_steps DO NOTHING`,
          [uid, r.count, r.source || "HEALTH_CONNECT", r.start_time, r.end_time]
        );
        result.rowCount ? inserted++ : skipped++;
      }

      // Active calories records
      for (const r of body.active_calories_records || []) {
        const result = await client.query(
          `INSERT INTO active_calories_records (user_id, kilocalories, source, start_time, end_time)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT ON CONSTRAINT uq_calories DO NOTHING`,
          [uid, r.kilocalories, r.source || "HEALTH_CONNECT", r.start_time, r.end_time]
        );
        result.rowCount ? inserted++ : skipped++;
      }

      // Distance records
      for (const r of body.distance_records || []) {
        const result = await client.query(
          `INSERT INTO distance_records (user_id, meters, source, start_time, end_time)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT ON CONSTRAINT uq_distance DO NOTHING`,
          [uid, r.meters, r.source || "HEALTH_CONNECT", r.start_time, r.end_time]
        );
        result.rowCount ? inserted++ : skipped++;
      }

      // Sleep sessions (with stages)
      for (const r of body.sleep_sessions || []) {
        const result = await client.query(
          `INSERT INTO sleep_sessions (user_id, start_time, end_time, duration_minutes, deep_sleep_minutes, rem_sleep_minutes, light_sleep_minutes, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT ON CONSTRAINT uq_sleep DO NOTHING
           RETURNING id`,
          [uid, r.start_time, r.end_time, r.duration_minutes || 0, r.deep_sleep_minutes || 0, r.rem_sleep_minutes || 0, r.light_sleep_minutes || 0, r.source || "HEALTH_CONNECT"]
        );
        if (result.rows.length > 0) {
          inserted++;
          const sessionId = result.rows[0].id;
          for (const stage of r.stages || []) {
            await client.query(
              `INSERT INTO sleep_stages (session_id, start_time, end_time, type) VALUES ($1, $2, $3, $4)`,
              [sessionId, stage.start_time, stage.end_time, stage.type]
            );
          }
        } else {
          skipped++;
        }
      }

      // Respiratory rate records
      for (const r of body.respiratory_rate_records || []) {
        const result = await client.query(
          `INSERT INTO respiratory_rate_records (user_id, breaths_per_minute, source, timestamp)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT ON CONSTRAINT uq_respiratory DO NOTHING`,
          [uid, r.breaths_per_minute, r.source || "HEALTH_CONNECT", r.timestamp]
        );
        result.rowCount ? inserted++ : skipped++;
      }

      // Body temperature records
      for (const r of body.body_temperature_records || []) {
        const result = await client.query(
          `INSERT INTO body_temperature_records (user_id, celsius, source, timestamp)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT ON CONSTRAINT uq_body_temp DO NOTHING`,
          [uid, r.celsius, r.source || "HEALTH_CONNECT", r.timestamp]
        );
        result.rowCount ? inserted++ : skipped++;
      }

      await client.query("COMMIT");
      res.json({ inserted, skipped });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Sync upload error:", error);
      res.status(500).json({ error: "Failed to sync data" });
    } finally {
      client.release();
    }
  });

  return router;
}
