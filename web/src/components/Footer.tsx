import { Link } from "react-router-dom";
import { useI18n } from "@/lib/i18n";

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="relative z-10 px-4 pb-8 pt-20">
      <div className="glass mx-auto max-w-7xl rounded-glass p-10">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="text-2xl font-extrabold">SvitGo</div>
            <p className="mt-3 max-w-sm text-sm text-ink-secondary">
              {t("footer.tagline")}
            </p>
          </div>
          <FooterCol
            title={t("footer.site")}
            links={[
              ["/", t("footer.home")],
              ["/ai", t("footer.aiSearch")],
              ["/catalog", t("footer.catalog")],
              ["/account", t("footer.account")],
            ]}
          />
          <FooterCol
            title={t("footer.contacts")}
            links={[
              ["mailto:hello@svitgo.example", "hello@svitgo.example"],
            ]}
          />
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
  return (
    <div>
      <div className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-muted">
        {title}
      </div>
      <ul className="space-y-2 text-sm">
        {links.map(([to, label]) => (
          <li key={to}>
            {to.startsWith("/") ? (
              <Link to={to} className="text-ink-primary hover:text-blue-deep">
                {label}
              </Link>
            ) : (
              <a href={to} className="text-ink-primary hover:text-blue-deep">
                {label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
