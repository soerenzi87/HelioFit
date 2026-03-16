import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { Pool } from "pg";
import { createTokensRouter } from "./routes/healthbridge/tokens.js";
import { createSyncRouter } from "./routes/healthbridge/sync.js";
import { createQueryRouter } from "./routes/healthbridge/query.js";
import { createScaleRouter } from "./routes/healthbridge/scale.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DB Configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://heliofit:heliofit_pw@localhost:5432/heliofit_db",
});

async function initDb() {
  let client;
  try {
    client = await pool.connect();
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      CREATE TABLE IF NOT EXISTS user_data (
        id SERIAL PRIMARY KEY,
        data JSONB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS health_metrics (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        metric_type VARCHAR(50) NOT NULL,
        value NUMERIC NOT NULL,
        unit VARCHAR(20)
      );

      CREATE INDEX IF NOT EXISTS idx_health_metrics_time ON health_metrics (timestamp);

      -- HealthBridge tables --

      CREATE TABLE IF NOT EXISTS hb_sync_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token VARCHAR(64) UNIQUE NOT NULL,
        user_label VARCHAR(100) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ix_hb_sync_tokens_token ON hb_sync_tokens (token);

      CREATE TABLE IF NOT EXISTS weight_records (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES hb_sync_tokens(id),
        weight_kg DOUBLE PRECISION NOT NULL,
        bmi DOUBLE PRECISION,
        body_fat_percent DOUBLE PRECISION,
        source VARCHAR(20) NOT NULL DEFAULT 'HEALTH_CONNECT',
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_weight UNIQUE (user_id, timestamp, source)
      );
      CREATE INDEX IF NOT EXISTS ix_weight_user_ts ON weight_records (user_id, timestamp);

      CREATE TABLE IF NOT EXISTS heart_rate_records (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES hb_sync_tokens(id),
        bpm INTEGER NOT NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'HEALTH_CONNECT',
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_heart_rate UNIQUE (user_id, timestamp, source)
      );
      CREATE INDEX IF NOT EXISTS ix_heart_rate_user_ts ON heart_rate_records (user_id, timestamp);

      CREATE TABLE IF NOT EXISTS hrv_records (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES hb_sync_tokens(id),
        rmssd_ms DOUBLE PRECISION NOT NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'HEALTH_CONNECT',
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_hrv UNIQUE (user_id, timestamp, source)
      );
      CREATE INDEX IF NOT EXISTS ix_hrv_user_ts ON hrv_records (user_id, timestamp);

      CREATE TABLE IF NOT EXISTS blood_pressure_records (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES hb_sync_tokens(id),
        systolic DOUBLE PRECISION NOT NULL,
        diastolic DOUBLE PRECISION NOT NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'HEALTH_CONNECT',
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_blood_pressure UNIQUE (user_id, timestamp, source)
      );
      CREATE INDEX IF NOT EXISTS ix_blood_pressure_user_ts ON blood_pressure_records (user_id, timestamp);

      CREATE TABLE IF NOT EXISTS oxygen_saturation_records (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES hb_sync_tokens(id),
        percentage DOUBLE PRECISION NOT NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'HEALTH_CONNECT',
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_spo2 UNIQUE (user_id, timestamp, source)
      );
      CREATE INDEX IF NOT EXISTS ix_spo2_user_ts ON oxygen_saturation_records (user_id, timestamp);

      CREATE TABLE IF NOT EXISTS steps_records (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES hb_sync_tokens(id),
        count BIGINT NOT NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'HEALTH_CONNECT',
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_steps UNIQUE (user_id, start_time, end_time, source)
      );
      CREATE INDEX IF NOT EXISTS ix_steps_user_ts ON steps_records (user_id, start_time);

      CREATE TABLE IF NOT EXISTS active_calories_records (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES hb_sync_tokens(id),
        kilocalories DOUBLE PRECISION NOT NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'HEALTH_CONNECT',
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_calories UNIQUE (user_id, start_time, end_time, source)
      );
      CREATE INDEX IF NOT EXISTS ix_calories_user_ts ON active_calories_records (user_id, start_time);

      CREATE TABLE IF NOT EXISTS distance_records (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES hb_sync_tokens(id),
        meters DOUBLE PRECISION NOT NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'HEALTH_CONNECT',
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_distance UNIQUE (user_id, start_time, end_time, source)
      );
      CREATE INDEX IF NOT EXISTS ix_distance_user_ts ON distance_records (user_id, start_time);

      CREATE TABLE IF NOT EXISTS sleep_sessions (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES hb_sync_tokens(id),
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 0,
        deep_sleep_minutes INTEGER NOT NULL DEFAULT 0,
        rem_sleep_minutes INTEGER NOT NULL DEFAULT 0,
        light_sleep_minutes INTEGER NOT NULL DEFAULT 0,
        source VARCHAR(20) NOT NULL DEFAULT 'HEALTH_CONNECT',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_sleep UNIQUE (user_id, start_time, end_time, source)
      );
      CREATE INDEX IF NOT EXISTS ix_sleep_user_ts ON sleep_sessions (user_id, start_time);

      CREATE TABLE IF NOT EXISTS sleep_stages (
        id BIGSERIAL PRIMARY KEY,
        session_id BIGINT NOT NULL REFERENCES sleep_sessions(id) ON DELETE CASCADE,
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE NOT NULL,
        type VARCHAR(10) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS respiratory_rate_records (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES hb_sync_tokens(id),
        breaths_per_minute DOUBLE PRECISION NOT NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'HEALTH_CONNECT',
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_respiratory UNIQUE (user_id, timestamp, source)
      );
      CREATE INDEX IF NOT EXISTS ix_respiratory_user_ts ON respiratory_rate_records (user_id, timestamp);

      CREATE TABLE IF NOT EXISTS body_temperature_records (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES hb_sync_tokens(id),
        celsius DOUBLE PRECISION NOT NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'HEALTH_CONNECT',
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_body_temp UNIQUE (user_id, timestamp, source)
      );
      CREATE INDEX IF NOT EXISTS ix_body_temp_user_ts ON body_temperature_records (user_id, timestamp);

      CREATE TABLE IF NOT EXISTS scale_measurements (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID REFERENCES hb_sync_tokens(id),
        source VARCHAR(50) NOT NULL,
        device_id VARCHAR(100),
        device_user_id VARCHAR(100),
        measured_at TIMESTAMP WITH TIME ZONE NOT NULL,
        weight_kg DOUBLE PRECISION NOT NULL,
        bmi DOUBLE PRECISION,
        body_fat_pct DOUBLE PRECISION,
        muscle_pct DOUBLE PRECISION,
        water_pct DOUBLE PRECISION,
        protein_pct DOUBLE PRECISION,
        visceral_fat DOUBLE PRECISION,
        bone_mass_kg DOUBLE PRECISION,
        bmr_kcal DOUBLE PRECISION,
        body_age DOUBLE PRECISION,
        score DOUBLE PRECISION,
        heart_rate_bpm INTEGER,
        body_water_mass_kg DOUBLE PRECISION,
        fat_mass_kg DOUBLE PRECISION,
        protein_mass_kg DOUBLE PRECISION,
        muscle_mass_kg DOUBLE PRECISION,
        skeletal_muscle_mass_kg DOUBLE PRECISION,
        fat_free_body_weight_kg DOUBLE PRECISION,
        skeletal_muscle_index DOUBLE PRECISION,
        recommended_calorie_intake_kcal DOUBLE PRECISION,
        waist_hip_ratio DOUBLE PRECISION,
        bone_mineral_pct DOUBLE PRECISION,
        segmental_data JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_scale_measurement UNIQUE (device_id, measured_at)
      );
      CREATE INDEX IF NOT EXISTS ix_scale_measured_at ON scale_measurements (measured_at);

      CREATE TABLE IF NOT EXISTS hb_fcm_devices (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES hb_sync_tokens(id) ON DELETE CASCADE,
        fcm_token TEXT NOT NULL,
        device_label VARCHAR(100),
        app_type VARCHAR(50) NOT NULL DEFAULT 'scale_bridge',
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_fcm_user_token UNIQUE (user_id, fcm_token)
      );
      CREATE INDEX IF NOT EXISTS ix_fcm_devices_user ON hb_fcm_devices (user_id);

      -- Migration: add app_type to existing installations
      ALTER TABLE hb_fcm_devices ADD COLUMN IF NOT EXISTS app_type VARCHAR(50) NOT NULL DEFAULT 'scale_bridge';

      CREATE TABLE IF NOT EXISTS hb_push_sync_acks (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES hb_sync_tokens(id) ON DELETE CASCADE,
        app_type VARCHAR(50) NOT NULL,
        inserted INT NOT NULL DEFAULT 0,
        skipped INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ix_push_sync_acks_lookup
        ON hb_push_sync_acks (user_id, app_type, created_at);
    `);
    console.log("Database schema initialized.");
  } catch (error) {
    console.error("Error initializing database schema:", error);
  } finally {
    if (client) client.release();
  }
}

// Withings API Config
const WITHINGS_CLIENT_ID = process.env.WITHINGS_CLIENT_ID;
const WITHINGS_CLIENT_SECRET = process.env.WITHINGS_CLIENT_SECRET;
const WITHINGS_AUTH_URL = "https://account.withings.com/oauth2_user/authorize2";
const WITHINGS_TOKEN_URL = "https://wbsapi.withings.net/v2/oauth2";

async function startServer() {
  await initDb();
  
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8000;

  app.use(express.json({ limit: '50mb' }));

  // HealthBridge API routes
  app.use("/hb", createTokensRouter(pool));
  app.use("/hb", createSyncRouter(pool));
  app.use("/hb", createQueryRouter(pool));
  app.use("/hb", createScaleRouter(pool));

  // Initialize Firebase Admin SDK for FCM push-sync (optional)
  if (process.env.FIREBASE_SA_PATH && fs.existsSync(process.env.FIREBASE_SA_PATH)) {
    try {
      const admin = await import("firebase-admin");
      const { readFileSync } = await import("fs");
      const serviceAccount = JSON.parse(readFileSync(process.env.FIREBASE_SA_PATH, "utf-8"));
      admin.default.initializeApp({ credential: admin.default.credential.cert(serviceAccount) });
      console.log("Firebase Admin SDK initialized for push-sync");
    } catch (e) {
      console.warn("Firebase init failed (FCM push-sync disabled):", e);
    }
  }

  // Health check for HealthBridge
  app.get("/hb/health", (_req, res) => res.json({ status: "ok" }));

  // API Routes
  app.get("/api/db", async (req, res) => {
    try {
      const result = await pool.query("SELECT data FROM user_data ORDER BY id DESC LIMIT 1");
      if (result.rows.length > 0) {
        res.json(result.rows[0].data);
      } else {
        res.json({});
      }
    } catch (error) {
      console.error("Error reading DB:", error);
      res.status(500).json({ error: "Failed to read database" });
    }
  });

  app.post("/api/db", async (req, res) => {
    try {
      // Store the whole document temporarily for backwards compatibility until UI changes
      // In production, split this into different endpoints and health_metrics table inserts
      await pool.query("INSERT INTO user_data (data) VALUES ($1)", [req.body]);
      res.json({ status: "ok" });
    } catch (error) {
      console.error("Error writing DB:", error);
      res.status(500).json({ error: "Failed to save database" });
    }
  });

  // Withings OAuth Routes
  app.get("/api/auth/withings/url", (req, res) => {
    const { clientId, clientSecret } = req.query;
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    // Ensure https for redirectUri in production/preview
    const redirectUri = `${appUrl.replace('http://', 'https://')}/api/auth/withings/callback`;
    
    // Encode clientId and clientSecret into state to retrieve them in callback
    const state = Buffer.from(JSON.stringify({ clientId, clientSecret })).toString('base64');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: (clientId as string) || WITHINGS_CLIENT_ID || '',
      state: state,
      scope: 'user.info,user.metrics,user.activity',
      redirect_uri: redirectUri,
    });
    res.json({ url: `${WITHINGS_AUTH_URL}?${params.toString()}` });
  });

  app.get("/api/auth/withings/callback", async (req, res) => {
    const { code, state } = req.query;
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${appUrl.replace('http://', 'https://')}/api/auth/withings/callback`;

    if (!code) {
      return res.status(400).send("No code provided");
    }

    let clientId = WITHINGS_CLIENT_ID;
    let clientSecret = WITHINGS_CLIENT_SECRET;

    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state as string, 'base64').toString('utf-8'));
        if (decoded.clientId) clientId = decoded.clientId;
        if (decoded.clientSecret) clientSecret = decoded.clientSecret;
      } catch (e) {
        console.error("Failed to decode state:", e);
      }
    }

    try {
      const response = await axios.post(WITHINGS_TOKEN_URL, new URLSearchParams({
        action: 'requesttoken',
        grant_type: 'authorization_code',
        client_id: clientId || '',
        client_secret: clientSecret || '',
        code: code as string,
        redirect_uri: redirectUri,
      }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const tokens = response.data.body;

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'WITHINGS_AUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Withings Token Exchange Error:", error.response?.data || error.message);
      res.status(500).send("Failed to exchange token with Withings");
    }
  });

  // Withings Data Proxy
  app.post("/api/withings/fetch", async (req, res) => {
    const { action, accessToken, params } = req.body;
    try {
      const response = await axios.post("https://wbsapi.withings.net/v2/measure", new URLSearchParams({
        action,
        access_token: accessToken,
        ...params
      }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      res.json(response.data);
    } catch (error: any) {
      console.error("Withings API Error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to fetch data from Withings" });
    }
  });

  // Withings Token Refresh
  app.post("/api/auth/withings/refresh", async (req, res) => {
    const { refreshToken, clientId, clientSecret } = req.body;
    try {
      const response = await axios.post(WITHINGS_TOKEN_URL, new URLSearchParams({
        action: 'requesttoken',
        grant_type: 'refresh_token',
        client_id: clientId || WITHINGS_CLIENT_ID || '',
        client_secret: clientSecret || WITHINGS_CLIENT_SECRET || '',
        refresh_token: refreshToken,
      }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      res.json(response.data.body);
    } catch (error: any) {
      console.error("Withings Refresh Error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to refresh Withings token" });
    }
  });

  // HealthBridge API Routes
  app.post("/api/healthbridge/login", async (req, res) => {
    const { baseUrl, username, password } = req.body;
    try {
      const response = await axios.post(`${baseUrl}/auth/login`, { username, password });
      res.json(response.data);
    } catch (error: any) {
      console.error("HealthBridge Login Error:", error.response?.data || error.message);
      res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to login to HealthBridge" });
    }
  });

  app.post("/api/healthbridge/fetch", async (req, res) => {
    const { baseUrl, token, endpoint, params } = req.body;
    try {
      // Normalize baseUrl: remove trailing slash and avoid double /api/v1
      let normalizedBase = baseUrl.replace(/\/$/, "");
      let targetEndpoint = endpoint;
      
      if (normalizedBase.endsWith("/api/v1") && endpoint.startsWith("/api/v1")) {
        targetEndpoint = endpoint.replace("/api/v1", "");
      }

      const fullUrl = `${normalizedBase}${targetEndpoint}`;
      console.log(`HealthBridge Proxy: GET ${fullUrl} with params:`, params);

      const response = await axios.get(fullUrl, {
        headers: { 'x-api-key': token },
        params
      });
      res.json(response.data);
    } catch (error: any) {
      console.error(`HealthBridge Fetch Error (${endpoint}):`, error.response?.data || error.message);
      res.status(error.response?.status || 500).json(error.response?.data || { error: `Failed to fetch from ${endpoint}` });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    const distPath = path.join(__dirname, "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.use((req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
