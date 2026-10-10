import { api, getApiBase } from "./client";
import type {
  AdminAuthResponse,
  AdminBookingRow,
  AdminMe,
  AdminOrganizerRow,
  AdminTourDetails,
  AdminTourSummary,
  AiChatResponse,
  AuthResponse,
  Booking,
  CurrencyCode,
  CurrencyRatesResponse,
  OrganizerAuthResponse,
  OrganizerBookingRow,
  OrganizerMe,
  OrganizerProfile,
  OrganizerTourEditable,
  Review,
  SubscriptionState,
  SubscriptionTier,
  Tour,
  TourModerationStatus,
  Traveler,
  User,
} from "./types";

export * from "./client";
export * from "./types";

// ---------- Tours ----------
export interface ToursQuery {
  themes?: string[];
  priceMin?: number;
  priceMax?: number;
  nightsMin?: number;
  nightsMax?: number;
  stars?: number[];
  countries?: string[];
  meals?: string[];
  discount?: boolean;
  q?: string;
  sort?: "popular" | "price-asc" | "price-desc" | "rating" | "newest" | "discount" | "duration";
  limit?: number;
  offset?: number;
  /** ISO YYYY-MM-DD — keep only tours that have a departure on/after this date */
  departFrom?: string;
  departTo?: string;
}
export interface ToursBounds {
  priceMin: number;
  priceMax: number;
  nightsMin: number;
  nightsMax: number;
}
export interface ToursListResponse {
  items: Tour[];
  total: number;
  /** Min/max price and duration across the full matching catalog —
   *  populated only on the first page (offset=0) so the client can
   *  anchor range-slider bounds. */
  bounds?: ToursBounds;
}
export function fetchTours(query: ToursQuery = {}) {
  return api<ToursListResponse>("/api/tours", {
    query: {
      ...query,
      themes: query.themes,
      stars: query.stars?.map(String),
      countries: query.countries,
      meals: query.meals,
    },
  });
}
export function fetchTour(slug: string) {
  return api<Tour>(`/api/tours/${slug}`);
}

// ---------- Auth ----------
export function login(email: string, password: string) {
  return api<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
}
export function register(email: string, password: string, name: string) {
  return api<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: { email, password, name },
  });
}
export function fetchMe() {
  return api<User>("/api/auth/me");
}
export function updatePrefs(patch: Partial<Pick<User, "budgetFrom" | "budgetTo" | "favThemes" | "travelFreq" | "companion" | "citizenship">>) {
  return api<User>("/api/auth/prefs", {
    method: "PATCH",
    body: patch,
  });
}

