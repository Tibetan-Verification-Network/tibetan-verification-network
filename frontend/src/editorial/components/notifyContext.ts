import { createContext } from "react";

import type { MessageKey } from "../../i18n/locales/en";

export type NotifyTone = "success" | "error" | "info";

export type Notify = (key: MessageKey, tone?: NotifyTone, values?: Record<string, string>) => void;

export const NotifyContext = createContext<Notify | null>(null);
