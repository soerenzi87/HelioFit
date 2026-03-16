import { Router } from "express";
import type { Pool } from "pg";
import { verifyApiKey, generateSyncToken } from "./middleware.js";

export function createTokensRouter(pool: Pool): Router {
  const router = Router();

  // All token management endpoints require API key
  router.use("/tokens", verifyApiKey);

  // POST /hb/tokens - Create a new sync token for a user
  router.post("/tokens", async (req, res) => {
    const { user_label } = req.body;

    if (!user_label || typeof user_label !== "string" || user_label.length < 1) {
      res.status(400).json({ detail: "user_label is required" });
      return;
    }

    const token = generateSyncToken();

    try {
      const result = await pool.query(
        "INSERT INTO hb_sync_tokens (token, user_label) VALUES ($1, $2) RETURNING id, token, user_label, created_at",
        [token, user_label]
      );
      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error creating sync token:", error);
      res.status(500).json({ detail: "Failed to create sync token" });
    }
  });

  // GET /hb/tokens - List all sync tokens
  router.get("/tokens", async (_req, res) => {
    try {
      const result = await pool.query(
        "SELECT id, token, user_label, created_at FROM hb_sync_tokens ORDER BY created_at DESC"
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Error listing sync tokens:", error);
      res.status(500).json({ detail: "Failed to list sync tokens" });
    }
  });

  // DELETE /hb/tokens/:token - Delete a sync token
  router.delete("/tokens/:token", async (req, res) => {
    try {
      const result = await pool.query("DELETE FROM hb_sync_tokens WHERE token = $1", [req.params.token]);
      if (result.rowCount === 0) {
        res.status(404).json({ detail: "Token not found" });
        return;
      }
      res.json({ status: "deleted" });
    } catch (error) {
      console.error("Error deleting sync token:", error);
      res.status(500).json({ detail: "Failed to delete sync token" });
    }
  });

  return router;
}
