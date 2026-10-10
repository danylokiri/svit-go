import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { OrganizerAuthProvider } from "./auth/OrganizerContext";
import { AdminAuthProvider } from "./auth/AdminContext";
import { CurrencyProvider } from "./contexts/CurrencyContext";
import { SubscriptionProvider } from "./contexts/SubscriptionContext";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { ToastHost } from "./components/Toast";
import { SWRConfig } from "swr";
import { bootstrapTheme } from "./lib/theme";
import { bootstrapLocale, I18nProvider } from "./lib/i18n";
import "./index.css";

// Apply saved/system theme + locale BEFORE first paint — avoids a flash
// of wrong colour and ensures the marker-font Cyrillic fallback kicks in
// from the very first render via the <html lang> attribute.
bootstrapTheme();
bootstrapLocale();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      {/* SWR-wide defaults — components that use the hooks in api/hooks.ts
          share one in-memory cache across the whole app. dedupingInterval
          collapses two identical fetches issued within 60s into one. */}
      <SWRConfig value={{ dedupingInterval: 60_000, errorRetryCount: 2 }}>
        <I18nProvider>
          <AuthProvider>
            <OrganizerAuthProvider>
              <AdminAuthProvider>
                <SubscriptionProvider>
                  <CurrencyProvider>
                    <ConfirmProvider>
                      <App />
                      <ToastHost />
                    </ConfirmProvider>
                  </CurrencyProvider>
                </SubscriptionProvider>
              </AdminAuthProvider>
            </OrganizerAuthProvider>
          </AuthProvider>
        </I18nProvider>
      </SWRConfig>
    </BrowserRouter>
  </React.StrictMode>
);
