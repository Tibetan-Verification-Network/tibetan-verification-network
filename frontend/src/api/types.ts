import type { MessageKey } from "../i18n/locales/en";

export const PASSWORD_MIN_LENGTH = 12;

export const STAFF_ROLES = ["platform_administrator", "researcher", "editor", "approver"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string | null;
  roles: StaffRole[];
  isActive: boolean;
}

export type ApiErrorCode = Extract<
  MessageKey,
  | "login.invalid"
  | "activate.invalid"
  | "activate.passwordLength"
  | "errors.network"
  | "errors.csrf"
  | "errors.forbidden"
  | "errors.generic"
  | "errors.authRequired"
  | "errors.origin"
>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly values: Record<string, string>;
  readonly fieldErrors: Readonly<Record<string, ApiErrorCode>>;

  constructor(
    status: number,
    code: ApiErrorCode,
    fieldErrors: Record<string, ApiErrorCode> = {},
    values: Record<string, string> = {},
  ) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.values = values;
  }
}

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && STAFF_ROLES.some((role) => role === value);
}

export function parseCurrentUser(value: unknown): CurrentUser | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  if (!("id" in value) || !("email" in value) || !("roles" in value) || !("is_active" in value)) {
    return null;
  }
  if (
    typeof value.id !== "string" ||
    typeof value.email !== "string" ||
    !Array.isArray(value.roles)
  ) {
    return null;
  }
  if (value.is_active !== true) {
    return null;
  }
  const displayName =
    "display_name" in value && typeof value.display_name === "string" ? value.display_name : null;
  const roles = value.roles.filter(isStaffRole);
  return {
    id: value.id,
    email: value.email,
    displayName,
    roles,
    isActive: true,
  };
}
