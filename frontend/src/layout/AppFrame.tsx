import { useId, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";

import { Button } from "../components/Button";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { Logo } from "../components/Logo";
import { SkipLink } from "../components/SkipLink";
import type { MessageKey } from "../i18n/locales/en";
import { useI18n } from "../i18n/useI18n";
import { SiteFooter } from "./SiteFooter";
import { useNarrowViewport } from "./useNarrowViewport";

export interface NavItem {
  to: string;
  label: MessageKey;
  end?: boolean;
}

const DESK_NARROW = "(max-width: 60rem)";

export function AppFrame({
  navLabel,
  items,
  actions,
  homeTo = "/",
  variant = "public",
  children,
}: {
  navLabel: string;
  items: readonly NavItem[];
  actions?: ReactNode;
  homeTo?: string;
  variant?: "public" | "editorial";
  children: ReactNode;
}) {
  if (variant === "editorial") {
    return (
      <EditorialFrame navLabel={navLabel} items={items} actions={actions} homeTo={homeTo}>
        {children}
      </EditorialFrame>
    );
  }
  return (
    <PublicFrame navLabel={navLabel} items={items} actions={actions} homeTo={homeTo}>
      {children}
    </PublicFrame>
  );
}

function Brand({ homeTo, inverse = false }: { homeTo: string; inverse?: boolean }) {
  const { t } = useI18n();
  return (
    <NavLink to={homeTo} className="brand" aria-label={t("product.name")}>
      <Logo inverse={inverse} />
    </NavLink>
  );
}

function PublicFrame({
  navLabel,
  items,
  actions,
  homeTo,
  children,
}: {
  navLabel: string;
  items: readonly NavItem[];
  actions?: ReactNode;
  homeTo: string;
  children: ReactNode;
}) {
  return (
    <div className="shell shell-public">
      <header className="site-header">
        <SkipLink />
        <Brand homeTo={homeTo} />
        <LanguageSwitcher />
        <PrimaryNav label={navLabel} items={items} />
        {actions ? <div className="header-actions">{actions}</div> : null}
      </header>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

function EditorialFrame({
  navLabel,
  items,
  actions,
  homeTo,
  children,
}: {
  navLabel: string;
  items: readonly NavItem[];
  actions?: ReactNode;
  homeTo: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const narrow = useNarrowViewport(DESK_NARROW);
  const [open, setOpen] = useState(false);
  const menuId = useId();

  return (
    <div
      className={["shell", "shell-editorial", narrow ? "is-narrow" : ""].filter(Boolean).join(" ")}
    >
      <SkipLink />
      {narrow && open ? (
        <button
          type="button"
          className="nav-backdrop"
          aria-label={t("nav.closeMenu")}
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside id={menuId} className="desk-sidebar" aria-label={navLabel} hidden={narrow && !open}>
        <Brand homeTo={homeTo} inverse />
        <NavList label={navLabel} items={items} onNavigate={() => setOpen(false)} />
      </aside>
      <div className="desk-canvas">
        <header className="desk-topbar">
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
          <p className="desk-title">{navLabel}</p>
          <LanguageSwitcher />
          {actions ? <div className="header-actions">{actions}</div> : null}
        </header>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <footer className="site-footer">
          <p>{t("footer.note")}</p>
        </footer>
      </div>
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
      <NavList
        id={menuId}
        label={label}
        items={items}
        hidden={narrow && !open}
        labelledByNav={false}
        onNavigate={() => setOpen(false)}
      />
    </nav>
  );
}

function NavList({
  id,
  label,
  items,
  hidden = false,
  labelledByNav = true,
  onNavigate,
}: {
  id?: string;
  label: string;
  items: readonly NavItem[];
  hidden?: boolean;
  labelledByNav?: boolean;
  onNavigate: () => void;
}) {
  const { t } = useI18n();
  const list = (
    <ul id={id} className="nav-list" hidden={hidden || undefined}>
      {items.map((item) => (
        <li key={item.to}>
          <NavLink to={item.to} end={item.end} className="nav-link" onClick={onNavigate}>
            {t(item.label)}
          </NavLink>
        </li>
      ))}
    </ul>
  );
  if (!labelledByNav) {
    return list;
  }
  return (
    <nav className="primary-nav" aria-label={label}>
      {list}
    </nav>
  );
}
