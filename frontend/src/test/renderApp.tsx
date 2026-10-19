import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { AuthProvider } from "../auth/AuthProvider";
import { I18nProvider } from "../i18n/I18nProvider";
import { AppRoutes } from "../routes";

export const API_BASE_URL = "http://localhost:8000";

export function renderApp(path = "/") {
  return render(
    <I18nProvider>
      <AuthProvider baseUrl={API_BASE_URL}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </I18nProvider>,
  );
}
