import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUp, Briefcase, Mail, MapPin, MessageCircle, Phone, Plus, Sparkles, Trash2, User as UserIcon, X } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import TourCard from "@/components/TourCard";
import FadingText from "@/components/FadingText";
import { useConfirm } from "@/components/ConfirmDialog";
import RegisterWallModal from "@/components/RegisterWallModal";
import { aiChat, askTour, fetchTour, type Organizer, type Tour } from "@/api";
import { cn, tourHero } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/auth/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { ANON_LIMIT, bumpAnonUsage, getAnonUsage } from "@/lib/aiQuota";

type Msg =
  | { role: "user"; text: string }
  | {
      role: "ai";
      text: string;
      tours?: Tour[];                 // returned by general /ai/chat
      needsHumanContact?: boolean;    // returned by /ai/ask-tour
      followUps?: string[];           // returned by /ai/ask-tour
      /** Just generated this session — animate fade-in. Stripped on save. */
      fresh?: boolean;
    };

// Fallback organiser if the tour has none (or we're in general chat).
// Generic SvitGo-support contact only — never the developer's personal
// email/phone. The dev's contact details previously leaked here would have
// been scraped by anyone opening the contact sheet in general chat.
const FALLBACK_ORGANIZER: Organizer = {
  slug: "svitgo-support",
  name: "SvitGo support",
  type: "company",
  bio: "Our concierge — for any general questions.",
  email: "support@svitgo.app",
  phone: "+380 44 000 0000",
  whatsapp: undefined,
  rating: null,
  reviewsCount: 0,
  toursCount: 0,
  yearsActive: 1,
};

/**
 * Two modes:
 *   /ai                        — general AI (recommends tours)
 *   /ai?tour=santorini-7       — tour-scoped AI (answers questions about that tour)
 *
 * History is saved to sessionStorage so navigating around the site (or going
 * back to a tour, then back to chat) keeps the conversation intact for the
 * session. Each context has its own key.
 */
