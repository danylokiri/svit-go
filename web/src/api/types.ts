// Shared API types (mirrors server payloads)

export type Theme =
  | "water"
  | "mountains"
  | "snow"
  | "temples"
  | "food"
  | "market"
  | "wellness"
  | "adventure"
  | "romantic"
  | "family"
  | "cities"
  | "nature";

export interface ProgramDay {
  day: number;
  title: string;
  text: string;
}

export interface Organizer {
  slug: string;
  name: string;
  type: "company" | "private";
  bio: string;
  email: string;
  phone: string;
  whatsapp?: string;
  /** Average rating across all reviews on all their tours, or null if no reviews. */
  rating: number | null;
  reviewsCount: number;
  toursCount: number;
  yearsActive: number;
}

/** Full operator profile returned by /api/organizers/:slug — includes tours + reviews. */
export interface OrganizerProfile extends Organizer {
  tripsRun: number;
  tours: Array<{
    id: string;
    country: string;
    city: string;
    title: string;
    themes: Theme[];
    durationNights: number;
    hotelStars: number;
    meal: string;
    price: number;
    oldPrice?: number;
    rating: number;
    reviews: number;
    badge?: "hot" | "ai" | "new";
    emoji: string;
    gradient: string;
    imageCount: number;
    popularity: number;
    shortDescription: string;
  }>;
  reviews: Array<{
    id: number;
    rating: number;
    title: string;
    body: string;
    photos: string[];
    createdAt: string;
    user: { name: string };
    tour: { slug: string; country: string; city: string; title: string };
  }>;
}

