import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

/**
 * Three parallel identity systems live behind the same Bearer token:
 *   - user tokens carry      { sub, kind: "user" } (or no kind for legacy)
 *   - organizer tokens carry { sub, kind: "org" }
 *   - admin tokens carry     { sub, kind: "adm" }
 *
 * They're separate because a single human could in theory be a traveller,
 * run an agency, AND moderate the platform — but the UI surfaces should
 * not bleed into each other. The frontend stores them under distinct
 * localStorage keys.
 */
export interface AuthedRequest extends Request {
  userId?: number;
  organizerId?: number;
  adminId?: number;
}

type TokenKind = "user" | "org" | "adm";

interface TokenPayload {
  sub: number;
  kind?: TokenKind;
}

/** Reads Bearer token, attaches userId/organizerId/adminId to req. Doesn't reject. */
export function attachUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7);
    try {
      const payload = jwt.verify(token, config.jwtSecret) as unknown as TokenPayload;
      if (payload.kind === "org") {
        req.organizerId = payload.sub;
      } else if (payload.kind === "adm") {
        req.adminId = payload.sub;
      } else {
        // Default: user token (older tokens predate the `kind` field).
        req.userId = payload.sub;
      }
    } catch {
      // ignore invalid token — request continues as anonymous
    }
  }
  next();
}

/** Rejects request if not authenticated as a user. */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

/** Rejects request if not authenticated as an organizer. */
export function requireOrganizer(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.organizerId) {
    res.status(401).json({ error: "organizer auth required" });
    return;
  }
  next();
}

/** Rejects request if not authenticated as a platform admin. */
export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.adminId) {
    res.status(401).json({ error: "admin auth required" });
    return;
  }
  next();
}

export function signToken(userId: number) {
  return jwt.sign({ sub: userId, kind: "user" }, config.jwtSecret, {
    expiresIn: `${config.jwtExpiresInDays}d`,
  });
}

export function signOrganizerToken(organizerId: number) {
  return jwt.sign({ sub: organizerId, kind: "org" }, config.jwtSecret, {
    expiresIn: `${config.jwtExpiresInDays}d`,
  });
}

export function signAdminToken(adminId: number) {
  return jwt.sign({ sub: adminId, kind: "adm" }, config.jwtSecret, {
    expiresIn: `${config.jwtExpiresInDays}d`,
  });
}
