import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { BrowserRouter } from "react-router-dom";

import { createQueryClient } from "./api/queryClient";

import { AuthProvider } from "./auth/AuthProvider";
import { Alert } from "./components/Alert";
import { DocumentTitle } from "./components/DocumentTitle";
import { readApiBaseUrl } from "./config";
import { I18nProvider } from "./i18n/I18nProvider";
import { useI18n } from "./i18n/useI18n";
import { AppRoutes } from "./routes";

export function App() {
  const baseUrl = configuredBaseUrl();
  if (baseUrl === null) {
    return (
      <I18nProvider>
        <ConfigurationProblem />
      </I18nProvider>
    );
  }
  return <AppShell baseUrl={baseUrl} />;
}

function configuredBaseUrl(): string | null {
  try {
    return readApiBaseUrl();
  } catch {
    return null;
  }
}

export function AppShell({ baseUrl }: { baseUrl: string }) {
  const [queryClient] = useState(() => createQueryClient());
  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider baseUrl={baseUrl}>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}

export function ConfigurationProblem() {
  const { t } = useI18n();
  return (
    <div className="shell">
      <DocumentTitle title={t("product.name")} />
      <main id="main" tabIndex={-1}>
        <h1>{t("product.name")}</h1>
        <Alert tone="error">{t("config.error")}</Alert>
      </main>
    </div>
  );
}
