import { Navigate, Route, Routes } from "react-router-dom";

import type { Locale } from "./i18n/translate";
import { LOCALES } from "./i18n/translate";
import { LegacyRedirect } from "./layout/LegacyRedirect";
import { LocaleRoute } from "./layout/LocaleRoute";

import type { StaffRole } from "./api/types";
import { RequireAuth } from "./auth/RequireAuth";
import { NoAccess, RequireRole } from "./editorial/components/NoAccess";
import { AdminUsersPage } from "./editorial/pages/AdminUsersPage";
import { ApprovalQueuePage } from "./editorial/pages/ApprovalQueuePage";
import { ArchiveDocumentPage } from "./editorial/pages/ArchiveDocumentPage";
import { ArchivePage } from "./editorial/pages/ArchivePage";
import { FactCheckPage } from "./editorial/pages/FactCheckPage";
import { FactChecksPage } from "./editorial/pages/FactChecksPage";
import { InboxPage } from "./editorial/pages/InboxPage";
import { InvestigationPage } from "./editorial/pages/InvestigationPage";
import { InvestigationsPage } from "./editorial/pages/InvestigationsPage";
import { LanguagePage } from "./editorial/pages/LanguagePage";
import { SubmissionPage } from "./editorial/pages/SubmissionPage";
import { TopicsAdminPage } from "./editorial/pages/TopicsAdminPage";
import { EditorialLayout } from "./layout/EditorialLayout";
import { PublicLayout } from "./layout/PublicLayout";
import { ActivatePage } from "./pages/ActivatePage";
import { EditorialHome } from "./pages/EditorialHome";
import { AboutPage } from "./pages/AboutPage";
import { ArticlePage } from "./pages/ArticlePage";
import { ArticleVersionPage } from "./pages/ArticleVersionPage";
import { Home } from "./pages/Home";
import { MembershipPage } from "./pages/MembershipPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SearchPage } from "./pages/SearchPage";
import { SubmitPage } from "./pages/SubmitPage";
import { TopicPage } from "./pages/TopicPage";
import { TopicsPage } from "./pages/TopicsPage";

const WORKERS: StaffRole[] = ["researcher", "editor", "approver"];

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
      <Route path="membership" element={<MembershipPage />} />
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
            element={
              <RequireRole roles={["researcher", "editor"]}>
                <InboxPage />
              </RequireRole>
            }
          />
          <Route
            path="inbox/:id"
            element={
              <RequireRole roles={["researcher", "editor"]}>
                <SubmissionPage />
              </RequireRole>
            }
          />
          <Route
            path="investigations"
            element={
              <RequireRole roles={WORKERS}>
                <InvestigationsPage />
              </RequireRole>
            }
          />
          <Route
            path="investigations/:id"
            element={
              <RequireRole roles={WORKERS}>
                <InvestigationPage />
              </RequireRole>
            }
          />
          <Route path="drafts" element={<Navigate to="/editorial/factchecks" replace />} />
          <Route
            path="factchecks"
            element={
              <RequireRole roles={WORKERS}>
                <FactChecksPage />
              </RequireRole>
            }
          />
          <Route
            path="factchecks/:id"
            element={
              <RequireRole roles={WORKERS}>
                <FactCheckPage />
              </RequireRole>
            }
          />
          <Route
            path="factchecks/:id/:language"
            element={
              <RequireRole roles={WORKERS}>
                <LanguagePage />
              </RequireRole>
            }
          />
          <Route
            path="approvals"
            element={
              <RequireRole roles={["approver"]}>
                <ApprovalQueuePage />
              </RequireRole>
            }
          />
          <Route
            path="archive"
            element={
              <RequireRole roles={WORKERS}>
                <ArchivePage />
              </RequireRole>
            }
          />
          <Route
            path="archive/:id"
            element={
              <RequireRole roles={WORKERS}>
                <ArchiveDocumentPage />
              </RequireRole>
            }
          />
          <Route
            path="topics"
            element={
              <RequireRole roles={["editor"]}>
                <TopicsAdminPage />
              </RequireRole>
            }
          />
          <Route
            path="admin/users"
            element={
              <RequireRole roles={["platform_administrator"]}>
                <AdminUsersPage />
              </RequireRole>
            }
          />
          <Route path="*" element={<NoAccess />} />
        </Route>
      </Route>
      {LOCALES.map(publicRoutes)}
      <Route index element={<LegacyRedirect />} />
      <Route path="fact-checks/*" element={<LegacyRedirect />} />
      <Route path="topics/*" element={<LegacyRedirect />} />
      <Route path="submit" element={<LegacyRedirect />} />
      <Route path="membership" element={<LegacyRedirect />} />
      <Route path="about" element={<LegacyRedirect />} />
      <Route element={<PublicLayout />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="activate" element={<ActivatePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
