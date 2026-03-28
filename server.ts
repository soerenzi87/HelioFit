import webpush from "web-push";
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
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

// Push notification setup
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:heliofit@antigravity.dev', VAPID_PUBLIC, VAPID_PRIVATE);
}

const pushSubscriptions = new Map<string, any>(); // email → PushSubscription

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
        CONSTRAINT uq_fcm_user_token_apptype UNIQUE (user_id, fcm_token, app_type)
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

    // Migrate plaintext passwords to bcrypt hashes
    const dbResult = await client.query("SELECT id, data FROM user_data ORDER BY id DESC LIMIT 1");
    if (dbResult.rows.length > 0) {
      const { id: rowId, data: rawData } = dbResult.rows[0];
      const db = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      let changed = false;
      for (const [key, userData] of Object.entries(db) as [string, any][]) {
        if (userData?.profile?.password && !userData.profile.password.startsWith('$2')) {
          userData.profile.password = bcrypt.hashSync(userData.profile.password, 12);
          changed = true;
          console.log(`[Migration] Hashed password for ${key}`);
        }
      }
      // Seed admin if missing
      const adminEmail = 'admin@heliofit.ai';
      if (!db[adminEmail]) {
        db[adminEmail] = {
          profile: {
            name: 'Admin', email: adminEmail,
            password: bcrypt.hashSync('admin123', 12),
            isApproved: true, isAdmin: true,
            age: 30, weight: 75, height: 180, gender: 'male',
            goals: [], activityLevel: 'MODERATE',
          },
          logs: [], health: null,
        };
        changed = true;
        console.log("[Migration] Seeded admin user with hashed password");
      }
      if (changed) {
        await client.query("UPDATE user_data SET data = $1 WHERE id = $2", [JSON.stringify(db), rowId]);
      }
    }
  } catch (error) {
    console.error("Error initializing database schema:", error);
  } finally {
    if (client) client.release();
  }
}

/** Helper: read full DB JSONB blob */
async function readDb(): Promise<{ id: number; db: Record<string, any> } | null> {
  const result = await pool.query("SELECT id, data FROM user_data ORDER BY id DESC LIMIT 1");
  if (result.rows.length === 0) return null;
  const { id, data } = result.rows[0];
  return { id, db: typeof data === 'string' ? JSON.parse(data) : data };
}

/** Helper: write full DB JSONB blob */
async function writeDb(id: number, db: Record<string, any>) {
  await pool.query("UPDATE user_data SET data = $1 WHERE id = $2", [JSON.stringify(db), id]);
}

/** SSRF protection: only allow known HealthBridge hosts */
const HEALTHBRIDGE_ALLOWED_HOSTS = new Set(
  (process.env.HEALTHBRIDGE_ALLOWED_HOSTS || 'health.soerenzieger.de').split(',').map(h => h.trim())
);
function isAllowedHealthBridgeUrl(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:') return false;
    return HEALTHBRIDGE_ALLOWED_HOSTS.has(parsed.hostname);
  } catch { return false; }
}

