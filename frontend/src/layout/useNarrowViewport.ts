import { useEffect, useState } from "react";

const NARROW_QUERY = "(max-width: 40rem)";

function matchesQuery(query: string): boolean {
  if (typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(query).matches;
}

export function useNarrowViewport(query = NARROW_QUERY): boolean {
  const [narrow, setNarrow] = useState(() => matchesQuery(query));

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia(query);
    const onChange = () => setNarrow(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return narrow;
}
