import { BrowserRouter } from "react-router-dom";

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
  return (
    <I18nProvider>
      <AuthProvider baseUrl={baseUrl}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
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
