import { Route, Routes } from "react-router-dom";

import type { Locale } from "./i18n/translate";
import { LOCALES } from "./i18n/translate";
import { LegacyRedirect } from "./layout/LegacyRedirect";
import { LocaleRoute } from "./layout/LocaleRoute";

import { RequireAuth } from "./auth/RequireAuth";
import { EditorialLayout } from "./layout/EditorialLayout";
import { PublicLayout } from "./layout/PublicLayout";
import { ActivatePage } from "./pages/ActivatePage";
import { EditorialHome } from "./pages/EditorialHome";
import { AboutPage } from "./pages/AboutPage";
import { ArticlePage } from "./pages/ArticlePage";
import { ArticleVersionPage } from "./pages/ArticleVersionPage";
import { Home } from "./pages/Home";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { SearchPage } from "./pages/SearchPage";
import { SubmitPage } from "./pages/SubmitPage";
import { TopicPage } from "./pages/TopicPage";
import { TopicsPage } from "./pages/TopicsPage";

/** Public routes are mounted once per locale prefix: `/en/...` and `/bo/...`. */
function publicRoutes(locale: Locale) {
  return (
    <Route key={locale} path={locale} element={<LocaleRoute locale={locale} />}>
      <Route index element={<Home />} />
      <Route path="fact-checks" element={<SearchPage />} />
      <Route path="fact-checks/:slug" element={<ArticlePage />} />
      <Route path="fact-checks/:slug/versions/:n" element={<ArticleVersionPage />} />
      <Route path="topics" element={<TopicsPage />} />
      <Route path="topics/:slug" element={<TopicPage />} />
      <Route path="about" element={<AboutPage />} />
      <Route path="submit" element={<SubmitPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  );
}

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
      {LOCALES.map(publicRoutes)}
      <Route index element={<LegacyRedirect />} />
      <Route path="fact-checks/*" element={<LegacyRedirect />} />
      <Route path="topics/*" element={<LegacyRedirect />} />
      <Route path="submit" element={<LegacyRedirect />} />
      <Route path="about" element={<LegacyRedirect />} />
      <Route element={<PublicLayout />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="activate" element={<ActivatePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
