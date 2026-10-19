import { DocumentTitle } from "../components/DocumentTitle";
import type { MessageKey } from "../i18n/locales/en";
import { useI18n } from "../i18n/useI18n";

export function PlaceholderPage({
  titleKey,
  bodyKey,
}: {
  titleKey: MessageKey;
  bodyKey: MessageKey;
}) {
  const { t } = useI18n();
  const title = t(titleKey);
  return (
    <>
      <DocumentTitle title={title} />
      <h1>{title}</h1>
      <p>{t(bodyKey)}</p>
    </>
  );
}
