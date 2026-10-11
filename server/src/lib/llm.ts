/**
 * Thin wrapper around OpenAI Chat Completions used by all AI endpoints.
 *
 * Goals:
 *   - Single point of swap: if we change provider/model later, only this file changes.
 *   - Fallback to mocks when key is missing or call fails — demo never breaks.
 *   - Safety budget: max_tokens + timeout caps cost per request.
 *   - Per-user rate limit so a runaway client can't drain the wallet.
 *
 * Per-request cost is roughly:
 *   gpt-4o-mini: $0.15 per 1M input + $0.60 per 1M output
 *   Typical query: ~3k input + ~250 output  ≈  $0.0006
 */
import OpenAI from "openai";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { TIERS, getUserTier } from "./subscriptions.js";

const model = config.openaiModel;
const ANON_DAILY = TIERS.free.aiDailyLimit ?? 20;
const MAX_TOKENS = config.llmMaxTokens;
const TIMEOUT_MS = config.llmTimeoutMs;
const MAX_TOOL_ITERATIONS = config.llmMaxToolIterations;

/**
 * Resolve the AI request limit for the caller based on their subscription
 * tier. Free / anon: TIERS.free.aiDailyLimit (e.g. 20). Plus: 100. Pro: null
 * (= unlimited). Returns the daily ceiling, or null for no limit.
 */
async function resolveDailyLimit(userId?: number | null): Promise<number | null> {
  if (!userId) return ANON_DAILY;
  const tier = await getUserTier(userId);
  return TIERS[tier].aiDailyLimit;
}

/** Count AiQuery rows for this user in the last 24h. */
async function dailyCount(userId?: number | null): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.aiQuery.count({
    where: { userId: userId ?? null, createdAt: { gte: since } },
  });
}

/**
 * In-memory per-IP counter for ANONYMOUS callers. The AiQuery table has
 * `userId: null` for every anon call regardless of who fired it — so one
 * attacker can drain the daily quota for every legitimate visitor.
 *
 * This map keeps a separate count per IP within a rolling 24h window so
 * the shared bucket can't be weaponised. Resets at midnight UTC via
 * lazy expiry; per-instance only (won't survive a Render restart). For a
 * single-instance demo that's fine. For horizontal scale, swap for Redis.
 */
interface AnonBucket { count: number; expiresAt: number }
const anonByIp = new Map<string, AnonBucket>();
const ANON_WINDOW_MS = 24 * 60 * 60 * 1000;
const ANON_MAX_ENTRIES = 10_000;  // LRU cap; prevents unbounded growth (audit-final P6)
let lastUnknownIpWarn = 0;

function warnUnknownIp(ip: string) {
  // Rate-limited warn — without it a misconfigured proxy floods the logs.
  // 10s gap is enough to spot a regression in a live deploy without spam.
  if (ip === "unknown" && Date.now() - lastUnknownIpWarn > 10_000) {
    lastUnknownIpWarn = Date.now();
    console.warn(`[llm] req.ip === "unknown" — trust-proxy / X-Forwarded-For may be misconfigured. Anon limit will collapse to one shared bucket.`);
  }
}

function evictIfFull() {
  if (anonByIp.size < ANON_MAX_ENTRIES) return;
  // Drop the oldest 10% — Map preserves insertion order, so the first
  // keys are the oldest. Cheap enough at 10k entries.
  const drop = Math.floor(ANON_MAX_ENTRIES * 0.1);
  let i = 0;
  for (const k of anonByIp.keys()) {
    if (i++ >= drop) break;
    anonByIp.delete(k);
  }
}

export function bumpAnonIp(ip: string): { count: number; limit: number; reached: boolean } {
  warnUnknownIp(ip);
  const now = Date.now();
  const cur = anonByIp.get(ip);
  if (!cur || cur.expiresAt < now) {
    evictIfFull();
    anonByIp.set(ip, { count: 1, expiresAt: now + ANON_WINDOW_MS });
    return { count: 1, limit: ANON_DAILY, reached: false };
  }
  cur.count += 1;
  return { count: cur.count, limit: ANON_DAILY, reached: cur.count > ANON_DAILY };
}