async function startServer() {
  await initDb();

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8000;

  // Trust proxy (Cloudflare/nginx) for rate limiting and secure cookies
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '50mb' }));

  // ── Session middleware ────────────────────────────────────────
  const SESSION_SECRET = process.env.SESSION_SECRET || process.env.API_SECRET;
  if (!SESSION_SECRET) {
    console.error("FATAL: SESSION_SECRET (or API_SECRET fallback) not configured");
    process.exit(1);
  }
  const PgSession = connectPgSimple(session);
  app.use(session({
    store: new PgSession({ pool, createTableIfMissing: true }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }));

  // ── Rate limiting ────────────────────────────────────────────
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again later.' },
  });
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 min
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', apiLimiter);

  // ── HealthBridge API routes (own auth via sync tokens) ───────
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

  // ── Auth endpoints (public) ──────────────────────────────────

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    const { email, password, isGoogle } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    try {
      const row = await readDb();
      if (!row) return res.status(500).json({ error: "No database" });
      let userData = row.db[email];

      if (isGoogle && !userData?.profile) {
        // Google login for first-time user — auto-create pending profile
        row.db[email] = {
          profile: {
            name: email, email,
            isApproved: false,
            age: 30, weight: 75, height: 180, gender: 'male',
            goals: [], activityLevel: 'MODERATE',
          },
          logs: [], health: null, weeklyPlan: null, workoutPlan: null,
          analysis: null, progressAnalysis: null, healthInsights: [],
        };
        await writeDb(row.id, row.db);
        return res.status(403).json({ error: "pending_approval" });
      }

      if (!userData?.profile) return res.status(401).json({ error: "User not found" });

      if (isGoogle) {
        // Google login — no password check (trust Google ID token from client)
      } else {
        if (!password) return res.status(400).json({ error: "Password required" });
        const stored = userData.profile.password;
        if (!stored) return res.status(401).json({ error: "Invalid credentials" });

        // Compare: supports both bcrypt hashes and legacy plaintext (should be migrated already)
        const isHash = stored.startsWith('$2');
        const match = isHash ? await bcrypt.compare(password, stored) : (password === stored);
        if (!match) return res.status(401).json({ error: "Invalid credentials" });

        // If plaintext was still found, hash it now
        if (!isHash) {
          userData.profile.password = await bcrypt.hash(password, 12);
          await writeDb(row.id, row.db);
        }
      }

      if (userData.profile.isApproved === false) {
        return res.status(403).json({ error: "pending_approval" });
      }

      // Set session
      (req.session as any).userEmail = email;
      (req.session as any).isAdmin = !!userData.profile.isAdmin;

      // Return profile without password
      const { password: _pw, ...safeProfile } = userData.profile;
      res.json({ profile: safeProfile, userData: { ...userData, profile: safeProfile } });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/register", loginLimiter, async (req, res) => {
    const { profile: newProfile } = req.body;
    if (!newProfile?.name || !newProfile?.password) {
      return res.status(400).json({ error: "Name and password required" });
    }
    try {
      const row = await readDb();
      const key = newProfile.email || newProfile.name;
      const db = row?.db || {};
      if (db[key]) return res.status(409).json({ error: "User already exists" });

      newProfile.password = await bcrypt.hash(newProfile.password, 12);
      newProfile.isApproved = false;
      db[key] = { profile: newProfile, logs: [], health: null, weeklyPlan: null, workoutPlan: null, analysis: null, progressAnalysis: null, healthInsights: [] };

      if (row) {
        await writeDb(row.id, db);
      } else {
        await pool.query("INSERT INTO user_data (data) VALUES ($1)", [JSON.stringify(db)]);
      }
      res.json({ status: "ok" });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ status: "ok" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    const email = (req.session as any)?.userEmail;
    if (!email) return res.status(401).json({ error: "Not authenticated" });
    try {
      const row = await readDb();
      if (!row) return res.status(500).json({ error: "No database" });
      const userData = row.db[email];
      if (!userData) return res.status(401).json({ error: "User not found" });
      const { password: _pw, ...safeProfile } = userData.profile;
      res.json({ profile: safeProfile, userData: { ...userData, profile: safeProfile } });
    } catch (error) {
      console.error("Auth/me error:", error);
      res.status(500).json({ error: "Failed to restore session" });
    }
  });

  // ── Session auth middleware for all other /api/* routes ───────
  app.use("/api", (req, res, next) => {
    // Auth endpoints are public
    if (req.path.startsWith("/auth/")) { next(); return; }
    const email = (req.session as any)?.userEmail;
    if (!email) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    // Attach to request for downstream handlers
    (req as any).userEmail = email;
    (req as any).isAdmin = !!(req.session as any).isAdmin;
    next();
  });

  // ── Push notification routes ─────────────────────────────────

  app.get('/api/push/vapid-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC });
  });

  app.post('/api/push/subscribe', async (req, res) => {
    const email = (req.session as any)?.userEmail;
    if (!email) return res.status(401).json({ error: 'Unauthorized' });
    const { subscription } = req.body;
    pushSubscriptions.set(email, subscription);
    // Also persist to DB
    try {
      const row = await readDb();
      if (row?.db?.[email]) {
        row.db[email].pushSubscription = subscription;
        await writeDb(row.id, row.db);
      }
    } catch (e) { console.error('Push subscribe persist error:', e); }
    res.json({ ok: true });
  });

  app.post('/api/push/unsubscribe', async (req, res) => {
    const email = (req.session as any)?.userEmail;
    if (!email) return res.status(401).json({ error: 'Unauthorized' });
    pushSubscriptions.delete(email);
    try {
      const row = await readDb();
      if (row?.db?.[email]) {
        delete row.db[email].pushSubscription;
        await writeDb(row.id, row.db);
      }
    } catch (e) { console.error('Push unsubscribe persist error:', e); }
    res.json({ ok: true });
  });

  app.post('/api/push/test', async (req, res) => {
    const email = (req.session as any)?.userEmail;
    if (!email) return res.status(401).json({ error: 'Unauthorized' });
    const sub = pushSubscriptions.get(email);
    if (!sub) return res.status(404).json({ error: 'No subscription found' });
    try {
      await webpush.sendNotification(sub, JSON.stringify({
        title: 'HelioFit',
        body: 'Push-Benachrichtigungen funktionieren!',
        url: '/'
      }));
      res.json({ ok: true });
    } catch (err: any) {
      if (err.statusCode === 410) { pushSubscriptions.delete(email); }
      res.status(500).json({ error: err.message });
    }
  });

  // ── User-isolated API Routes ─────────────────────────────────

  // GET /api/db — returns only the logged-in user's data
  app.get("/api/db", async (req, res) => {
    const email = (req as any).userEmail;
    try {
      const row = await readDb();
      if (!row) return res.json({});
      const userData = row.db[email];
      if (!userData) return res.json({});
      // Strip password from profile
      if (userData.profile) {
        const { password: _pw, ...safeProfile } = userData.profile;
        return res.json({ [email]: { ...userData, profile: safeProfile } });
      }
      res.json({ [email]: userData });
    } catch (error) {
      console.error("Error reading DB:", error);
      res.status(500).json({ error: "Failed to read database" });
    }
  });

  // POST /api/db — writes only the logged-in user's data
  app.post("/api/db", async (req, res) => {
    const email = (req as any).userEmail;
    const isAdmin = (req as any).isAdmin;
    try {
      const newData = req.body;
      const row = await readDb();

      if (row) {
        const merged = { ...row.db };

        // Determine which keys this user is allowed to write
        const allowedKeys = isAdmin ? Object.keys(newData) : [email];

        for (const userKey of allowedKeys) {
          if (!newData[userKey]) continue;
          // Always strip password from incoming profile data (passwords go through /api/admin/password or /api/auth/register)
          if (newData[userKey]?.profile?.password) {
            delete newData[userKey].profile.password;
          }
          if (!merged[userKey]) {
            merged[userKey] = newData[userKey];
            continue;
          }
          const oldUser = merged[userKey];
          const newUser = newData[userKey];

          for (const field of Object.keys(newUser)) {
            if (field === 'profile' && oldUser.profile && newUser.profile) {
              // Never let client overwrite the hashed password
              const existingPw = oldUser.profile.password;
              oldUser.profile = { ...oldUser.profile, ...newUser.profile };
              if (existingPw) oldUser.profile.password = existingPw;

              // Preserve nutritionPreferences ingredients
              const oldPrefs = row.db[userKey]?.profile?.nutritionPreferences;
              const newPrefs = newUser.profile?.nutritionPreferences;
              if (oldPrefs) {
                const mergedNutPrefs = {
                  ...(newPrefs || oldPrefs),
                  preferredIngredients: (newPrefs?.preferredIngredients?.length > 0) ? newPrefs.preferredIngredients : (oldPrefs.preferredIngredients?.length > 0 ? oldPrefs.preferredIngredients : (newPrefs?.preferredIngredients || [])),
                  excludedIngredients: (newPrefs?.excludedIngredients?.length > 0) ? newPrefs.excludedIngredients : (oldPrefs.excludedIngredients?.length > 0 ? oldPrefs.excludedIngredients : (newPrefs?.excludedIngredients || [])),
                };
                oldUser.profile.nutritionPreferences = mergedNutPrefs;
              }
            } else {
              const oldVal = oldUser[field];
              const newVal = newUser[field];
              const oldHasData = oldVal != null && oldVal !== '' && !(Array.isArray(oldVal) && oldVal.length === 0) && !(typeof oldVal === 'object' && !Array.isArray(oldVal) && Object.keys(oldVal).length === 0);
              if (newVal == null && oldHasData) continue;
              if (Array.isArray(newVal) && newVal.length === 0 && oldHasData) continue;
              if (typeof newVal === 'object' && newVal !== null && !Array.isArray(newVal) && Object.keys(newVal).length === 0 && oldHasData) continue;
              if (newVal != null) oldUser[field] = newVal;
            }
          }
          merged[userKey] = oldUser;
        }

        await writeDb(row.id, merged);
      } else {
        await pool.query("INSERT INTO user_data (data) VALUES ($1)", [JSON.stringify(newData)]);
      }
      res.json({ status: "ok" });
    } catch (error) {
      console.error("Error writing DB:", error);
      res.status(500).json({ error: "Failed to save database" });
    }
  });

  // POST /api/db/reset — force-clear specific fields for the logged-in user
  app.post("/api/db/reset", async (req, res) => {
    const email = (req as any).userEmail;
    try {
      const { fields } = req.body; // e.g. ["workoutLogs", "workoutPlan", "weeklyPlan"]
      if (!Array.isArray(fields) || fields.length === 0) return res.status(400).json({ error: "Missing fields array" });
      const allowedResetFields = ["workoutLogs", "workoutPlan", "weeklyPlan", "logs", "analysis", "progressAnalysis", "healthInsights", "correlationInsights", "health"];
      const row = await readDb();
      if (!row || !row.db[email]) return res.status(404).json({ error: "User not found" });
      for (const field of fields) {
        if (!allowedResetFields.includes(field)) continue;
        const oldVal = row.db[email][field];
        if (Array.isArray(oldVal)) row.db[email][field] = [];
        else row.db[email][field] = null;
      }
      await writeDb(row.id, row.db);
      res.json({ status: "ok", cleared: fields.filter(f => allowedResetFields.includes(f)) });
    } catch (error) {
      console.error("Error resetting fields:", error);
      res.status(500).json({ error: "Failed to reset" });
    }
  });

  // POST /api/db/preferences — user-isolated
  app.post("/api/db/preferences", async (req, res) => {
    const email = (req as any).userEmail;
    try {
      const { nutritionPreferences } = req.body;
      if (!nutritionPreferences) return res.status(400).json({ error: "Missing nutritionPreferences" });

      const row = await readDb();
      if (!row) return res.status(404).json({ error: "No DB found" });

      if (row.db[email]?.profile) {
        const oldPrefs = row.db[email].profile.nutritionPreferences || {};
        row.db[email].profile.nutritionPreferences = {
          ...oldPrefs, ...nutritionPreferences,
          preferredIngredients: nutritionPreferences.preferredIngredients?.length > 0 ? nutritionPreferences.preferredIngredients : (oldPrefs.preferredIngredients?.length > 0 ? oldPrefs.preferredIngredients : nutritionPreferences.preferredIngredients || []),
          excludedIngredients: nutritionPreferences.excludedIngredients?.length > 0 ? nutritionPreferences.excludedIngredients : (oldPrefs.excludedIngredients?.length > 0 ? oldPrefs.excludedIngredients : nutritionPreferences.excludedIngredients || []),
        };
        await writeDb(row.id, row.db);
        res.json({ status: "ok" });
      } else {
        res.status(404).json({ error: "User not found" });
      }
    } catch (error) {
      console.error("Error saving preferences:", error);
      res.status(500).json({ error: "Failed to save preferences" });
    }
  });

  // GET /api/admin/users — admin-only, returns all user profiles (no passwords, no health data)
  app.get("/api/admin/users", async (req, res) => {
    if (!(req as any).isAdmin) return res.status(403).json({ error: "Admin only" });
    try {
      const row = await readDb();
      if (!row) return res.json({});
      // Return full DB for admin (strip passwords)
      const safe: Record<string, any> = {};
      for (const [key, userData] of Object.entries(row.db) as [string, any][]) {
        if (userData?.profile) {
          const { password: _pw, ...safeProfile } = userData.profile;
          safe[key] = { ...userData, profile: safeProfile };
        } else {
          safe[key] = userData;
        }
      }
      res.json(safe);
    } catch (error) {
      console.error("Error reading admin users:", error);
      res.status(500).json({ error: "Failed" });
    }
  });

  // POST /api/admin/password — admin-only, set a user's password (hashed)
  app.post("/api/admin/password", async (req, res) => {
    if (!(req as any).isAdmin) return res.status(403).json({ error: "Admin only" });
    const { email, password } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: "Email and password (min 6 chars) required" });
    }
    try {
      const row = await readDb();
      if (!row || !row.db[email]) return res.status(404).json({ error: "User not found" });
      row.db[email].profile.password = await bcrypt.hash(password, 12);
      await writeDb(row.id, row.db);
      res.json({ status: "ok" });
    } catch (error) {
      console.error("Admin password change error:", error);
      res.status(500).json({ error: "Failed" });
    }
  });

  // HealthBridge API Routes — with SSRF protection
  app.post("/api/healthbridge/login", async (req, res) => {
    const { baseUrl, username, password } = req.body;
    if (!isAllowedHealthBridgeUrl(baseUrl)) {
      return res.status(400).json({ error: "HealthBridge URL not allowed" });
    }
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
    if (!isAllowedHealthBridgeUrl(baseUrl)) {
      return res.status(400).json({ error: "HealthBridge URL not allowed" });
    }
    try {
      let normalizedBase = baseUrl.replace(/\/$/, "");
      let targetEndpoint = endpoint;
      if (normalizedBase.endsWith("/api/v1") && endpoint.startsWith("/api/v1")) {
        targetEndpoint = endpoint.replace("/api/v1", "");
      }
      const fullUrl = `${normalizedBase}${targetEndpoint}`;
      const response = await axios.get(fullUrl, { headers: { 'x-api-key': token }, params });
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

  // ── Notification scheduler ──────────────────────────────────
  async function checkAndSendNotifications() {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
    try {
      const row = await readDb();
      if (!row?.db) return;

      for (const [email, userData] of Object.entries(row.db) as [string, any][]) {
        const sub = pushSubscriptions.get(email) || userData.pushSubscription;
        if (!sub) continue;

        const prefs = userData.profile?.notificationPreferences;
        if (!prefs?.pushEnabled) continue;

        // Anomaly detection: check if latest HRV or resting HR deviates significantly
        if (prefs.anomalyAlerts && userData.health?.metrics?.length >= 7) {
          const metrics = userData.health.metrics;
          const recent = metrics.slice(-7);
          const latest = metrics[metrics.length - 1];

          if (latest?.hrv) {
            const avgHRV = recent.reduce((s: number, m: any) => s + (m.hrv || 0), 0) / recent.filter((m: any) => m.hrv).length;
            if (latest.hrv < avgHRV * 0.75) {
              try {
                await webpush.sendNotification(sub, JSON.stringify({
                  title: 'HelioFit',
                  body: `Deine HRV (${Math.round(latest.hrv)}) liegt deutlich unter dem Durchschnitt (${Math.round(avgHRV)}). Gönn dir Ruhe!`,
                  url: '/'
                }));
              } catch (e: any) { if (e.statusCode === 410) pushSubscriptions.delete(email); }
            }
          }

          if (latest?.restingHeartRate) {
            const avgHR = recent.reduce((s: number, m: any) => s + (m.restingHeartRate || 0), 0) / recent.filter((m: any) => m.restingHeartRate).length;
            if (latest.restingHeartRate > avgHR * 1.15) {
              try {
                await webpush.sendNotification(sub, JSON.stringify({
                  title: 'HelioFit',
                  body: `Dein Ruhepuls (${Math.round(latest.restingHeartRate)}) ist erhöht (Ø ${Math.round(avgHR)}). Mögliche Überbelastung oder Krankheit.`,
                  url: '/'
                }));
              } catch (e: any) { if (e.statusCode === 410) pushSubscriptions.delete(email); }
            }
          }
        }

        // Sync reminder: check if last sync was more than 3 days ago
        if (prefs.syncReminders) {
          const lastSync = userData.profile?.healthBridgeTokens?.last_sync || userData.profile?.healthBridgeTokens?.health_sync_last_sync;
          if (lastSync) {
            const daysSinceSync = (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceSync > 3) {
              try {
                await webpush.sendNotification(sub, JSON.stringify({
                  title: 'HelioFit',
                  body: `Letzte Synchronisierung vor ${Math.round(daysSinceSync)} Tagen. Bitte synchronisiere deine Gesundheitsdaten.`,
                  url: '/'
                }));
              } catch (e: any) { if (e.statusCode === 410) pushSubscriptions.delete(email); }
            }
          }
        }
      }
    } catch (err) {
      console.error('Notification scheduler error:', err);
    }
  }

  // Run scheduler every hour
  setInterval(checkAndSendNotifications, 60 * 60 * 1000);

  // Load persisted subscriptions on startup
  (async () => {
    try {
      const row = await readDb();
      if (row?.db) {
        for (const [email, userData] of Object.entries(row.db) as [string, any][]) {
          if (userData.pushSubscription) {
            pushSubscriptions.set(email, userData.pushSubscription);
          }
        }
      }
    } catch (e) { console.error('Failed to load push subscriptions:', e); }
  })();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
