import { Route, Routes } from "react-router-dom";

import { RequireAuth } from "./auth/RequireAuth";
import { EditorialLayout } from "./layout/EditorialLayout";
import { PublicLayout } from "./layout/PublicLayout";
import { ActivatePage } from "./pages/ActivatePage";
import { EditorialHome } from "./pages/EditorialHome";
import { Home } from "./pages/Home";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RequireAuth />}>
        <Route path="editorial" element={<EditorialLayout />}>
          <Route index element={<EditorialHome />} />
          <Route
            path="inbox"
            element={<PlaceholderPage titleKey="nav.inbox" bodyKey="placeholder.inbox" />}
          />
          <Route
            path="investigations"
            element={
              <PlaceholderPage titleKey="nav.investigations" bodyKey="placeholder.investigations" />
            }
          />
          <Route
            path="drafts"
            element={<PlaceholderPage titleKey="nav.drafts" bodyKey="placeholder.drafts" />}
          />
          <Route
            path="archive"
            element={<PlaceholderPage titleKey="nav.archive" bodyKey="placeholder.archive" />}
          />
        </Route>
      </Route>
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route
          path="fact-checks"
          element={<PlaceholderPage titleKey="nav.factChecks" bodyKey="placeholder.factChecks" />}
        />
        <Route
          path="submit"
          element={<PlaceholderPage titleKey="nav.submit" bodyKey="placeholder.submit" />}
        />
        <Route
          path="about"
          element={<PlaceholderPage titleKey="nav.about" bodyKey="placeholder.about" />}
        />
        <Route path="login" element={<LoginPage />} />
        <Route path="activate" element={<ActivatePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
