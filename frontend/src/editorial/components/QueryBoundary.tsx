import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { LoadingState } from "../../components/LoadingState";
import { EditorialError } from "./EditorialError";

/** Loading, error, and data states for one query, so screens do not each reinvent them. */
export function QueryBoundary<T>({
  query,
  children,
}: {
  query: Pick<UseQueryResult<T>, "isPending" | "isError" | "error" | "data">;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) {
    return <LoadingState />;
  }
  if (query.isError || query.data === undefined) {
    return <EditorialError error={query.error} />;
  }
  return <>{children(query.data)}</>;
}