export default function ChatPage() {
  const [params, setParams] = useSearchParams();
  const initialQ = params.get("q") || "";
  const tourSlug = params.get("tour");
  // Compare mode: ?compare=slug1,slug2,slug3 (up to 4). Loaded below into
  // `compareTours` so we can show a context banner + prime the chat with
  // "the user wants to compare these N tours" via a synthetic system note.
  const compareParam = params.get("compare");
  const compareSlugs = compareParam
    ? compareParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4)
    : [];
  const storageKey = tourSlug
    ? `svitgo.chat.tour.${tourSlug}`
    : compareSlugs.length > 0
      // Comma separator — slugs themselves contain hyphens
      // ("bamboo-tea-bowls-and-…"), so splitting by `-` later would
      // fragment them. Commas are URL-safe and never appear in our slugs.
      ? `svitgo.chat.compare.${compareSlugs.slice().sort().join(",")}`
      : "svitgo.chat.general";

  const [tour, setTour] = useState<Tour | null>(null);
  const [compareTours, setCompareTours] = useState<Tour[]>([]);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>(() => loadMessages(storageKey));
  const [busy, setBusy] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [wallOpen, setWallOpen] = useState(false);
  // Anon free-quota counter. We read once on mount (re-renders pull from this
  // state, not localStorage, so the badge updates instantly after each send).
  const [anonUsage, setAnonUsage] = useState(() => getAnonUsage());
  const endRef = useRef<HTMLDivElement | null>(null);
  const initSent = useRef(false);
  const confirm = useConfirm();
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { tier, tiers } = useSubscription();
  const dailyLimit = tiers[tier]?.aiDailyLimit ?? null;

  // Resizable sidebar. Width persists across the tab session so the user
  // doesn't have to redrag every time they reload. Clamped to a sane range —
  // below ~72px nothing readable fits, above ~440px wastes space.
  const SIDEBAR_MIN = 64;
  const SIDEBAR_MAX = 440;
  const SIDEBAR_NARROW_THRESHOLD = 130; // below this we hide text, show photo only
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 256;
    const stored = Number(sessionStorage.getItem("svitgo.chat.sidebar-width"));
    return Number.isFinite(stored) && stored >= SIDEBAR_MIN && stored <= SIDEBAR_MAX
      ? stored
      : 256;
  });
  useEffect(() => {
    sessionStorage.setItem("svitgo.chat.sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);

  // Only push the chat content right on lg+ — on mobile the sidebar is
  // hidden anyway, so the padding would just waste space.
  const isLg = useMediaQuery("(min-width: 1024px)");

  // Reset *messages* when navigating between chat contexts (different tour slug).
  // We deliberately DO NOT reset initSent here — that ref guards the one-shot
  // auto-send of `?q=` on initial mount, and React StrictMode runs effects
  // twice in dev which would otherwise double-fire the send.
  const lastKey = useRef(storageKey);
  useEffect(() => {
    if (lastKey.current !== storageKey) {
      setMessages(loadMessages(storageKey));
      lastKey.current = storageKey;
    }
  }, [storageKey]);

  // Persist on every change
  useEffect(() => {
    saveMessages(storageKey, messages);
  }, [storageKey, messages]);

  // Fetch tour info when in tour mode
  useEffect(() => {
    if (!tourSlug) { setTour(null); return; }
    let cancelled = false;
    fetchTour(tourSlug).then((t) => { if (!cancelled) setTour(t); }).catch(console.error);
    return () => { cancelled = true; };
  }, [tourSlug]);

  // Fetch the compare set in parallel. Failures are silent — the worst case
  // is we hide the context banner; the chat still works.
  useEffect(() => {
    if (compareSlugs.length === 0) { setCompareTours([]); return; }
    let cancelled = false;
    Promise.all(compareSlugs.map((s) => fetchTour(s).catch(() => null)))
      .then((rs) => {
        if (cancelled) return;
        const valid = rs.filter((x): x is Tour => x !== null);
        setCompareTours(valid);
        // Cache meta for each tour in the comparison so the sidebar row
        // (which is keyed on the first slug) can render a real hero +
        // human-readable cities for "vs X, Y, Z" subtitle.
        for (const tt of valid) {
          writeTourMeta(tt.id, {
            city: tt.city,
            country: tt.country,
            emoji: tt.emoji,
            gradient: tt.gradient,
            title: tt.title,
            imageCount: tt.imageCount,
          });
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareSlugs.join(",")]);

  // Once the tour is loaded, cache its display metadata so the sidebar can
  // render the chat row (image + city) without re-fetching the whole tour.
  useEffect(() => {
    if (!tour || !tourSlug) return;
    writeTourMeta(tourSlug, {
      city: tour.city,
      country: tour.country,
      emoji: tour.emoji,
      gradient: tour.gradient,
      title: tour.title,
      imageCount: tour.imageCount,
    });
  }, [tour, tourSlug]);

  // List of active chats in this browser session — feeds the left sidebar.
  // Refreshed whenever messages change (new reply persisted) or we switch
  // between chats (storageKey changes).
  const [sessions, setSessions] = useState<ChatSession[]>(() => listChatSessions(storageKey));
  useEffect(() => {
    setSessions(listChatSessions(storageKey));
    // compareTours included so the row re-renders once writeTourMeta runs
    // for all compared tours — without it, the sidebar lists the chat
    // before meta is in storage and the collage shows only placeholders.
  }, [storageKey, messages, tour, compareTours]);

  // Auto-send initial query from ?q= once. The ref-guard prevents StrictMode
  // double-firing; clearing the param from the URL also makes refresh idempotent.
  useEffect(() => {
    if (initialQ && !initSent.current) {
      initSent.current = true;
      send(initialQ);
      const next = new URLSearchParams(params);
      next.delete("q");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text) return;

    // Anonymous-user wall — before doing ANYTHING (no UI flicker, no message
    // added to the transcript), if they're out of free shots, surface the
    // register modal and stop. Server still enforces the same cap server-side
    // via the daily-tier limit; this is the friendly UX layer.
    if (!user) {
      const cur = getAnonUsage();
      if (cur.reached) {
        setWallOpen(true);
        return;
      }
    }

    setInput("");
    setMessages((p) => [...p, { role: "user", text }]);
    setBusy(true);
    try {
      const history = messages.map((m) => ({ role: m.role, text: m.text }));
      // In compare-mode we prepend a hidden context block listing the tours
      // so the LLM knows what the user is comparing. Re-injected on EVERY
      // send — not just the first — because the chat history only carries
      // the user's RAW text (we don't store the augmented prefix), so a
      // second question with naked text otherwise loses the comparison
      // frame and the model answers generically.
      const compareContext = compareTours.length >= 2
        ? `Context: the user is comparing these ${compareTours.length} tours from our catalog:\n` +
          compareTours.map((c) => (
            `• "${c.title}" (${c.city}, ${c.country}) — ${c.durationNights}n, ${c.hotelStars}★, ${c.meal}, €${c.price}, themes: ${c.themes.join("/")}`
          )).join("\n") +
          `\nWhen answering, refer to these tours by city. Use the catalogue tools to fetch deeper details if needed (slugs: ${compareTours.map((c) => c.id).join(", ")}).\n\nQuestion: `
        : "";
      const augmented = compareContext + text;

      if (tourSlug) {
        const r = await askTour(tourSlug, text, history, locale);
        setMessages((p) => [
          ...p,
          {
            role: "ai",
            text: r.reply,
            needsHumanContact: r.needsHumanContact,
            followUps: r.suggestedFollowUps,
            fresh: true,
          },
        ]);
      } else {
        // Pass conversation history so the model remembers what the user
        // said before — without this every reply starts from scratch
        // ("I want to go to Cairo" → "idk" lost the Cairo context).
        const r = await aiChat(augmented, history, locale);
        setMessages((p) => [...p, { role: "ai", text: r.reply, tours: r.tours, fresh: true }]);
      }
      // Successful send → bump the anon counter (counts only completed
      // exchanges, not failed ones — otherwise a flaky network would lock
      // them out unfairly).
      if (!user) {
        const next = bumpAnonUsage();
        setAnonUsage(next);
        if (next.reached) {
          // Surface the wall right after the LAST free reply so they finish
          // reading their answer first, then see the upgrade prompt.
          setTimeout(() => setWallOpen(true), 800);
        }
      }
    } catch (e) {
      console.error(e);
      setMessages((p) => [
        ...p,
        { role: "ai", text: t("common.somethingWrong") },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function clearHistory() {
    const ok = await confirm({
      title: t("chat.confirmClearTitle"),
      body: t("chat.confirmClearBody"),
      confirmLabel: t("chat.confirmClearOk"),
      cancelLabel: t("chat.confirmClearCancel"),
      danger: true,
    });
    if (!ok) return;
    setMessages([]);
    initSent.current = true; // prevent auto-resend of initialQ
  }

  // Sidebar action — wipe a chat session from sessionStorage. If the user
  // deletes the chat they're currently in, redirect to General.
  async function deleteSession(s: ChatSession) {
    const ok = await confirm({
      title: t("chat.confirmDeleteTitle"),
      body: t("chat.confirmDeleteBody"),
      confirmLabel: t("chat.confirmDeleteOk"),
      cancelLabel: t("chat.confirmDeleteKeep"),
      danger: true,
    });
    if (!ok) return;
    // Compare sessions and any future shapes know their own storage key —
    // fall back to deriving it from slug for legacy tour sessions only.
    const key = s.storageKey
      ?? (s.isGeneral ? "svitgo.chat.general" : `svitgo.chat.tour.${s.slug}`);
    sessionStorage.removeItem(key);
    if (key === storageKey) {
      setMessages([]);
      initSent.current = true;
    }
    setSessions(listChatSessions(storageKey));
  }

  const empty = messages.length === 0;

  // Starter chip catalogues — three modes, all routed through i18n so a
  // UA reviewer doesn't see English suggestion text. The keys live under
  // chat.starters.{mode}.{1..4} for both en and uk.
  const tourStarters = [
    t("chat.starters.tour.1"),
    t("chat.starters.tour.2"),
    t("chat.starters.tour.3"),
    t("chat.starters.tour.4"),
  ];
  const generalStarters = [
    t("chat.starters.general.1"),
    t("chat.starters.general.2"),
    t("chat.starters.general.3"),
    t("chat.starters.general.4"),
  ];
  const compareStarters = [
    t("chat.starters.compare.1"),
    t("chat.starters.compare.2"),
    t("chat.starters.compare.3"),
    t("chat.starters.compare.4"),
  ];

  // Sidebar appears only once the user actually starts a per-tour chat —
  // until then it would be empty / pointless. When it appears, it shows
  // every chat in the session (general + each tour) for easy switching.
  const hasTourChats = sessions.some((s) => !s.isGeneral);

  // Effective horizontal offset for the centered chat column + the fixed
  // input bar at the bottom. Equals current sidebar width when the sidebar
  // is showing on a lg+ screen, otherwise 0.
  const leftOffset = hasTourChats && isLg ? sidebarWidth : 0;

  // Reusable input markup — rendered inline in the empty state (right under
  // the starter chips) or as a fixed bottom bar once the conversation starts.
  // Same form, just different positioning wrapper.
  // Quota badge shown above the input. Three variants:
  //  - anon: "X of 5 free messages used"
  //  - logged-in free/plus: "X / 20 today" or "X / 100"
  //  - pro: hidden (unlimited)
  const quotaBadge = !user ? (
    <div className="mx-auto mb-2 max-w-2xl text-center">
      <button
        type="button"
        onClick={() => setWallOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-semibold transition-colors",
          anonUsage.reached
            ? "bg-orange-soft/70 text-orange-deep hover:bg-orange-soft"
            : "bg-white/50 text-ink-secondary hover:bg-white/70",
        )}
      >
        {anonUsage.reached
          ? t("chat.quota.anonReached")
          : t("chat.quota.anonRemaining", { remaining: String(anonUsage.remaining), max: String(ANON_LIMIT) })}
      </button>
    </div>
  ) : dailyLimit != null ? (
    <div className="mx-auto mb-2 max-w-2xl text-center text-[11px] text-ink-muted">
      {t("chat.quota.tierLabel", { tier: tiers[tier]?.label ?? tier, limit: String(dailyLimit) })}
    </div>
  ) : null;

  const inputFormInner = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="pointer-events-auto mx-auto max-w-2xl"
    >
      {quotaBadge}
      <div className={cn(
        "glass-strong flex items-end gap-2 rounded-glass p-2 pl-5",
        !user && anonUsage.reached && "opacity-60",
      )}>
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onInput={(e) => {
            const t = e.currentTarget;
            t.style.height = "auto";
            t.style.height = Math.min(t.scrollHeight, 200) + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={!user && anonUsage.reached
            ? t("chat.quota.placeholderBlocked")
            : tour
              ? t("chat.placeholder.tour", { city: tour.city })
              : t("chat.placeholder")}
          disabled={!user && anonUsage.reached}
          className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent py-2 text-base outline-none placeholder:text-ink-muted disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          aria-label={t("chat.send")}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-primary text-white hover:bg-blue-deep transition-colors disabled:opacity-50"
          disabled={!input.trim() || (!user && anonUsage.reached)}
        >
          <ArrowUp size={18} />
        </button>
      </div>
    </form>
  );

  return (
    <>
      <RegisterWallModal open={wallOpen} onClose={() => setWallOpen(false)} />
      {hasTourChats && (
        <ChatSidebar
          sessions={sessions}
          currentKey={storageKey}
          width={sidebarWidth}
          setWidth={(w) =>
            setSidebarWidth(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, w)))
          }
          narrow={sidebarWidth < SIDEBAR_NARROW_THRESHOLD}
          onDelete={deleteSession}
        />
      )}

    <div
      className="min-h-[calc(100vh-120px)] pt-10"
      style={{ paddingLeft: leftOffset }}
    >
    <div className={cn(
      "mx-auto flex max-w-3xl flex-col px-4",
      // Reserve space at the bottom only when the fixed input bar is shown.
      // In the empty state the input lives inline, so no extra padding needed.
      empty ? "pb-12" : "pb-56"
    )}>
      {/* Tour context bar */}
      {tourSlug && tour && (
        <div className="animate-fade-up sticky top-24 z-10 mb-6">
          <GlassCard variant="strong" className="flex items-center gap-3 p-3">
            <Link
              to={`/tour/${tour.id}`}
              className="block h-10 w-10 shrink-0 overflow-hidden rounded-glass"
              aria-label={t("chat.backToTour", { city: tour.city })}
            >
              {/* Show the tour's real hero photo if it has one — falls back
                  to the gradient + emoji combo for tours without uploaded
                  images. */}
              {tour.imageCount > 0 ? (
                <img
                  src={tourHero(tour.id, tour.imageCount) ?? ""}
                  alt={`${tour.city}, ${tour.country}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span
                  className="tinted-bg grid h-full w-full place-items-center text-2xl"
                  style={{ background: tour.gradient }}
                  aria-hidden
                >
                  {tour.emoji}
                </span>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                <MapPin size={12} />
                <span>{tour.country} · {tour.city}</span>
              </div>
              <Link to={`/tour/${tour.id}`} className="truncate text-sm font-bold hover:text-blue-deep">
                {tour.title}
              </Link>
            </div>
            <Link
              to="/ai"
              aria-label={t("chat.exitTourMode")}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-secondary hover:bg-white/60"
            >
              <X size={16} />
            </Link>
          </GlassCard>
        </div>
      )}

      {empty ? (
        // Compact top-anchored hero so the fixed input below never crowds
        // the chips. Title slightly smaller + chips in a 2-col grid keep
        // the block under ~50vh tall on all but the tiniest viewports.
        <div className="mt-[6vh] w-full animate-fade-up text-center">
          {compareTours.length >= 2 && (
            <CompareBanner tours={compareTours} />
          )}
          <h1 className="font-marker text-balance text-6xl leading-tight tracking-tight md:text-7xl">
            {compareTours.length >= 2
              ? t("chat.empty.title.compare")
              : tour
                ? t("chat.empty.title.tour", { city: tour.city })
                : t("chat.empty.title.general")}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-ink-secondary">
            {compareTours.length >= 2
              ? t("chat.empty.subtitle.compare")
              : tour
                ? t("chat.empty.subtitle.tour")
                : t("chat.empty.subtitle.general")}
          </p>

          <div className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
            {(compareTours.length >= 2 ? compareStarters : tour ? tourStarters : generalStarters).map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-glass bg-white/60 px-4 py-2.5 text-left text-sm font-medium hover:bg-white/90"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-6">
          {/* Clear history button when there are messages */}
          <div className="flex items-center justify-end">
            <button
              onClick={clearHistory}
              className="flex items-center gap-1.5 text-xs text-ink-secondary hover:text-ink-primary"
            >
              <Trash2 size={12} />
              {t("chat.clearConversation")}
            </button>
          </div>

          {messages.map((m, i) =>
            m.role === "user" ? (
              <UserBubble key={i} text={m.text} />
            ) : (
              <AiBubble
                key={i}
                msg={m}
                onFollowUp={send}
                onContact={() => setContactOpen(true)}
              />
            )
          )}
          {busy && <TypingDots />}
          <div ref={endRef} />
        </div>
      )}

      {/* Shield only matters when there's a scrolling message list to mask.
          Uses .shield-bottom-fade (CSS variable-based) so it adapts to the
          current theme — Tailwind's `from-cream via-cream/95` couldn't be
          overridden cleanly for dark mode. */}
      {!empty && (
        <div
          aria-hidden
          className="shield-bottom-fade pointer-events-none fixed bottom-0 left-0 right-0 z-[5] h-44 transition-opacity duration-500"
        />
      )}

      {/* Always-fixed input — the SAME element in both states, so we can
          animate `bottom` between the high "near the chips" position and
          the docked "at the page edge" position. Smooth slide, no jump.
          animate-fade-up plays once on first mount so it shares the entry
          animation with the rest of the empty hero. */}
      <div
        className="pointer-events-none fixed right-0 z-20 animate-fade-up px-4 transition-[bottom] duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          left: leftOffset,
          bottom: empty ? "22vh" : "4rem",
        }}
      >
        {inputFormInner}
      </div>

      {contactOpen && (
        <ContactPopup
          organizer={tour?.organizer ?? FALLBACK_ORGANIZER}
          onClose={() => setContactOpen(false)}
        />
      )}
    </div>
    </div>
    </>
  );
}

// ===========================================================================
// Chat sessions — sidebar data layer
// ===========================================================================

interface TourMeta {
  city: string;
  country: string;
  emoji: string;
  gradient: string;
  title: string;
  /** Used by the sidebar avatar — if > 0 we render /tours/{slug}/hero.jpg
   *  instead of the emoji+gradient swatch. */
  imageCount: number;
}
interface ChatSession {
  /** React key + identity */
  key: string;
  /** URL to navigate to when clicked */
  url: string;
  /** Whether this session is the one currently being viewed */
  active: boolean;
  isGeneral: boolean;
  /** True for compare-mode sessions (multi-tour). */
  isCompare?: boolean;
  /** For tour sessions */
  slug?: string;
  emoji?: string;
  gradient?: string;
  /** Hero image path — if present, sidebar uses it instead of emoji avatar */
  heroSrc?: string | null;
  /** For compare sessions — up to 4 hero paths for the 2x2 collage. */
  collage?: (string | null)[];
  /** Display fields */
  title: string;
  subtitle: string;
  /** For compare sessions — used by delete() to know the full storage key. */
  storageKey?: string;
}

const TOUR_META_KEY = "svitgo.chat.tour-meta";

function readTourMeta(): Record<string, TourMeta> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(TOUR_META_KEY);
    return raw ? (JSON.parse(raw) as Record<string, TourMeta>) : {};
  } catch { return {}; }
}
function writeTourMeta(slug: string, meta: TourMeta) {
  if (typeof window === "undefined") return;
  try {
    const all = readTourMeta();
    all[slug] = meta;
    sessionStorage.setItem(TOUR_META_KEY, JSON.stringify(all));
  } catch { /* quota exceeded — ignore */ }
}

/** Scan sessionStorage for all chat keys that still have messages. */
function listChatSessions(currentKey: string): ChatSession[] {
  if (typeof window === "undefined") return [];
  const out: ChatSession[] = [];
  const meta = readTourMeta();

  // General chat — always shown if there are any messages
  try {
    const raw = sessionStorage.getItem("svitgo.chat.general");
    if (raw) {
      const msgs = JSON.parse(raw) as Msg[];
      if (Array.isArray(msgs) && msgs.length > 0) {
        out.push({
          key: "general",
          url: "/ai",
          active: currentKey === "svitgo.chat.general",
          isGeneral: true,
          // Sidebar title — i18n key is resolved by the consumer when rendering.
          // We use a sentinel string here because listChatSessions is a pure
          // function and doesn't have access to the React i18n context.
          title: "__general__",
          subtitle: previewOf(msgs),
        });
      }
    }
  } catch { /* ignore */ }

  // Per-tour chats — one row per slug with messages
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (!k?.startsWith("svitgo.chat.tour.")) continue;
    const slug = k.replace("svitgo.chat.tour.", "");
    try {
      const msgs = JSON.parse(sessionStorage.getItem(k) || "[]") as Msg[];
      if (!Array.isArray(msgs) || msgs.length === 0) continue;
      const m = meta[slug];
      out.push({
        key: `tour:${slug}`,
        url: `/ai?tour=${slug}`,
        active: currentKey === k,
        isGeneral: false,
        slug,
        emoji: m?.emoji,
        gradient: m?.gradient,
        heroSrc: m ? tourHero(slug, m.imageCount ?? 0) : null,
        title: m?.city ?? slug,
        subtitle: previewOf(msgs),
        storageKey: k,
      });
    } catch { /* ignore malformed entry */ }
  }

  // Compare-mode chats — one row per slug-combination with messages.
  // Storage key shape: svitgo.chat.compare.<slug1>,<slug2>,...
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (!k?.startsWith("svitgo.chat.compare.")) continue;
    const payload = k.replace("svitgo.chat.compare.", "");
    // Split on comma — hyphens are part of slugs, see storageKey above.
    const slugs = payload.split(",").map((s) => s.trim()).filter(Boolean);
    if (slugs.length < 2) continue;
    try {
      const msgs = JSON.parse(sessionStorage.getItem(k) || "[]") as Msg[];
      if (!Array.isArray(msgs) || msgs.length === 0) continue;
      // Friendly title joins the first two city names; "+N" suffix added
      // when there are more tours in the comparison.
      const cities = slugs.map((s) => meta[s]?.city).filter(Boolean) as string[];
      const allCities = slugs.map((s) => meta[s]?.city ?? s);
      const title = cities.length >= 2
        ? `${cities[0]} · ${cities[1]}${slugs.length > 2 ? ` +${slugs.length - 2}` : ""}`
        : cities.length === 1
          ? `${cities[0]} +${slugs.length - 1}`
          : `${slugs.length} tours`;
      // Collage: gather hero paths for the first 4 tours so the sidebar
      // can render a 2x2 grid instead of a single avatar.
      const collage = slugs.slice(0, 4).map((s) => {
        const m = meta[s];
        return m ? tourHero(s, m.imageCount ?? 0) : null;
      });
      out.push({
        key: `compare:${slugs.join(",")}`,
        url: `/ai?compare=${slugs.join(",")}`,
        active: currentKey === k,
        isGeneral: false,
        isCompare: true,
        slug: slugs[0],
        collage,
        title,
        subtitle: allCities.length > 0
          ? `Compare: ${allCities.join(" · ")}`
          : previewOf(msgs),
        storageKey: k,
      });
    } catch { /* ignore malformed entry */ }
  }

  return out;
}
function previewOf(msgs: Msg[]): string {
  const last = msgs[msgs.length - 1];
  const text = last?.text ?? "";
  return text.length > 60 ? text.slice(0, 60).trimEnd() + "…" : text;
}

/**
 * 9x9 avatar tile for compare-mode sidebar rows. Layout adapts to the
 * number of tours so a 2-tour comparison shows two halves instead of two
 * filled cells + two empty placeholders.
 *   2 → 2 cols × 1 row
 *   3 → first image spans full width, then 2 cells below
 *   4 → 2x2
 * Missing hero (imageCount=0 on a freshly created tour) renders a soft
 * blue→orange gradient placeholder — distinct from the cream surface so
 * it doesn't read as "nothing here".
 */
function CompareAvatar({ collage }: { collage: (string | null)[] }) {
  const imgs = collage.slice(0, 4);
  const n = imgs.length;

  const Cell = ({ src, className }: { src: string | null; className?: string }) =>
    src ? (
      <img src={src} alt="" loading="lazy" className={cn("h-full w-full object-cover", className)} />
    ) : (
      <span
        className={cn(
          "block h-full w-full bg-gradient-to-br from-blue-primary/40 to-orange-accent/40",
          className,
        )}
      />
    );

  if (n <= 1) {
    return (
      <span className="h-9 w-9 shrink-0 overflow-hidden rounded-glass">
        <Cell src={imgs[0] ?? null} />
      </span>
    );
  }
  if (n === 2) {
    return (
      <span className="grid h-9 w-9 shrink-0 grid-cols-2 gap-px overflow-hidden rounded-glass bg-white/40">
        <Cell src={imgs[0]} />
        <Cell src={imgs[1]} />
      </span>
    );
  }
  if (n === 3) {
    return (
      <span className="grid h-9 w-9 shrink-0 grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-glass bg-white/40">
        <span className="col-span-2 h-full"><Cell src={imgs[0]} /></span>
        <Cell src={imgs[1]} />
        <Cell src={imgs[2]} />
      </span>
    );
  }
  return (
    <span className="grid h-9 w-9 shrink-0 grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-glass bg-white/40">
      <Cell src={imgs[0]} />
      <Cell src={imgs[1]} />
      <Cell src={imgs[2]} />
      <Cell src={imgs[3]} />
    </span>
  );
}

/**
 * Banner shown above the chat hero when the user landed here from the
 * Compare page. Lists the tours by short label so the AI's context is
 * also visible to the human — no "wait, what was it analysing?".
 */
function CompareBanner({ tours }: { tours: Tour[] }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto mb-6 flex max-w-2xl flex-wrap items-center justify-center gap-2 rounded-glass bg-gradient-to-r from-blue-primary/15 to-orange-accent/15 px-4 py-3 text-sm text-ink-secondary">
      <Sparkles size={14} className="text-blue-deep" />
      <span className="font-semibold text-ink-primary">{t("chat.comparing")}</span>
      {tours.map((tt, i) => (
        <span key={tt.id} className="inline-flex items-center">
          <Link to={`/tour/${tt.id}`} className="font-medium text-blue-deep hover:underline">
            {tt.city}
          </Link>
          {i < tours.length - 1 && <span className="mx-1 text-ink-muted">·</span>}
        </span>
      ))}
    </div>
  );
}

/** Tiny media-query hook — used to gate sidebar offset to lg+ only. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    const h = () => setMatches(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [query]);
  return matches;
}

/**
 * Fixed left-rail sidebar (ChatGPT-style) listing all active chats in this
 * session. Width is user-draggable via the handle on the right edge; below
 * the narrow threshold the rows collapse to just the photo.
 *
 * Background is intentionally transparent — the page's ambient liquid
 * gradient shows through, matching the rest of the chat surface. Only the
 * row chips themselves carry colour.
 */
function ChatSidebar({
  sessions,
  width,
  setWidth,
  narrow,
  onDelete,
}: {
  sessions: ChatSession[];
  currentKey: string;
  width: number;
  setWidth: (w: number) => void;
  narrow: boolean;
  onDelete: (s: ChatSession) => void;
}) {
  const { t } = useI18n();
  // Drag-to-resize logic. We attach listeners to window during the drag so
  // the cursor can leave the handle freely and the resize keeps tracking.
  const dragging = useRef(false);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      setWidth(e.clientX);
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [setWidth]);

  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <aside
      className="fixed bottom-0 left-0 top-24 z-10 hidden flex-col overflow-y-auto py-4 lg:flex"
      style={{ width }}
    >
      {/* Header — hidden once the rail collapses to photo-only. The "+"
          button stays accessible via the Link on each chat row. */}
      {!narrow && (
        <div className="mb-3 flex items-center justify-between px-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t("chat.yourChats")}
          </h2>
          <Link
            to="/ai"
            aria-label={t("chat.openGeneral")}
            title="Open / start general chat"
            className="grid h-7 w-7 place-items-center rounded-full text-ink-secondary hover:bg-white/60 hover:text-ink-primary"
          >
            <Plus size={14} />
          </Link>
        </div>
      )}

      <ul className={cn("space-y-1.5", narrow ? "px-1.5" : "px-2")}>
        {sessions.map((s) => (
          <li key={s.key} className="group relative">
            <Link
              to={s.url}
              title={narrow ? `${s.title} — ${s.subtitle}` : undefined}
              className={cn(
                "flex rounded-glass border border-transparent text-left transition-colors",
                // Narrow mode → centered photo, no text, no chip background
                narrow
                  ? "items-center justify-center p-1.5"
                  : "items-start gap-3 p-2.5 pr-9",
                s.active
                  ? narrow
                    ? "border-blue-primary/40"
                    : "border-blue-primary/30 bg-white/85 shadow-soft"
                  : narrow
                    ? "hover:bg-white/50"
                    : "bg-white/40 hover:bg-white/70"
              )}
            >
              {/* Avatar — tour photo when available, 2x2 collage for compare
                  sessions, otherwise emoji on the gradient swatch. General
                  chat keeps the SvitGo sparkles mark. */}
              {s.isGeneral ? (
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-primary to-blue-deep text-white">
                  <Sparkles size={14} />
                </span>
              ) : s.isCompare && s.collage ? (
                <CompareAvatar collage={s.collage} />
              ) : s.heroSrc ? (
                <img
                  src={s.heroSrc}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-glass object-cover"
                  loading="lazy"
                />
              ) : (
                <span
                  className="tinted-bg grid h-9 w-9 shrink-0 place-items-center rounded-glass text-lg"
                  style={{ background: s.gradient ?? "rgba(91,143,249,0.18)" }}
                  aria-hidden
                >
                  {s.emoji ?? "🧭"}
                </span>
              )}
              {!narrow && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-primary">
                    {s.title === "__general__" ? t("chat.general") : s.title}
                  </span>
                  <span className="block truncate text-xs text-ink-secondary">
                    {s.subtitle}
                  </span>
                </span>
              )}
            </Link>
            {/* Delete button only in wide mode — there's no room (and no
                clear affordance) for it next to a bare photo. */}
            {!narrow && (
              <button
                type="button"
                onClick={() => onDelete(s)}
                aria-label={t("chat.deleteChatAria", { title: s.title === "__general__" ? t("chat.general") : s.title })}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-ink-muted opacity-0 transition-opacity hover:bg-white hover:text-orange-deep group-hover:opacity-100 focus:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* Resize handle — thin strip on the right edge. Wide enough to grab
          comfortably; only the inner 2px draws a visible line on hover.
          aria-orientation makes it announce as a horizontal resizer. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("chat.resizeAria")}
        onMouseDown={startDrag}
        onDoubleClick={() => setWidth(256)}
        title="Drag to resize · double-click to reset"
        className="group/handle absolute right-0 top-0 h-full w-2 cursor-col-resize"
      >
        <span className="absolute right-0 top-0 h-full w-px bg-transparent transition-colors group-hover/handle:bg-blue-primary/30" />
      </div>
    </aside>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

function loadMessages(key: string): Msg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Msg[]) : [];
  } catch { return []; }
}
function saveMessages(key: string, msgs: Msg[]) {
  if (typeof window === "undefined") return;
  try {
    if (msgs.length === 0) {
      sessionStorage.removeItem(key);
      return;
    }
    // Strip the volatile `fresh` flag — restored messages should NOT replay
    // the fade-in animation on every navigation.
    const sanitized = msgs.map((m) => {
      if (m.role !== "ai") return m;
      const { fresh: _ignore, ...rest } = m as Extract<Msg, { role: "ai" }>;
      return rest;
    });
    sessionStorage.setItem(key, JSON.stringify(sanitized));
  } catch { /* sessionStorage full or unavailable — ignore */ }
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex animate-fade-up justify-end">
      <div
        className="max-w-[80%] rounded-glass px-5 py-3 text-sm font-medium text-ink-primary shadow-soft"
        style={{
          background:
            "linear-gradient(135deg, rgba(191,217,255,0.65) 0%, rgba(255,208,176,0.55) 100%)",
        }}
      >
        {text}
      </div>
    </div>
  );
}

function AiBubble({
  msg,
  onFollowUp,
  onContact,
}: {
  msg: Extract<Msg, { role: "ai" }>;
  onFollowUp: (q: string) => void;
  onContact: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="animate-fade-up">
      <p className="whitespace-pre-line text-lg leading-relaxed text-ink-primary text-balance">
        <FadingText text={msg.text} instant={!msg.fresh} />
      </p>

      {msg.tours && msg.tours.length > 0 && (
        <div className="stagger-grid mt-6 grid gap-4 sm:grid-cols-2">
          {msg.tours.map((t, i) => (
            <TourCard
              key={t.id}
              tour={t}
              openInNewTab
              style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {msg.needsHumanContact && (
        <button
          type="button"
          onClick={onContact}
          className="mt-4 inline-flex items-center gap-2 rounded-pill bg-blue-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-deep"
        >
          <Phone size={14} />
          {t("chat.contactOrganiser")}
        </button>
      )}

      {msg.followUps && msg.followUps.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {msg.followUps.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onFollowUp(q)}
              className="chip chip-cream hover:bg-white/80"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "AI is thinking" indicator. For the first 2 seconds it shows the generic
 * "thinking" message. If the request takes longer (tool calls etc), it
 * switches to a more specific "Searching tours..." so the user understands
 * something heavier is happening — not just stuck.
 */
function TypingDots() {
  const { t } = useI18n();
  const [phase, setPhase] = useState<"thinking" | "searching">("thinking");
  useEffect(() => {
    const timer = setTimeout(() => setPhase("searching"), 2000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="flex items-center gap-2 text-sm text-ink-secondary">
      <span className="inline-flex gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-secondary" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-secondary [animation-delay:.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-secondary [animation-delay:.3s]" />
      </span>
      {phase === "thinking" ? t("chat.thinking") : t("chat.searching")}
    </div>
  );
}

function ContactPopup({ organizer, onClose }: { organizer: Organizer; onClose: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // Lock body scroll while the modal is open so the backdrop fully takes over
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const isPrivate = organizer.type === "private";
  const initial = organizer.name.trim().charAt(0).toUpperCase();

  // Portal to document.body so the backdrop escapes any parent stacking
  // context (ChatPage wrapper was clipping it under the fixed header).
  // z-[100] is well above the header (z-30) so it covers everything.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-ink-primary/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <GlassCard
        variant="floating"
        className="w-full max-w-sm p-6 text-center animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={cn(
            "mx-auto grid h-14 w-14 place-items-center rounded-full text-xl font-extrabold text-white",
            isPrivate
              ? "bg-gradient-to-br from-orange-accent to-blue-primary"
              : "bg-gradient-to-br from-blue-primary to-blue-deep"
          )}
        >
          {initial}
        </div>
        <h3 className="mt-4 text-xl font-extrabold">{organizer.name}</h3>
        <span className={cn("chip mt-2 inline-flex text-xs", isPrivate ? "chip-orange" : "chip-blue")}>
          {isPrivate ? (
            <>
              <UserIcon size={12} />
              {t("contact.privateGuide")}
            </>
          ) : (
            <>
              <Briefcase size={12} />
              {t("contact.tourOperator")}
            </>
          )}
        </span>
        <p className="mt-3 text-sm text-ink-secondary">{organizer.bio}</p>
        {organizer.rating != null && (
          <div className="mt-3 flex justify-center gap-3 text-xs text-ink-muted">
            <span>★ {organizer.rating.toFixed(1)} · {organizer.reviewsCount} {organizer.reviewsCount === 1 ? t("contact.review") : t("contact.reviews")}</span>
          </div>
        )}
        <div className="mt-5 space-y-2">
          <ContactRow icon={<Phone size={16} />} label={t("contact.phone")} value={organizer.phone} href={`tel:${organizer.phone.replace(/\s/g, "")}`} />
          {organizer.whatsapp && (
            <ContactRow icon={<MessageCircle size={16} />} label={t("contact.whatsapp")} value={organizer.whatsapp} href={`https://wa.me/${organizer.whatsapp.replace(/[^\d]/g, "")}`} />
          )}
          <ContactRow icon={<Mail size={16} />} label={t("contact.email")} value={organizer.email} href={`mailto:${organizer.email}`} />
        </div>
        {organizer.slug !== "svitgo-support" && (
          <Link
            to={`/operator/${organizer.slug}`}
            onClick={onClose}
            className="btn btn-primary mt-5 w-full justify-center"
          >
            {t("contact.viewProfile")} →
          </Link>
        )}
        <button onClick={onClose} className="btn btn-ghost mt-2 w-full justify-center">
          {t("common.close")}
        </button>
      </GlassCard>
    </div>,
    document.body
  );
}

function ContactRow({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string; href: string }) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel="noreferrer"
      className="flex items-center gap-3 rounded-glass bg-white/60 px-4 py-3 text-left transition-colors hover:bg-white"
    >
      <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-primary text-white">{icon}</span>
      <span className="flex-1">
        <span className="block text-xs font-bold uppercase tracking-wider text-ink-muted">{label}</span>
        <span className="block text-sm font-semibold text-ink-primary">{value}</span>
      </span>
    </a>
  );
}

