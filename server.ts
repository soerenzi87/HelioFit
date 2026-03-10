import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { Pool } from "pg";

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
