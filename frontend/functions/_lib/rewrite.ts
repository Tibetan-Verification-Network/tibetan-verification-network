import { headTags, type PageMeta } from "./meta";

/** The slice of Cloudflare's `Element` that the rewriter uses. */
export interface RewriteElement {
  setAttribute(name: string, value: string): unknown;
  setInnerContent(content: string, options?: { html?: boolean }): unknown;
  append(content: string, options?: { html?: boolean }): unknown;
}

export interface ElementHandler {
  element(element: RewriteElement): void;
}

export interface RewriterLike {
  on(selector: string, handler: ElementHandler): unknown;
}

/**
 * Register the handlers that set `lang`, title, description, canonical, hreflang, and Open
 * Graph tags. Works with Cloudflare's `HTMLRewriter` and with a recording fake in tests.
 */
export function registerMetaHandlers(rewriter: RewriterLike, meta: PageMeta): void {
  rewriter.on("html", {
    element(element) {
      element.setAttribute("lang", meta.lang);
    },
  });
  rewriter.on("title", {
    element(element) {
      element.setInnerContent(meta.title);
    },
  });
  rewriter.on('meta[name="description"]', {
    element(element) {
      element.setAttribute("content", meta.description);
    },
  });
  rewriter.on("head", {
    element(element) {
      element.append(`\n${headTags(meta)}\n`, { html: true });
    },
  });
}
