/**
 * Centralised runtime configuration.
 *
 * One source of truth for env-driven knobs — magic numbers that used to
 * live inline (rate limits, retention windows, model name, timeouts) all
 * read from here. New environment variables go through this file too,
 * which means:
 *   - Every config knob is discoverable (just open this file)
 *   - Reasonable defaults baked in, so the app runs without a .env file
 *   - Type-safe access from anywhere via `import { config } from ".../config"`
 *
 * Convention: env vars are SCREAMING_SNAKE_CASE, config keys are camelCase.
 */
import "dotenv/config";

function int(name: string, def: number): number {
  const raw = process.env[name];
  if (!raw) return def;
  const n = Number(raw);
  return Number.isFinite(n) ? n : def;
}

function str(name: string, def: string): string {
  return process.env[name] || def;
}

/**
 * Resolve JWT_SECRET with prod safety.
 *
 * In NODE_ENV=production the default "dev-secret" would let anyone with
 * the open-source repo forge tokens for any user/organizer/admin — full
 * data takeover. So we hard-refuse to boot if the env var is missing OR
 * left at the dev default. In dev we fall back to "dev-secret" silently
 * because that's convenient and the threat model is "your own laptop".
 */
function resolveJwtSecret(): string {
  const raw = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!raw || raw === "dev-secret" || raw.startsWith("change-me") || raw.length < 16) {
      console.error("✗ JWT_SECRET missing or insecure in production. Refusing to boot.");
      console.error("  Set JWT_SECRET to a random 32+ byte string (e.g. `openssl rand -hex 32`).");
      process.exit(1);
    }
    return raw;
  }
  return raw || "dev-secret";
}

export const config = {
  // --- Server ---
  port: int("PORT", 3001),
  corsOrigin: str("CORS_ORIGIN", "http://localhost:5173")
    .split(",")
    .map((s) => s.trim()),

  // --- Auth ---
  jwtSecret: resolveJwtSecret(),
  jwtExpiresInDays: int("JWT_EXPIRES_DAYS", 30),

  // --- OpenAI / LLM ---
  openaiApiKey: str("OPENAI_API_KEY", ""),
  openaiModel: str("OPENAI_MODEL", "gpt-4o-mini"),
  llmMaxTokens: int("LLM_MAX_TOKENS", 500),
  llmTimeoutMs: int("LLM_TIMEOUT_MS", 25_000),
  llmMaxToolIterations: int("LLM_MAX_TOOL_ITERATIONS", 5),
  /** Process-wide ceiling on OpenAI calls per UTC day, across all users and
   *  tiers (0 = off). A backstop for public demos: with simulated payments any
   *  signed-in user can pick the unlimited tier. */
  aiGlobalDailyCap: int("AI_GLOBAL_DAILY_CAP", 0),

  // --- Rate limits (per hour, by user) ---
  rateLimitAuthed: int("RATE_LIMIT_AUTHED", 120),
  rateLimitAnon: int("RATE_LIMIT_ANON", 60),

  // --- Cleanup ---
  /** How many days of AiQuery history to keep. Older rows purged. */
  aiQueryRetentionDays: int("AI_QUERY_RETENTION_DAYS", 30),
  /** How often the cleanup job re-runs. */
  cleanupIntervalHours: int("CLEANUP_INTERVAL_HOURS", 6),
} as const;

/** True if a real LLM call should be attempted (key configured). */
export const llmEnabled = !!config.openaiApiKey;
