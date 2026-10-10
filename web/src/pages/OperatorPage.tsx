import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Briefcase, Mail, MessageCircle, Phone, Star, User as UserIcon } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import TourCard from "@/components/TourCard";
import ReviewList from "@/components/ReviewList";
import { useI18n } from "@/lib/i18n";
import { fetchOrganizer, type OrganizerProfile, type Tour } from "@/api";
import { cn } from "@/lib/utils";

export default function OperatorPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [profile, setProfile] = useState<OrganizerProfile | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetchOrganizer(slug)
      .then((p) => { if (!cancelled) setProfile(p); })
      .catch(() => { if (!cancelled) setNotFound(true); });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    // We don't have a real /404 route — the catch-all `*` renders NotFoundPage
    // anyway, but navigating to the literal /404 leaves a confusing URL.
    // Instead bounce to /catalog with a hint flag — same UX, clean URL.
    if (notFound) navigate("/catalog", { replace: true });
  }, [notFound, navigate]);

  if (!profile) {
    return <div className="mx-auto max-w-7xl px-4 pt-10 text-sm text-ink-secondary">{t("account.loading")}</div>;
  }

  const initial = profile.name.trim().charAt(0).toUpperCase();
  const isPrivate = profile.type === "private";

  return (
    <div className="mx-auto max-w-7xl px-4 pt-10">
      <Link
        to="/catalog"
        className="inline-flex items-center gap-2 text-sm text-ink-secondary hover:text-ink-primary"
      >
        <ArrowLeft size={14} />
        {t("operator.back")}
      </Link>

      {/* Hero */}
      <GlassCard variant="strong" className="mt-6 overflow-hidden p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-start gap-5">
            <div
              className={cn(
                "grid h-20 w-20 shrink-0 place-items-center rounded-glass text-3xl font-extrabold text-white",
                isPrivate
                  ? "bg-gradient-to-br from-orange-accent to-blue-primary"
                  : "bg-gradient-to-br from-blue-primary to-blue-deep"
              )}
            >
              {initial}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "chip text-xs",
                    isPrivate ? "chip-orange" : "chip-blue"
                  )}
                >
                  {isPrivate ? (
                    <>
                      <UserIcon size={12} />
                      {t("operator.guide")}
                    </>
                  ) : (
                    <>
                      <Briefcase size={12} />
                      {t("operator.operator")}
                    </>
                  )}
                </span>
              </div>
              <h1 className="font-marker mt-2 text-5xl leading-none md:text-6xl">{profile.name}</h1>
              <p className="mt-3 max-w-2xl text-ink-secondary">{profile.bio}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6 text-center md:gap-10">
            <Stat
              label={t("operator.rating")}
              value={profile.rating != null ? profile.rating.toFixed(1) : "—"}
              note={
                profile.reviewsCount > 0
                  ? t(profile.reviewsCount === 1 ? "operator.reviewLabel" : "operator.reviewsLabel", { n: profile.reviewsCount })
                  : t("operator.noReviews")
              }
              icon={<Star size={14} className="fill-orange-accent text-orange-accent" />}
            />
            <Stat
              label={t("operator.tours")}
              value={profile.toursCount.toString()}
              note={t("operator.toursNote")}
            />
            <Stat
              label={t("operator.since")}
              value={`${profile.yearsActive}y`}
              note={t("operator.inTravel")}
            />
          </div>
        </div>

        {/* Contacts */}
        <div className="mt-6 flex flex-wrap gap-2">
          <a href={`tel:${profile.phone.replace(/\s/g, "")}`} className="chip chip-cream">
            <Phone size={12} />
            {profile.phone}
          </a>
          {profile.whatsapp && (
            <a
              href={`https://wa.me/${profile.whatsapp.replace(/[^\d]/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="chip chip-cream"
            >
              <MessageCircle size={12} />
              WhatsApp
            </a>
          )}
          <a href={`mailto:${profile.email}`} className="chip chip-cream">
            <Mail size={12} />
            {profile.email}
          </a>
        </div>
      </GlassCard>

      {/* Tours */}
      <section className="mt-12">
        <h2 className="text-3xl font-extrabold tracking-tight">{t("operator.toursBy", { name: profile.name })}</h2>
        {profile.tours.length === 0 ? (
          <p className="mt-2 text-sm text-ink-secondary">{t("operator.noToursOffered")}</p>
        ) : (
          <div className="stagger-grid mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {profile.tours.map((t, i) => (
              <TourCard
                key={t.id}
                tour={t as unknown as Tour}
                style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
              />
            ))}
          </div>
        )}
      </section>

      {/* Reviews */}
      <section className="mt-16 mb-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight">{t("operator.reviewsTitle")}</h2>
            <p className="mt-1 text-sm text-ink-secondary">
              {profile.reviews.length === 0
                ? t("operator.noTrips")
                : t(profile.reviews.length === 1 ? "operator.allReviewsOne" : "operator.allReviews", { n: profile.reviews.length })}
            </p>
          </div>
          {profile.rating != null && (
            <div className="flex items-center gap-2 rounded-glass bg-white/60 px-4 py-2 shadow-soft">
              <Star size={18} className="fill-orange-accent text-orange-accent" />
              <span className="text-2xl font-extrabold">{profile.rating.toFixed(1)}</span>
              <span className="text-ink-secondary">/ 5</span>
            </div>
          )}
        </div>

        {profile.reviews.length > 0 && (
          <div className="mt-6">
            <ReviewList
              reviews={profile.reviews}
              renderHeader={(r) => (
                <Link
                  to={`/tour/${r.tour.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-pill bg-white/60 px-3 py-1 text-xs font-semibold text-ink-primary hover:bg-white"
                >
                  <span className="text-ink-muted">{t("operator.reviewFor")}</span>
                  <span>{r.tour.country} · {r.tour.city}</span>
                  <span className="text-ink-muted">·</span>
                  <span className="text-blue-deep">{r.tour.title}</span>
                </Link>
              )}
              showEmptyState={false}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">{label}</div>
      <div className="mt-1 flex items-center justify-center gap-1.5 text-2xl font-extrabold">
        {icon}
        {value}
      </div>
      {note && <div className="mt-0.5 text-xs text-ink-muted">{note}</div>}
    </div>
  );
}
