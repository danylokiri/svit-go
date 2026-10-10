/**
 * Thin fetch wrapper. Reads JWT from localStorage on every call, sends
 * `Authorization: Bearer ...` if present, JSON-parses responses, throws
 * on non-OK status codes.
 */

const BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");

const TOKEN_KEY = "svitgo.token";
const ORG_TOKEN_KEY = "svitgo.orgToken";
const ADMIN_TOKEN_KEY = "svitgo.adminToken";

export function getApiBase(): string {
  return BASE_URL;
}

export function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
}
export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getOrgToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem(ORG_TOKEN_KEY) : null;
}
export function setOrgToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(ORG_TOKEN_KEY, token);
  else localStorage.removeItem(ORG_TOKEN_KEY);
}

export function getAdminToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem(ADMIN_TOKEN_KEY) : null;
}
export function setAdminToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

interface RequestOpts extends Omit<RequestInit, "body"> {
  body?: unknown;
  query?: Record<string, string | number | boolean | string[] | undefined>;
  /** Choose which token to send. Defaults to user. */
  auth?: "user" | "organizer" | "admin" | "none";
  /** Skip JSON content-type (e.g. for multipart). */
  raw?: boolean;
}

export async function api<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { body, query, headers, auth = "user", raw, ...rest } = opts;

  let url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (query) {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        if (v.length) usp.set(k, v.join(","));
      } else {
        usp.set(k, String(v));
      }
    }
    const qs = usp.toString();
    if (qs) url += `?${qs}`;
  }

  const finalHeaders: Record<string, string> = {
    ...(raw ? {} : { "Content-Type": "application/json" }),
    ...(headers as Record<string, string> | undefined),
  };
  if (auth !== "none") {
    const token =
      auth === "organizer" ? getOrgToken()
      : auth === "admin" ? getAdminToken()
      : getToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? (raw ? (body as BodyInit) : JSON.stringify(body)) : undefined,
  });

  let parsed: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, parsed, extractMessage(parsed, res.status));
  }
  return parsed as T;
}

/**
 * Squeeze a human-readable string out of whatever the server returned.
 * Handles:
 *   - { error: "string" }                       → "string"
 *   - { error: { fieldErrors: {...}, ... } }    → "email: invalid; password: too short"
 *   - { error: { formErrors: [...] } }
 *   - plain strings
 */
function extractMessage(body: unknown, status: number): string {
  if (typeof body === "string") return body || `HTTP ${status}`;
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error: unknown }).error;
    if (typeof err === "string") return err;
    if (err && typeof err === "object") {
      const fieldErrors = (err as { fieldErrors?: Record<string, string[]> }).fieldErrors;
      const formErrors  = (err as { formErrors?: string[] }).formErrors;
      const parts: string[] = [];
      if (fieldErrors) {
        for (const [field, msgs] of Object.entries(fieldErrors)) {
          if (Array.isArray(msgs) && msgs.length) parts.push(`${field}: ${msgs[0]}`);
        }
      }
      if (formErrors && formErrors.length) parts.push(...formErrors);
      if (parts.length) return parts.join("; ");
    }
  }
  return `HTTP ${status}`;
}
