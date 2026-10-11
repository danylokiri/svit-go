import { useEffect, useState } from "react";
import { mutate } from "swr";
import { getApiBase } from "../api/client";
import { useI18n } from "../lib/i18n";

/**
 * The demo API runs on a free plan that puts the server to sleep when idle, so the first
 * request after a pause can take up to a minute. If the API does not answer within a few
 * seconds, show a short notice, keep polling, and refresh all data as soon as it is awake.
 */
export default function WakeUpNotice() {
  const { t } = useI18n();
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let shown = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      shown = true;
      setWaking(true);
    }, 3000);

    async function poll() {
      for (let i = 0; i < 80 && !cancelled; i++) {
        try {
          const res = await fetch(`${getApiBase()}/`, { cache: "no-store" });
          if (res.ok) break;
        } catch {
          // the server is still starting
        }
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
      }
      window.clearTimeout(timer);
      if (cancelled) return;
      if (shown) void mutate(() => true);
      setWaking(false);
    }
    void poll();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (!waking) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto w-fit max-w-md rounded-2xl bg-white/90 px-4 py-3 text-center text-sm text-ink-primary shadow-lg backdrop-blur"
    >
      {t("common.waking")}
    </div>
  );
}
