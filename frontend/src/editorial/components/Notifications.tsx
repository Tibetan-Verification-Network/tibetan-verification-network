import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useI18n } from "../../i18n/useI18n";
import { NotifyContext, type Notify, type NotifyTone } from "./notifyContext";

interface Entry {
  id: number;
  tone: NotifyTone;
  text: string;
}

const VISIBLE_MS = 10_000;

/**
 * A polite live region for outcomes of actions ("Saved", "Approved"). The region itself is
 * always in the page so assistive technology announces new entries as they appear.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<Entry[]>([]);
  const counter = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const notify = useCallback<Notify>(
    (key, tone = "info", values) => {
      counter.current += 1;
      const id = counter.current;
      setEntries((current) => [...current, { id, tone, text: t(key, values) }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), VISIBLE_MS),
      );
    },
    [dismiss, t],
  );

  useEffect(() => {
    const active = timers.current;
    return () => {
      for (const timer of active.values()) {
        clearTimeout(timer);
      }
      active.clear();
    };
  }, []);

  const value = useMemo(() => notify, [notify]);

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <div className="notifications" role="status" aria-live="polite" aria-relevant="additions">
        {entries.map((entry) => (
          <div key={entry.id} className={`notification notification-${entry.tone}`}>
            <span>{entry.text}</span>
            <button
              type="button"
              className="notification-dismiss"
              onClick={() => dismiss(entry.id)}
              aria-label={t("editorial.dismiss")}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ))}
      </div>
    </NotifyContext.Provider>
  );
}
