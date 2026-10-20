import { useEffect, useRef } from "react";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.turnstile) {
        resolve(window.turnstile);
      } else {
        reject(new Error("Turnstile did not initialise"));
      }
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Turnstile could not be loaded"));
    };
    document.head.append(script);
  });
  return scriptPromise;
}

/**
 * Cloudflare Turnstile widget. Reports a token once the visitor passes the check and null
 * when it expires or fails, so the form can block submission until a fresh token exists.
 */
export function Turnstile({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);

  useEffect(() => {
    callback.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    void loadTurnstile()
      .then((api) => {
        if (cancelled || container.current === null) {
          return;
        }
        widgetId = api.render(container.current, {
          sitekey: siteKey,
          callback: (token) => callback.current(token),
          "expired-callback": () => callback.current(null),
          "error-callback": () => callback.current(null),
        });
      })
      .catch(() => callback.current(null));
    return () => {
      cancelled = true;
      if (widgetId !== null) {
        window.turnstile?.remove(widgetId);
      }
    };
  }, [siteKey]);

  return <div ref={container} className="turnstile" />;
}