export interface Tour {
  id: string;            // slug
  country: string;
  city: string;
  region: string;
  title: string;
  shortDescription: string;
  description: string;
  highlights: string[];
  included: string[];
  excluded: string[];
  program: ProgramDay[];
  themes: Theme[];
  durationNights: number;
  hotelStars: number;
  meal: string;
  price: number;
  oldPrice?: number;
  rating: number;
  reviews: number;
  badge?: "hot" | "ai" | "new";
  /** Personal match score 0-100. Only present when user is authenticated. */
  matchScore?: number;
  emoji: string;
  gradient: string;
  imageCount: number;
  popularity: number;
  organizer: Organizer | null;
  /** Future-only ISO departure dates (YYYY-MM-DD). Empty if "flexible / contact organiser". */
  departures: string[];
  /** When the tour becomes publicly visible. Used for early-access gating. */
  publishedAt: string;
  createdAt: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  budgetFrom: number | null;
  budgetTo: number | null;
  favThemes: Theme[];
  travelFreq: string | null;
  companion: string | null;
  citizenship: string | null;
  preferredCurrency?: string | null;
  preferredLocale?: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
//  Subscriptions
// ---------------------------------------------------------------------------
export type SubscriptionTier = "free" | "plus" | "pro";

export interface TierFeatures {
  aiDailyLimit: number | null;
  earlyAccessHours: number;
  cancelWindowHours: number;
  conciergeEnabled: boolean;
  label: string;
  monthlyPriceEUR: number;
}

export interface SubscriptionState {
  tier: SubscriptionTier;
  renewsAt: string | null;
  cancelledAt: string | null;
  tiers: Record<SubscriptionTier, TierFeatures>;
}

// ---------------------------------------------------------------------------
//  Currency
// ---------------------------------------------------------------------------
export type CurrencyCode =
  | "EUR" | "USD" | "UAH" | "PLN" | "GBP" | "CZK" | "CHF" | "TRY";

export interface CurrencyRatesResponse {
  base: "EUR";
  rates: Record<CurrencyCode, number>;
  symbols: Record<CurrencyCode, string>;
  supported: CurrencyCode[];
}

// ---------------------------------------------------------------------------
//  Organizer cabinet — owner-only types
// ---------------------------------------------------------------------------
export interface OrganizerMe {
  id: number;
  slug: string;
  name: string;
  type: "company" | "private";
  bio: string;
  email: string;
  phone: string;
  whatsapp: string | null;
  yearsActive: number;
  avatarUrl: string | null;
  verified: boolean;
  createdAt: string;
}

export interface OrganizerAuthResponse {
  token: string;
  organizer: OrganizerMe;
}

export type TourModerationStatus = "pending" | "active" | "disabled" | "rejected";

export interface OrganizerTourEditable {
  slug: string;
  title: string;
  country: string;
  city: string;
  price: number;
  oldPrice: number | null;
  durationNights: number;
  hotelStars: number;
  meal: string;
  imageCount: number;
  popularity: number;
  shortDescription: string;
  description: string;
  themes: Theme[];
  highlights: string[];
  included: string[];
  excluded: string[];
  program: ProgramDay[];
  departures: string[];
  publishedAt: string;
  createdAt: string;
  status: TourModerationStatus;
  rejectionReason: string | null;
}

// ---------------------------------------------------------------------------
//  Admin cabinet
// ---------------------------------------------------------------------------
export type AdminRole = "admin" | "super";

export interface AdminMe {
  id: number;
  email: string;
  name: string;
  role: AdminRole;
  createdAt: string;
}

export interface AdminAuthResponse {
  token: string;
  admin: AdminMe;
}

export interface AdminTourSummary {
  slug: string;
  title: string;
  country: string;
  city: string;
  price: number;
  durationNights: number;
  imageCount: number;
  status: TourModerationStatus;
  rejectionReason: string | null;
  createdAt: string;
  organizer: {
    id: number;
    slug: string;
    name: string;
    email: string;
    phone: string;
  } | null;
}

export interface AdminTourDetails extends AdminTourSummary {
  region?: string;
  shortDescription: string;
  description: string;
  themes: Theme[];
  highlights: string[];
  included: string[];
  excluded: string[];
  program: ProgramDay[];
  departures: string[];
  hotelStars: number;
  meal: string;
  oldPrice: number | null;
  publishedAt: string;
  bookingsCount: number;
  reviewsCount: number;
  organizer:
    | (AdminTourSummary["organizer"] & {
        whatsapp?: string | null;
        type?: "company" | "private";
        verified?: boolean;
        yearsActive?: number;
      })
    | null;
}

export interface AdminBookingRow {
  id: number;
  travelers: Traveler[];
  contact: { email: string; phone: string };
  addOns: string[];
  totalPrice: number;
  currency: string;
  totalInCurrency: number | null;
  specialRequest: string | null;
  status: string;
  startDate: string | null;
  createdAt: string;
  user: { id: number; email: string; name: string } | null;
  tour: {
    slug: string;
    title: string;
    country: string;
    city: string;
    status: TourModerationStatus;
  };
  organizer: { id: number; name: string; slug: string; email: string } | null;
}

export interface AdminOrganizerRow {
  id: number;
  slug: string;
  name: string;
  type: "company" | "private";
  email: string;
  phone: string;
  whatsapp: string | null;
  yearsActive: number;
  verified: boolean;
  createdAt: string;
  toursCount: number;
}

export interface OrganizerBookingRow {
  id: number;
  travelers: Traveler[];
  contact: { email: string; phone: string };
  addOns: string[];
  totalPrice: number;
  currency: string;
  totalInCurrency: number | null;
  specialRequest: string | null;
  status: string;
  startDate: string | null;
  createdAt: string;
  tour: { slug: string; title: string; country: string; city: string };
  user: { id: number; email: string; name: string } | null;
}

export type TravelerType = "adult" | "child" | "senior";

export interface Traveler {
  firstName: string;
  lastName: string;
  dob?: string;
  passport?: string;
  /** Pricing category. Defaults to "adult" for legacy bookings without a
   *  saved type (they were created before this field was introduced). */
  type?: TravelerType;
}

export interface Booking {
  id: number;
  tourSlug: string;
  tour: {
    slug: string;
    country: string;
    city: string;
    title: string;
    emoji: string;
    gradient: string;
    meal: string;
    imageCount: number;
  };
  travelers: Traveler[];
  contact: { email: string; phone: string };
  addOns: string[];
  /** Base price in EUR (always). */
  totalPrice: number;
  /** Currency the user paid in (display) — defaults to "EUR". */
  currency: string;
  /** Snapshotted amount in display currency at the time of booking. */
  totalInCurrency: number | null;
  /** Optional free-form note from the traveller (dietary needs, anniversaries…). */
  specialRequest: string | null;
  status: string;
  startDate: string | null;
  isPast: boolean;
  hasReview: boolean;
  createdAt: string;
}

export interface Review {
  id: number;
  rating: number;
  title: string;
  body: string;
  photos: string[];
  createdAt: string;
  user: { name: string };
}

export interface AiChatResponse {
  reply: string;
  tours: Tour[];
}

export interface AuthResponse {
  token: string;
  user: User;
}
