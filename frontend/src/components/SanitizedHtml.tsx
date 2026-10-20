import DOMPurify from "dompurify";
import { useMemo } from "react";

import type { Locale } from "../i18n/translate";

// Mirrors the tag allow-list of the API sanitizer (backend/app/core/markdown.py).
const ALLOWED_TAGS = [
  "a",
  "blockquote",
  "br",
  "code",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
];

let hooked = false;

function ensureLinkHook(): void {
  if (hooked) {
    return;
  }
  hooked = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node.hasAttribute("href")) {
      node.setAttribute("rel", "nofollow noopener noreferrer");
    }
  });
}

function sanitize(html: string): string {
  ensureLinkHook();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "colspan", "rowspan"],
    ALLOWED_URI_REGEXP: /^https?:/i,
  });
}

/**
 * The only place server-rendered HTML enters the page. The API already sanitizes it when a
 * version is published. This is a second, independent pass.
 */
export function SanitizedHtml({
  html,
  lang,
  className,
}: {
  html: string;
  lang?: Locale;
  className?: string;
}) {
  const clean = useMemo(() => sanitize(html), [html]);
  return (
    <div
      className={["prose", className].filter(Boolean).join(" ")}
      lang={lang}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
