import { lazy, Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import HomePage from "./pages/HomePage";
import Header from "./components/Header";
import OrganizerHeader from "./components/OrganizerHeader";
import AdminHeader from "./components/AdminHeader";
import Footer from "./components/Footer";
import { useI18n } from "./lib/i18n";

// Route-level code splitting — each non-home page becomes its own JS chunk
// that's only downloaded when the user actually navigates there. Home stays
// eager because it's the most common first paint and we want zero waterfall.
//
// Before this change: initial JS bundle bundled every page = ~370KB gzipped.
// After: home alone ≈ ~180KB; the rest streams in on click.
const ChatPage     = lazy(() => import("./pages/ChatPage"));
const CatalogPage  = lazy(() => import("./pages/CatalogPage"));
const TourPage     = lazy(() => import("./pages/TourPage"));
const BookingPage  = lazy(() => import("./pages/BookingPage"));
const AccountPage  = lazy(() => import("./pages/AccountPage"));
const AuthPage     = lazy(() => import("./pages/AuthPage"));
const OperatorPage = lazy(() => import("./pages/OperatorPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const ComparePage   = lazy(() => import("./pages/ComparePage"));
const PricingPage   = lazy(() => import("./pages/PricingPage"));
const OrganizerLoginPage     = lazy(() => import("./pages/OrganizerLoginPage"));
const OrganizerDashboardPage = lazy(() => import("./pages/OrganizerDashboardPage"));
const OrganizerTourEditPage  = lazy(() => import("./pages/OrganizerTourEditPage"));
const OrganizerCreateTourPage = lazy(() => import("./pages/OrganizerCreateTourPage"));
const OrganizerBookingsPage  = lazy(() => import("./pages/OrganizerBookingsPage"));
const AdminLoginPage         = lazy(() => import("./pages/AdminLoginPage"));
const AdminDashboardPage     = lazy(() => import("./pages/AdminDashboardPage"));
const AdminTourReviewPage    = lazy(() => import("./pages/AdminTourReviewPage"));
const AdminBookingsPage      = lazy(() => import("./pages/AdminBookingsPage"));
const AdminOrganizersPage    = lazy(() => import("./pages/AdminOrganizersPage"));
const AdminAdminsPage        = lazy(() => import("./pages/AdminAdminsPage"));

/**
 * Light loader for the brief moment between clicking a link and the chunk
 * arriving over the network. Matches the site's tone — single muted line,
 * no spinner spam.
 */
function RouteFallback() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-7xl px-4 pt-16 text-sm text-ink-secondary">
      {t("common.loading")}
    </div>
  );
}

export default function App() {
  const { pathname } = useLocation();
  // Chat is a focused full-screen experience — no footer there.
  const hideFooter = pathname.startsWith("/ai");
  // Operator routes get a separate header (operator identity only — no
  // traveller dropdown). Public /operator/:slug is a profile page for
  // travellers, so keep the regular header there.
  const isOperatorCabinet = pathname === "/organizer" || pathname.startsWith("/organizer/");
  const isAdminCabinet = pathname === "/admin" || pathname.startsWith("/admin/");

  return (
    <div className="liquid-bg flex min-h-screen flex-col">
      <span className="blob-a" />
      <span className="blob-b" />
      {isAdminCabinet ? <AdminHeader /> : isOperatorCabinet ? <OrganizerHeader /> : <Header />}
      {/* pt-24 reserves space for the fixed header on all pages. */}
      <main className="relative z-10 flex-1 pt-24">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/ai" element={<ChatPage />} />
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/tour/:id" element={<TourPage />} />
            <Route path="/booking" element={<BookingPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/operator/:slug" element={<OperatorPage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/organizer/login" element={<OrganizerLoginPage />} />
            <Route path="/organizer" element={<OrganizerDashboardPage />} />
            <Route path="/organizer/tours/new" element={<OrganizerCreateTourPage />} />
            <Route path="/organizer/tours/:slug" element={<OrganizerTourEditPage />} />
            <Route path="/organizer/bookings" element={<OrganizerBookingsPage />} />
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/tours/:slug" element={<AdminTourReviewPage />} />
            <Route path="/admin/bookings" element={<AdminBookingsPage />} />
            <Route path="/admin/organizers" element={<AdminOrganizersPage />} />
            <Route path="/admin/admins" element={<AdminAdminsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      {!hideFooter && <Footer />}
    </div>
  );
}