export function peekAnonIp(ip: string): { count: number; limit: number; reached: boolean } {
  warnUnknownIp(ip);
  const now = Date.now();
  const cur = anonByIp.get(ip);
  if (!cur || cur.expiresAt < now) return { count: 0, limit: ANON_DAILY, reached: false };
  return { count: cur.count, limit: ANON_DAILY, reached: cur.count >= ANON_DAILY };
}

// Periodic sweep — without this expired entries linger until their IP is
// hit again (lazy expiry). At idle hours a sweep keeps RAM flat.
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of anonByIp.entries()) {
      if (v.expiresAt < now) anonByIp.delete(k);
    }
  }, 60 * 60 * 1000); // hourly
}

const openai = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;

/** Process-wide daily ceiling on OpenAI calls (see config.aiGlobalDailyCap). */
let globalDay = "";
let globalCount = 0;
function takeGlobalSlot(): boolean {
  const cap = config.aiGlobalDailyCap;
  if (!cap) return true;
  const day = new Date().toISOString().slice(0, 10);
  if (day !== globalDay) {
    globalDay = day;
    globalCount = 0;
  }
  if (globalCount >= cap) {
    console.warn(`[llm] global daily cap reached (${globalCount}/${cap})`);
    return false;
  }
  globalCount++;
  return true;
}

export const llm = {
  enabled(): boolean {
    return !!openai;
  },

  async chat(opts: {
    system: string;
    user: string;
    /** When true, ask for strict JSON response. */
    json?: boolean;
    /** Anti-runaway. Authed users get tier-based DB limit; anon callers get
     *  IP-keyed in-memory limit (so one attacker can't drain the bucket). */
    rateKey?: { userId?: number | null; ip?: string | null };
  }): Promise<string | null> {
    if (!openai) return null;

    // Anonymous: per-IP guard. Per-userId DB count is the auth path.
    if (!opts.rateKey?.userId) {
      const ip = opts.rateKey?.ip ?? "unknown";
      const peek = peekAnonIp(ip);
      if (peek.reached) {
        console.warn(`[llm] anon IP limit hit ip=${ip} (${peek.count}/${peek.limit})`);
        return null;
      }
    } else {
      // Tier-based daily rate limit. Pro tier has no ceiling (limit=null).
      const limit = await resolveDailyLimit(opts.rateKey.userId);
      if (limit !== null) {
        const count = await dailyCount(opts.rateKey.userId);
        if (count >= limit) {
          console.warn(`[llm] daily limit hit for user=${opts.rateKey.userId} (${count}/${limit})`);
          return null;
        }
      }
    }

    if (!takeGlobalSlot()) return null;

    try {
      const completion = await Promise.race([
        openai.chat.completions.create({
          model,
          stream: false,
          messages: [
            { role: "system" as const, content: opts.system },
            { role: "user" as const,   content: opts.user },
          ],
          max_tokens: MAX_TOKENS,
          temperature: 0.6,
          ...(opts.json
            ? { response_format: { type: "json_object" as const } }
            : {}),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("LLM timeout")), TIMEOUT_MS)
        ),
      ]);

      const text = completion.choices[0]?.message?.content ?? "";
      // Successful anon call → bump the IP counter so the next call sees
      // the updated peek. Authed users still trigger the DB-count via the
      // AiQuery row their caller logs.
      if (!opts.rateKey?.userId) {
        bumpAnonIp(opts.rateKey?.ip ?? "unknown");
      }
      return text.trim();
    } catch (e) {
      console.error("[llm] call failed:", (e as Error).message);
      return null;
    }
  },
};

/**
 * Tool-calling agentic chat. Lets the model call functions in a loop until
 * it produces a final text/JSON answer.
 *
 *   tools           — JSON-schema tool definitions for OpenAI
 *   onToolCall      — async handler that executes a single tool call and
 *                     returns its result (will be JSON-stringified for LLM)
 *   maxIterations   — safety cap on loop depth
 *
 * Returns the final assistant content string, or null if the model never
 * settled or LLM is unavailable.
 */
