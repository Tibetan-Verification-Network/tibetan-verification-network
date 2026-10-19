import { useEffect, useState } from "react";

const NARROW_QUERY = "(max-width: 40rem)";

function matchesNarrow(): boolean {
  if (typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(NARROW_QUERY).matches;
}

export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(matchesNarrow);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return narrow;
}
