import { useContext } from "react";

import { NotifyContext, type Notify } from "./notifyContext";

export function useNotify(): Notify {
  const notify = useContext(NotifyContext);
  if (notify === null) {
    throw new Error("useNotify must be used within NotificationProvider");
  }
  return notify;
}