export async function chatWithTools(opts: {
  system: string;
  user: string;
  /** Prior turns (user + assistant text). Inserted between system and the
   *  current user message so the model has conversational context.
   *  Tool calls from past turns are NOT replayed — only the visible text.
   *  Most recent few turns is plenty; older history wastes context. */
  history?: { role: "user" | "assistant"; content: string }[];
  tools: OpenAI.Chat.Completions.ChatCompletionTool[];
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Force JSON-object output for the FINAL (non-tool) response. */
  finalJson?: boolean;
  rateKey?: { userId?: number | null; ip?: string | null };
  maxIterations?: number;
}): Promise<{ content: string | null; toolsUsed: string[] }> {
  if (!openai) return { content: null, toolsUsed: [] };

  // Anonymous: per-IP guard. Authed: tier-based DB count.
  if (!opts.rateKey?.userId) {
    const ip = opts.rateKey?.ip ?? "unknown";
    const peek = peekAnonIp(ip);
    if (peek.reached) {
      console.warn(`[llm.chatWithTools] anon IP limit hit ip=${ip} (${peek.count}/${peek.limit})`);
      return { content: null, toolsUsed: [] };
    }
  } else {
    const limit = await resolveDailyLimit(opts.rateKey.userId);
    if (limit !== null) {
      const count = await dailyCount(opts.rateKey.userId);
      if (count >= limit) {
        console.warn(`[llm.chatWithTools] daily limit ${count}/${limit}`);
        return { content: null, toolsUsed: [] };
      }
    }
  }

  // Trim history to the most recent 8 turns — older context rarely helps
  // and burns tokens. The model still has the system prompt + the current
  // turn, which carries the user's actual question.
  const recentHistory = (opts.history ?? []).slice(-8);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: opts.system },
    ...recentHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user",   content: opts.user },
  ];
  const toolsUsed: string[] = [];
  const maxIter = opts.maxIterations ?? MAX_TOOL_ITERATIONS;

  try {
    for (let i = 0; i < maxIter; i++) {
      if (!takeGlobalSlot()) return { content: null, toolsUsed };
      const completion = await Promise.race([
        openai.chat.completions.create({
          model,
          stream: false,
          messages,
          tools: opts.tools,
          tool_choice: "auto",
          max_tokens: MAX_TOKENS,
          temperature: 0.5,
          // JSON mode kicks in on the final (non-tool) message
          ...(opts.finalJson ? { response_format: { type: "json_object" as const } } : {}),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("LLM timeout")), TIMEOUT_MS)
        ),
      ]);

      const msg = completion.choices[0].message;

      // Done — LLM gave a final text/JSON answer with no more tool calls
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        if (!opts.rateKey?.userId) {
          bumpAnonIp(opts.rateKey?.ip ?? "unknown");
        }
        return { content: msg.content ?? "", toolsUsed };
      }

      // Execute each tool call, feed results back
      messages.push(msg);
      for (const call of msg.tool_calls) {
        // OpenAI types union ChatCompletionMessageToolCall — we only handle "function" kind
        if (call.type !== "function") continue;
        const fnName = call.function.name;
        toolsUsed.push(fnName);
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments); } catch { /* ignore */ }

        const result = await opts.onToolCall(fnName, args);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }
    // Hit iteration cap — LLM never settled
    console.warn(`[llm.chatWithTools] hit max iterations (${maxIter}). Tools used: ${toolsUsed.join(", ")}`);
    return { content: null, toolsUsed };
  } catch (e) {
    console.error("[llm.chatWithTools] failed:", (e as Error).message);
    return { content: null, toolsUsed };
  }
}

/** Safely parse JSON the model returned. */
export function parseJSON<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // model occasionally wraps in ```json fences — try to extract
    const m = raw.match(/```(?:json)?\s*([\s\S]+?)```/);
    if (m) {
      try { return JSON.parse(m[1]) as T; } catch { /* ignore */ }
    }
    return null;
  }
}
