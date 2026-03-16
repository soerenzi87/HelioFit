import { Router } from "express";
import type { Pool } from "pg";
import { resolveToken, type HbTokenRequest } from "./middleware.js";

const PUSH_SYNC_POLL_INTERVAL = 2000; // ms
const PUSH_SYNC_TIMEOUT = 60000; // ms

export function createScaleRouter(pool: Pool): Router {
  const router = Router();

  // All scale endpoints resolve the user token
  router.use("/ingest/:token/scale", resolveToken(pool));

  // POST /hb/ingest/:token/scale/webhook - Receive data from Xiaomi scale
  router.post("/ingest/:token/scale/webhook", async (req: HbTokenRequest, res) => {
    const uid = req.hbUserId!;
    try {
      const p = req.body;
      const measuredAt = new Date(p.measured_at * 1000);
      const details = p.details || {};

      let segmentalData: any = null;
      if (details.segmentalFatKg || details.segmentalMuscleKg) {
        segmentalData = {};
        if (details.segmentalFatKg) segmentalData.segmentalFatKg = details.segmentalFatKg;
        if (details.segmentalMuscleKg) segmentalData.segmentalMuscleKg = details.segmentalMuscleKg;
      }

      const result = await pool.query(
        `INSERT INTO scale_measurements (
          user_id, source, device_id, device_user_id, measured_at,
          weight_kg, bmi, body_fat_pct, muscle_pct, water_pct, protein_pct,
          visceral_fat, bone_mass_kg, bmr_kcal, body_age, score,
          heart_rate_bpm, body_water_mass_kg, fat_mass_kg, protein_mass_kg,
          muscle_mass_kg, skeletal_muscle_mass_kg, fat_free_body_weight_kg,
          skeletal_muscle_index, recommended_calorie_intake_kcal,
          waist_hip_ratio, bone_mineral_pct, segmental_data
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
        ON CONFLICT ON CONSTRAINT uq_scale_measurement DO NOTHING`,
        [
          uid,
          p.source || "android_accessibility",
          p.device_id ?? null,
          p.user_id ?? null,
          measuredAt,
          p.weight_kg,
          p.bmi ?? null,
          p.body_fat_pct ?? null,
          p.muscle_pct ?? null,
          p.water_pct ?? null,
          p.protein_pct ?? null,
          p.visceral_fat ?? null,
          p.bone_mass_kg ?? null,
          p.bmr_kcal ?? null,
          p.body_age ?? null,
          p.score ?? null,
          details.heartRateBpm ?? null,
          details.bodyWaterMassKg ?? null,
          details.fatMassKg ?? null,
          details.proteinMassKg ?? null,
          details.muscleMassKg ?? null,
          details.skeletalMuscleMassKg ?? null,
          details.fatFreeBodyWeightKg ?? null,
          details.skeletalMuscleIndex ?? null,
          details.recommendedCalorieIntakeKcal ?? null,
          details.waistHipRatio ?? null,
          details.boneMineralPct ?? null,
          segmentalData ? JSON.stringify(segmentalData) : null,
        ]
      );

      const inserted = (result.rowCount && result.rowCount > 0) ? 1 : 0;
      res.json({ status: "ok", inserted });
    } catch (error) {
      console.error("Scale webhook error:", error);
      res.status(500).json({ error: "Failed to store scale measurement" });
    }
  });

  // GET /hb/ingest/:token/scale/latest
  router.get("/ingest/:token/scale/latest", async (req: HbTokenRequest, res) => {
    const uid = req.hbUserId!;
    try {
      const result = await pool.query("SELECT * FROM scale_measurements WHERE user_id = $1 ORDER BY measured_at DESC LIMIT 1", [uid]);
      if (result.rows.length === 0) {
        res.json(null);
        return;
      }
      res.json(formatScale(result.rows[0]));
    } catch (error) {
      console.error("Error fetching latest scale:", error);
      res.status(500).json({ error: "Failed to fetch latest scale measurement" });
    }
  });

  // GET /hb/ingest/:token/scale/history?days=90
  router.get("/ingest/:token/scale/history", async (req: HbTokenRequest, res) => {
    const uid = req.hbUserId!;
    try {
      const days = Math.min(Math.max(parseInt(req.query.days as string, 10) || 90, 1), 365);
      const cutoff = new Date(Date.now() - days * 86400000);
      const result = await pool.query(
        "SELECT * FROM scale_measurements WHERE user_id = $1 AND measured_at >= $2 ORDER BY measured_at DESC",
        [uid, cutoff]
      );
      const records = result.rows.map(formatScale);
      res.json({ metric: "scale", count: records.length, records });
    } catch (error) {
      console.error("Error fetching scale history:", error);
      res.status(500).json({ error: "Failed to fetch scale history" });
    }
  });

  // ── FCM device registration ───────────────────────────────────────

  // POST /hb/ingest/:token/devices/register - Register / update FCM token
  router.post("/ingest/:token/devices/register", resolveToken(pool), async (req: HbTokenRequest, res) => {
    const uid = req.hbUserId!;
    try {
      const { fcm_token, device_label, app_type } = req.body as {
        fcm_token?: string; device_label?: string; app_type?: string;
      };
      if (!fcm_token || typeof fcm_token !== "string" || fcm_token.length < 10) {
        res.status(400).json({ detail: "fcm_token is required (string, min 10 chars)" });
        return;
      }

      const VALID_APP_TYPES = ["scale_bridge", "zepp_bridge"];
      const resolvedAppType = VALID_APP_TYPES.includes(app_type ?? "") ? app_type! : "scale_bridge";

      const result = await pool.query(
        `INSERT INTO hb_fcm_devices (user_id, fcm_token, device_label, app_type, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT ON CONSTRAINT uq_fcm_user_token
         DO UPDATE SET device_label = COALESCE(EXCLUDED.device_label, hb_fcm_devices.device_label),
                       app_type = EXCLUDED.app_type,
                       updated_at = NOW()
         RETURNING id, fcm_token, device_label, app_type, updated_at`,
        [uid, fcm_token, device_label ?? null, resolvedAppType]
      );

      res.json({ status: "ok", device: result.rows[0] });
    } catch (error) {
      console.error("FCM device register error:", error);
      res.status(500).json({ error: "Failed to register FCM device" });
    }
  });

  // GET /hb/ingest/:token/devices - List registered FCM devices for user
  router.get("/ingest/:token/devices", resolveToken(pool), async (req: HbTokenRequest, res) => {
    const uid = req.hbUserId!;
    try {
      const result = await pool.query(
        "SELECT id, fcm_token, device_label, app_type, updated_at FROM hb_fcm_devices WHERE user_id = $1 ORDER BY updated_at DESC",
        [uid]
      );
      res.json({ devices: result.rows });
    } catch (error) {
      console.error("FCM device list error:", error);
      res.status(500).json({ error: "Failed to list FCM devices" });
    }
  });

  // DELETE /hb/ingest/:token/devices/:deviceId - Remove a registered FCM device
  router.delete("/ingest/:token/devices/:deviceId", resolveToken(pool), async (req: HbTokenRequest, res) => {
    const uid = req.hbUserId!;
    const deviceId = req.params.deviceId;
    try {
      const result = await pool.query(
        "DELETE FROM hb_fcm_devices WHERE id = $1 AND user_id = $2",
        [deviceId, uid]
      );
      if (result.rowCount === 0) {
        res.status(404).json({ detail: "Device not found" });
        return;
      }
      res.json({ status: "ok" });
    } catch (error) {
      console.error("FCM device delete error:", error);
      res.status(500).json({ error: "Failed to delete FCM device" });
    }
  });

  // ── Push-sync acknowledge ────────────────────────────────────────

  // POST /hb/ingest/:token/push-sync-ack - Called by mobile app after push-sync upload
  router.post("/ingest/:token/push-sync-ack", resolveToken(pool), async (req: HbTokenRequest, res) => {
    const uid = req.hbUserId!;
    try {
      const { app_type, inserted, skipped } = req.body as {
        app_type?: string; inserted?: number; skipped?: number;
      };
      if (!app_type) {
        res.status(400).json({ detail: "app_type is required" });
        return;
      }
      await pool.query(
        "INSERT INTO hb_push_sync_acks (user_id, app_type, inserted, skipped) VALUES ($1, $2, $3, $4)",
        [uid, app_type, inserted ?? 0, skipped ?? 0]
      );
      res.json({ status: "ok" });
    } catch (error) {
      console.error("Push-sync ack error:", error);
      res.status(500).json({ error: "Failed to store push-sync ack" });
    }
  });

  // ── Push-sync ────────────────────────────────────────────────────

  // FCM config per app type
  const FCM_CONFIG: Record<string, { target_app: string; action: string }> = {
    scale_bridge: { target_app: "s800_bridge", action: "s800_bridge_sync_now" },
    zepp_bridge: { target_app: "zepp_bridge", action: "zepp_bridge_sync_now" },
  };

  // Generic push-sync handler used by both endpoints
  async function handlePushSync(req: HbTokenRequest, res: any, appType: string, mode?: string) {
    const uid = req.hbUserId!;
    try {
      const fcmCfg = FCM_CONFIG[appType];
      if (!fcmCfg) {
        res.status(400).json({ detail: `Unknown app_type: ${appType}` });
        return;
      }

      // Look up registered FCM tokens for this user + app type
      const devicesResult = await pool.query(
        "SELECT id, fcm_token, device_label FROM hb_fcm_devices WHERE user_id = $1 AND app_type = $2",
        [uid, appType]
      );

      if (devicesResult.rows.length === 0) {
        res.status(503).json({
          detail: `No ${appType} FCM devices registered. POST /hb/ingest/:token/devices/register first.`,
        });
        return;
      }

      const before = new Date();

      // Send FCM push to matching devices
      try {
        const admin = await import("firebase-admin");
        const messaging = admin.default.messaging();

        const fcmData = { ...fcmCfg, ...(mode ? { mode } : {}) };
        const sendResults = await Promise.allSettled(
          devicesResult.rows.map((device) =>
            messaging.send({
              data: fcmData,
              android: { priority: "high" },
              token: device.fcm_token,
            })
          )
        );

        // Remove devices whose tokens are no longer valid
        const staleDeviceIds: string[] = [];
        sendResults.forEach((result, idx) => {
          if (result.status === "rejected") {
            const errMsg = String(result.reason);
            if (
              errMsg.includes("messaging/registration-token-not-registered") ||
              errMsg.includes("messaging/invalid-registration-token")
            ) {
              staleDeviceIds.push(devicesResult.rows[idx].id);
            }
          }
        });

        if (staleDeviceIds.length > 0) {
          await pool.query("DELETE FROM hb_fcm_devices WHERE id = ANY($1)", [staleDeviceIds]);
          console.log(`Push-sync [${appType}]: removed ${staleDeviceIds.length} stale FCM device(s)`);
        }

        const succeeded = sendResults.filter((r) => r.status === "fulfilled").length;
        if (succeeded === 0) {
          res.status(502).json({ detail: "FCM send failed for all registered devices" });
          return;
        }
      } catch (e) {
        console.error("FCM send failed:", e);
        res.status(502).json({ detail: `FCM send failed: ${e}` });
        return;
      }

      // Poll DB for new data – table depends on app type
      const pollQueryScale =
        "SELECT * FROM scale_measurements WHERE user_id = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 1";
      const pollQueryAck =
        "SELECT inserted, skipped FROM hb_push_sync_acks WHERE user_id = $1 AND app_type = $2 AND created_at > $3 LIMIT 1";
      const pollQueryData = `SELECT COUNT(*) AS total FROM (
             SELECT 1 FROM weight_records WHERE user_id = $1 AND created_at > $2
             UNION ALL SELECT 1 FROM heart_rate_records WHERE user_id = $1 AND created_at > $2
             UNION ALL SELECT 1 FROM sleep_sessions WHERE user_id = $1 AND created_at > $2
             UNION ALL SELECT 1 FROM hrv_records WHERE user_id = $1 AND created_at > $2
             UNION ALL SELECT 1 FROM blood_pressure_records WHERE user_id = $1 AND created_at > $2
             UNION ALL SELECT 1 FROM oxygen_saturation_records WHERE user_id = $1 AND created_at > $2
           ) sub`;

      let elapsed = 0;
      while (elapsed < PUSH_SYNC_TIMEOUT) {
        await new Promise((r) => setTimeout(r, PUSH_SYNC_POLL_INTERVAL));
        elapsed += PUSH_SYNC_POLL_INTERVAL;

        if (appType === "scale_bridge") {
          const result = await pool.query(pollQueryScale, [uid, before]);
          if (result.rows.length > 0) {
            console.log(`Push-sync [${appType}]: fresh data after ${elapsed / 1000}s`);
            res.json({ status: "ok", waited_seconds: elapsed / 1000, data: formatScale(result.rows[0]) });
            return;
          }
        } else {
          // Check for ack signal first (works even if all records were duplicates)
          const ackResult = await pool.query(pollQueryAck, [uid, appType, before]);
          if (ackResult.rows.length > 0) {
            const ack = ackResult.rows[0];
            console.log(`Push-sync [${appType}]: ack received after ${elapsed / 1000}s (inserted=${ack.inserted}, skipped=${ack.skipped})`);
            res.json({ status: "ok", waited_seconds: elapsed / 1000, inserted: ack.inserted, skipped: ack.skipped });
            return;
          }
          // Fallback: also check data tables for new records
          const dataResult = await pool.query(pollQueryData, [uid, before]);
          const total = parseInt(dataResult.rows[0]?.total || "0", 10);
          if (total > 0) {
            console.log(`Push-sync [${appType}]: ${total} fresh records after ${elapsed / 1000}s`);
            res.json({ status: "ok", waited_seconds: elapsed / 1000, inserted: total });
            return;
          }
        }
      }

      // Timeout
      res.json({
        status: "timeout",
        message: `No fresh data within ${PUSH_SYNC_TIMEOUT / 1000}s`,
        waited_seconds: PUSH_SYNC_TIMEOUT / 1000,
      });
    } catch (error) {
      console.error(`Push-sync [${appType}] error:`, error);
      res.status(500).json({ error: "Push-sync failed" });
    }
  }

  // POST /hb/ingest/:token/push-sync - Generic push-sync (requires app_type in body)
  router.post("/ingest/:token/push-sync", resolveToken(pool), async (req: HbTokenRequest, res) => {
    const appType = (req.body.app_type as string) || "scale_bridge";
    const mode = (req.body.mode as string) || undefined;
    await handlePushSync(req, res, appType, mode);
  });

  // POST /hb/ingest/:token/scale/push-sync - Legacy alias (always scale_bridge)
  router.post("/ingest/:token/scale/push-sync", async (req: HbTokenRequest, res) => {
    await handlePushSync(req, res, "scale_bridge");
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
