import { useCallback } from "react";

import { useStaffDirectory } from "../api/editorial/queries";
import { useAuth } from "../auth/useAuth";
import { can } from "./roles";

/**
 * Turns user ids into names using the staff directory. Roles that cannot read the directory
 * (approvers) see a shortened id instead, which is enough to tell two people apart.
 */
export function useUserNames(): (id: string | null | undefined) => string {
  const { user } = useAuth();
  const directory = useStaffDirectory(can.triage(user));
  const members = directory.data?.items;
  return useCallback(
    (id) => {
      if (id === null || id === undefined) {
        return "";
      }
      if (user !== null && id === user.id) {
        return user.displayName ?? user.email;
      }
      const found = members?.find((member) => member.id === id);
      return found ? (found.display_name ?? found.email) : id.slice(0, 8);
    },
    [members, user],
  );
}
