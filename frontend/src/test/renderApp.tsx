import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { createQueryClient } from "../api/queryClient";
import { AuthProvider } from "../auth/AuthProvider";
import { I18nProvider } from "../i18n/I18nProvider";
import { AppRoutes } from "../routes";

export const API_BASE_URL = "http://localhost:8000";

export function renderApp(path = "/") {
  const queryClient = createQueryClient({ retry: false });
  return render(
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider baseUrl={API_BASE_URL}>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    </I18nProvider>,
  );
}
