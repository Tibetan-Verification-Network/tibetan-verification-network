import { Link, useParams } from "react-router-dom";

import type { PublicDetail, VersionSummary } from "../api/public";
import { useFactCheck } from "../api/publicQueries";
import { ApiError } from "../api/types";
import { Alert } from "../components/Alert";
import { ArticleBody } from "../components/ArticleBody";
import { ArticleNotFound } from "../components/ArticleNotFound";
import { DocumentTitle } from "../components/DocumentTitle";
import { LoadingState, QueryError } from "../components/QueryState";
import { WithdrawnNotice } from "../components/WithdrawnNotice";
import { formatDate } from "../i18n/format";
import { localePath } from "../i18n/paths";
import type { Locale } from "../i18n/translate";
import { useI18n } from "../i18n/useI18n";
import { useLocalePath } from "../i18n/useLocalePath";

function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "bo" : "en";
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export function ArticlePage() {
  const { slug = "" } = useParams();
  const { locale } = useI18n();
  const query = useFactCheck(slug, locale);
  const missing = query.isError && isNotFound(query.error);
  const other = useFactCheck(slug, otherLocale(locale), missing);

  if (query.isPending) {
    return <LoadingState />;
  }
  if (query.isSuccess) {
    return <ArticleView detail={query.data} />;
  }
  if (!missing) {
    return <QueryError messageKey="article.error" onRetry={() => void query.refetch()} />;
  }
  if (other.isPending) {
    return <LoadingState />;
  }
  if (other.isSuccess) {
    return <TranslationUnavailable slug={slug} detail={other.data} />;
  }
  if (isNotFound(other.error)) {
    return <ArticleNotFound />;
  }
  return <QueryError messageKey="article.error" onRetry={() => void other.refetch()} />;
}

/** The article exists only in the other language: say so, and link to it. */
function TranslationUnavailable({ slug, detail }: { slug: string; detail: PublicDetail }) {
  const { locale, t } = useI18n();
  const available = otherLocale(locale);
  const mine = detail.translations.find((link) => link.language === locale);
  const state = mine?.status === "pending" ? "pending" : "unavailable";
  const language = t(`language.${locale}`);
  const availableName = t(`language.${available}`);
  const title =
    state === "pending"
      ? t("article.translationPending", { language })
      : t("article.translationUnavailable", { language });
  return (
    <>
      <DocumentTitle title={title} />
      <h1>{title}</h1>
      <p lang={available} className="withdrawn-title">
        {detail.snapshot.title}
      </p>
      <Alert tone="info">
        <p>{t("article.otherLanguage", { language: availableName })}</p>
        <p>
          <Link
            className="text-link"
            lang={available}
            to={localePath(available, `fact-checks/${encodeURIComponent(slug)}`)}
          >
            {t("article.readOther", { language: availableName })}
          </Link>
        </p>
      </Alert>
    </>
  );
}

function ArticleView({ detail }: { detail: PublicDetail }) {
  const { locale, t } = useI18n();
  const to = useLocalePath();
  const { snapshot, translations, versions } = detail;
  const slug = snapshot.public_slug;

  if (snapshot.kind === "withdrawal") {
    return (
      <>
        <DocumentTitle title={t("article.withdrawn.title")} />
        <WithdrawnNotice snapshot={snapshot} />
        <TranslationLinks slug={slug} translations={translations} />
      </>
    );
  }

  const ordered = [...versions].sort((a, b) => b.version_number - a.version_number);
  const current = ordered[0]?.version_number;
  const first = versions.length > 0 ? versions[0] : undefined;
  const firstPublished = first?.published_at ?? snapshot.published_at;
  const revised = snapshot.kind !== "initial";

  return (
    <>
      <DocumentTitle title={snapshot.title} />
      {revised && snapshot.correction_note ? (
        <Alert tone="info">
          <strong>{t(`article.kind.${snapshot.kind}`)}:</strong>{" "}
          <span className="preline" lang={snapshot.language}>
            {snapshot.correction_note}
          </span>
        </Alert>
      ) : null}
      <ArticleBody snapshot={snapshot} />

      <p className="dates">
        <span>{t("article.published", { date: formatDate(locale, firstPublished) })}</span>
        {revised ? (
          <span>{t("article.updated", { date: formatDate(locale, snapshot.published_at) })}</span>
        ) : null}
      </p>

      <section aria-labelledby="article-history">
        <h2 id="article-history">{t("article.history")}</h2>
        <ol className="history">
          {ordered.map((version) => (
            <HistoryItem
              key={version.version_number}
              version={version}
              isCurrent={version.version_number === current}
              href={`${to("fact-checks")}/${encodeURIComponent(slug)}/versions/${version.version_number}`}
            />
          ))}
        </ol>
      </section>

      <TranslationLinks slug={slug} translations={translations} />
    </>
  );
}

function HistoryItem({
  version,
  isCurrent,
  href,
}: {
  version: VersionSummary;
  isCurrent: boolean;
  href: string;
}) {
  const { locale, t } = useI18n();
  const label = t("article.version", { number: String(version.version_number) });
  return (
    <li>
      <p>
        <strong>{label}</strong> — {t(`article.kind.${version.kind}`)} —{" "}
        {formatDate(locale, version.published_at)}
        {isCurrent ? ` (${t("article.versionCurrent")})` : null}
      </p>
      {version.correction_note ? <p className="preline">{version.correction_note}</p> : null}
      {isCurrent ? null : (
        <Link to={href}>
          {t("article.versionOpen", { number: String(version.version_number) })}
        </Link>
      )}
    </li>
  );
}

function TranslationLinks({
  slug,
  translations,
}: {
  slug: string;
  translations: PublicDetail["translations"];
}) {
  const { locale, t } = useI18n();
  const available = otherLocale(locale);
  const link = translations.find((entry) => entry.language === available);
  const language = t(`language.${available}`);
  return (
    <section aria-labelledby="article-translation">
      <h2 id="article-translation">{t("article.translation")}</h2>
      {link?.status === "published" ? (
        <Link
          className="text-link"
          lang={available}
          to={localePath(available, `fact-checks/${encodeURIComponent(slug)}`)}
        >
          {t("article.translationLink", { language })}
        </Link>
      ) : link?.status === "pending" ? (
        <p>{t("article.translationPending", { language })}</p>
      ) : (
        <p>{t("article.translationUnavailable", { language })}</p>
      )}
    </section>
  );
}
