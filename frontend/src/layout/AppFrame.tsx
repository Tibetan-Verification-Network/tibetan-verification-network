import { useId, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";

import { Button } from "../components/Button";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { SkipLink } from "../components/SkipLink";
import type { MessageKey } from "../i18n/locales/en";
import { useI18n } from "../i18n/useI18n";
import { useNarrowViewport } from "./useNarrowViewport";

export interface NavItem {
  to: string;
  label: MessageKey;
  end?: boolean;
}

export function AppFrame({
  navLabel,
  items,
  actions,
  homeTo = "/",
  children,
}: {
  navLabel: string;
  items: readonly NavItem[];
  actions?: ReactNode;
  homeTo?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="shell">
      <header className="site-header">
        <SkipLink />
        <NavLink to={homeTo} className="brand">
          <span className="mark" aria-hidden="true" />
          {t("product.name")}
        </NavLink>
        <LanguageSwitcher />
        <PrimaryNav label={navLabel} items={items} />
        {actions ? <div className="header-actions">{actions}</div> : null}
      </header>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <p>{t("footer.note")}</p>
      </footer>
    </div>
  );
}

function PrimaryNav({ label, items }: { label: string; items: readonly NavItem[] }) {
  const { t } = useI18n();
  const narrow = useNarrowViewport();
  const [open, setOpen] = useState(false);
  const menuId = useId();

  return (
    <nav className="primary-nav" aria-label={label}>
      {narrow ? (
        <Button
          variant="secondary"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? t("nav.closeMenu") : t("nav.menu")}
        </Button>
      ) : null}
      <ul id={menuId} className="nav-list" hidden={narrow && !open}>
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className="nav-link"
              onClick={() => setOpen(false)}
            >
              {t(item.label)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