// ---------- Bookings ----------
export function fetchBookings() {
  return api<Booking[]>("/api/bookings");
}
export function createBooking(payload: {
  tourSlug: string;
  travelers: Traveler[];
  contact: { email: string; phone: string };
  addOns?: string[];
  /** ISO date (YYYY-MM-DD) of departure */
  startDate?: string;
  /** Free-form note for the organizer (dietary, mobility, anniversaries…) */
  specialRequest?: string;
  /** Display currency the user saw at checkout (snapshot). Defaults to EUR. */
  currency?: CurrencyCode;
  /** Idempotency key — caller MUST generate ONE key per "intent to book" and
   *  pass the same one on every retry. Without this, a double-click + retry
   *  would create two bookings because each call would receive a fresh UUID. */
  idempotencyKey: string;
}) {
  const { idempotencyKey, ...body } = payload;
  return api<Booking>("/api/bookings", {
    method: "POST",
    body,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

/**
 * Generate a fresh idempotency key. Call this ONCE when the user lands on
 * the booking page (or starts a checkout intent), then reuse for any retry.
 */
export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---------- Saved ----------
export function fetchSaved() {
  return api<string[]>("/api/saved");
}
export function toggleSaved(tourSlug: string) {
  return api<{ saved: boolean }>("/api/saved/toggle", {
    method: "POST",
    body: { tourSlug },
  });
}

// ---------- AI ----------
export function aiChat(
  query: string,
  history: { role: "user" | "ai"; text: string }[] = [],
  locale: "en" | "uk" = "en"
) {
  return api<AiChatResponse>("/api/ai/chat", {
    method: "POST",
    body: { query, history, locale },
  });
}

export interface AskTourResponse {
  reply: string;
  needsHumanContact: boolean;
  suggestedFollowUps: string[];
}
export function askTour(
  tourSlug: string,
  question: string,
  history: { role: "user" | "ai"; text: string }[] = [],
  locale: "en" | "uk" = "en"
) {
  return api<AskTourResponse>("/api/ai/ask-tour", {
    method: "POST",
    body: { tourSlug, question, history, locale },
  });
}

export interface ExplainPickResponse {
  text: string;
  signals: string[];
  matchScore: number;
  personal: boolean;
}
export function explainPick(tourSlug: string) {
  return api<ExplainPickResponse>("/api/ai/explain-pick", {
    method: "POST",
    body: { tourSlug },
  });
}

export interface CompareAnalysis {
  slug: string;
  pros: string[];
  cons: string[];
  bestFor: string;
}
export interface CompareAnalysisResponse {
  analyses: CompareAnalysis[];
}
export function compareAnalysis(tourSlugs: string[], locale: "en" | "uk" = "en") {
  return api<CompareAnalysisResponse>("/api/ai/compare-analysis", {
    method: "POST",
    body: { tourSlugs, locale },
  });
}

// ---------- Analytics ----------
export interface AnalyticsSummary {
  totals: { tours: number; bookings: number; reviews: number; aiQueries: number };
  last30days: { bookings: number; reviews: number; aiQueries: number };
  topTours: {
    slug: string;
    country: string;
    city: string;
    title: string;
    bookings: number;
    reviews: number;
    saves: number;
    aiMentions: number;
    score: number;
  }[];
}
export function fetchAnalyticsSummary() {
  return api<AnalyticsSummary>("/api/analytics/summary");
}

// ---------- Map data ----------
export interface MapData {
  countries: { name: string; topoName: string; tours: number }[];
  cities:    { name: string; country: string; coords: [number, number]; tours: number }[];
}
export function fetchMapData() {
  return api<MapData>("/api/tours/map-data");
}

// ---------- Organizers ----------
export function fetchOrganizer(slug: string) {
  return api<OrganizerProfile>(`/api/organizers/${slug}`);
}

// ---------- Currency ----------
export function fetchCurrencyRates() {
  return api<CurrencyRatesResponse>("/api/currency/rates");
}

// ---------- Subscriptions ----------
export function fetchSubscription() {
  return api<SubscriptionState>("/api/subscriptions/me");
}
export function startSubscription(tier: Exclude<SubscriptionTier, "free">) {
  return api<{ tier: SubscriptionTier; renewsAt: string; cancelledAt: string | null }>(
    "/api/subscriptions/start",
    { method: "POST", body: { tier } },
  );
}
export function cancelSubscription() {
  return api<{ tier: SubscriptionTier; renewsAt: string; cancelledAt: string | null }>(
    "/api/subscriptions/cancel",
    { method: "POST" },
  );
}

// ---------- Organizer cabinet ----------
export function organizerLogin(email: string, password: string) {
  return api<OrganizerAuthResponse>("/api/organizers/auth/login", {
    method: "POST",
    body: { email, password },
    auth: "none",
  });
}
export function fetchOrganizerMe() {
  return api<OrganizerMe>("/api/organizers/auth/me", { auth: "organizer" });
}
export function fetchOrganizerTours() {
  return api<OrganizerTourEditable[]>("/api/organizer/tours", { auth: "organizer" });
}
export function updateOrganizerTour(slug: string, patch: Partial<Omit<OrganizerTourEditable, "slug" | "createdAt" | "imageCount" | "popularity" | "publishedAt" | "status" | "rejectionReason">>) {
  return api<{ ok: boolean; slug: string; status?: TourModerationStatus; bumpedToPending?: boolean }>(`/api/organizer/tours/${slug}`, {
    method: "PATCH",
    body: patch,
    auth: "organizer",
  });
}

export interface CreateOrganizerTourPayload {
  title: string;
  country: string;
  city: string;
  region?: string;
  shortDescription?: string;
  description?: string;
  price: number;
  durationNights?: number;
  hotelStars?: number;
  meal?: string;
}
export function createOrganizerTour(payload: CreateOrganizerTourPayload) {
  return api<{ slug: string }>("/api/organizer/tours", {
    method: "POST",
    body: payload,
    auth: "organizer",
  });
}

export function toggleOrganizerTourStatus(slug: string, status: "active" | "disabled") {
  return api<{ ok: boolean; status: TourModerationStatus }>(`/api/organizer/tours/${slug}/status`, {
    method: "PATCH",
    body: { status },
    auth: "organizer",
  });
}

export function fetchOrganizerBookings() {
  return api<OrganizerBookingRow[]>("/api/organizer/bookings", { auth: "organizer" });
}
export function updateOrganizerProfile(patch: {
  name?: string; bio?: string; phone?: string; whatsapp?: string | null; yearsActive?: number;
}) {
  return api<OrganizerMe>("/api/organizer/profile", {
    method: "PATCH",
    body: patch,
    auth: "organizer",
  });
}

/** Multipart upload — hero or gallery */
export async function uploadOrganizerImage(
  slug: string,
  file: File,
  kind: "hero" | "gallery",
): Promise<{ ok: boolean; imageCount: number; addedIndex?: number }> {
  const form = new FormData();
  form.append("image", file);
  return api(`/api/organizer/tours/${slug}/${kind}`, {
    method: "POST",
    body: form,
    raw: true,
    auth: "organizer",
  });
}

export function deleteOrganizerGalleryImage(slug: string, idx: number) {
  return api<{ ok: boolean; imageCount: number }>(`/api/organizer/tours/${slug}/gallery/${idx}`, {
    method: "DELETE",
    auth: "organizer",
  });
}

// ---------- Admin cabinet ----------
export function adminLogin(email: string, password: string) {
  return api<AdminAuthResponse>("/api/admin/auth/login", {
    method: "POST",
    body: { email, password },
    auth: "none",
  });
}
export function fetchAdminMe() {
  return api<AdminMe>("/api/admin/auth/me", { auth: "admin" });
}
export function fetchAdminTours(status?: TourModerationStatus) {
  return api<AdminTourSummary[]>("/api/admin/tours", {
    auth: "admin",
    query: status ? { status } : undefined,
  });
}
export function fetchAdminTour(slug: string) {
  return api<AdminTourDetails>(`/api/admin/tours/${slug}`, { auth: "admin" });
}
export function approveAdminTour(slug: string) {
  return api<{ ok: boolean; slug: string; status: TourModerationStatus }>(
    `/api/admin/tours/${slug}/approve`,
    { method: "POST", auth: "admin" },
  );
}
export function rejectAdminTour(slug: string, reason: string) {
  return api<{ ok: boolean; slug: string; status: TourModerationStatus }>(
    `/api/admin/tours/${slug}/reject`,
    { method: "POST", body: { reason }, auth: "admin" },
  );
}
export function deleteAdminTour(slug: string) {
  return api<{ ok: boolean }>(`/api/admin/tours/${slug}`, {
    method: "DELETE",
    auth: "admin",
  });
}
export function fetchAdminBookings() {
  return api<AdminBookingRow[]>("/api/admin/bookings", { auth: "admin" });
}
export type AdminBookingStatus = "confirmed" | "completed" | "cancelled";
export function updateAdminBookingStatus(id: number, status: AdminBookingStatus) {
  return api<{ ok: boolean; id: number; status: AdminBookingStatus }>(
    `/api/admin/bookings/${id}`,
    { method: "PATCH", body: { status }, auth: "admin" },
  );
}
export function fetchAdminOrganizers() {
  return api<AdminOrganizerRow[]>("/api/admin/organizers", { auth: "admin" });
}
export function fetchAdminAdminsList() {
  return api<AdminMe[]>("/api/admin/admins", { auth: "admin" });
}
export function createAdminAdmin(payload: { email: string; name: string; password: string; role?: "admin" | "super" }) {
  return api<AdminMe>("/api/admin/admins", {
    method: "POST",
    body: payload,
    auth: "admin",
  });
}
export function deleteAdminAdmin(id: number) {
  return api<{ ok: boolean }>(`/api/admin/admins/${id}`, {
    method: "DELETE",
    auth: "admin",
  });
}

// ---------- Reviews ----------
export function fetchTourReviews(slug: string) {
  return api<Review[]>(`/api/reviews/tour/${slug}`);
}
export function createReview(payload: {
  bookingId: number;
  rating: number;
  title: string;
  body: string;
  photos?: string[];
}) {
  return api<Review>("/api/reviews", {
    method: "POST",
    body: payload,
  });
}
