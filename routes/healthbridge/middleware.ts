import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import type { Pool } from "pg";

export interface HbTokenRequest extends Request {
  hbUserId?: string;
  hbUserLabel?: string;
}

/** Verify x-api-key header against HB_API_KEY env var. */
export function verifyApiKey(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-api-key"];
  const expected = process.env.HB_API_KEY;
  if (!expected || key !== expected) {
    res.status(403).json({ detail: "Invalid API key" });
    return;
  }
  next();
}

/**
 * Resolve :token path parameter to a user.
 * Looks up the token in hb_sync_tokens and attaches hbUserId + hbUserLabel to the request.
 */
export function resolveToken(pool: Pool) {
  return async (req: HbTokenRequest, res: Response, next: NextFunction) => {
    const token = req.params.token;
    if (!token || token.length < 32) {
      res.status(403).json({ detail: "Invalid sync token" });
      return;
    }

    try {
      const result = await pool.query(
        "SELECT id, user_label FROM hb_sync_tokens WHERE token = $1",
        [token]
      );
      if (result.rows.length === 0) {
        res.status(403).json({ detail: "Invalid sync token" });
        return;
      }

      req.hbUserId = result.rows[0].id;
      req.hbUserLabel = result.rows[0].user_label;
      next();
    } catch {
      res.status(500).json({ detail: "Token verification failed" });
    }
  };
}

/** Generate a cryptographically random sync token (64 hex chars). */
export function generateSyncToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
