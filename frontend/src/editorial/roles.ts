import type { CurrentUser, StaffRole } from "../api/types";

/**
 * Role checks that decide which controls to show. They mirror the API policy so people are
 * not offered actions that will be refused, but they are hints only. The API enforces every
 * rule and answers 404 or 403 to anything the role may not do.
 */
export function hasAnyRole(user: CurrentUser | null, ...roles: StaffRole[]): boolean {
  return user !== null && roles.some((role) => user.roles.includes(role));
}

export const can = {
  triage: (user: CurrentUser | null) => hasAnyRole(user, "researcher", "editor"),
  revealContact: (user: CurrentUser | null) => hasAnyRole(user, "editor"),
  createInvestigation: (user: CurrentUser | null) => hasAnyRole(user, "researcher", "editor"),
  assign: (user: CurrentUser | null) => hasAnyRole(user, "editor"),
  writeEvidence: (user: CurrentUser | null) => hasAnyRole(user, "researcher", "editor"),
  editDraft: (user: CurrentUser | null) => hasAnyRole(user, "researcher", "editor"),
  review: (user: CurrentUser | null) => hasAnyRole(user, "editor"),
  requestChanges: (user: CurrentUser | null) => hasAnyRole(user, "editor", "approver"),
  decide: (user: CurrentUser | null) => hasAnyRole(user, "approver"),
  manageTopics: (user: CurrentUser | null) => hasAnyRole(user, "editor"),
  viewAudit: (user: CurrentUser | null) => hasAnyRole(user, "editor", "approver"),
  classifyArchive: (user: CurrentUser | null) => hasAnyRole(user, "editor"),
  administer: (user: CurrentUser | null) => hasAnyRole(user, "platform_administrator"),
  workEditorially: (user: CurrentUser | null) =>
    hasAnyRole(user, "researcher", "editor", "approver"),
};
