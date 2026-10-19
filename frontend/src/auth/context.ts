import { createContext } from "react";

import type { CurrentUser } from "../api/types";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

export interface AuthContextValue {
  baseUrl: string;
  status: AuthStatus;
  user: CurrentUser | null;
  setUser: (user: CurrentUser | null) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
