import { useI18n } from "../i18n/useI18n";

export function Logo({ inverse = false }: { inverse?: boolean }) {
  const { t } = useI18n();
  return (
    <span className={inverse ? "logo logo-inverse" : "logo"}>
      <img
        className="logo-image"
        src={inverse ? "/logo-inverse.png" : "/logo.png"}
        alt={t("product.name")}
        width={993}
        height={221}
      />
    </span>
  );
}
