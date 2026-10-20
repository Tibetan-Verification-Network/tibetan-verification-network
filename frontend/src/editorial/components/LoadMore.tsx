import { Button } from "../../components/Button";
import { useI18n } from "../../i18n/useI18n";

export function LoadMore({
  hasMore,
  loading,
  onLoadMore,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}) {
  const { t } = useI18n();
  if (!hasMore) {
    return null;
  }
  return (
    <div className="load-more">
      <Button variant="secondary" disabled={loading} onClick={onLoadMore}>
        {loading ? t("search.loadingMore") : t("search.loadMore")}
      </Button>
    </div>
  );
}
