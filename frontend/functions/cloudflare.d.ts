// Minimal runtime types for Cloudflare Pages Functions, so the project needs no extra
// type package. Only what these functions use is declared.
declare class HTMLRewriter {
  on(
    selector: string,
    handler: {
      element(element: {
        setAttribute(name: string, value: string): unknown;
        setInnerContent(content: string, options?: { html?: boolean }): unknown;
        append(content: string, options?: { html?: boolean }): unknown;
      }): void;
    },
  ): HTMLRewriter;
  transform(response: Response): Response;
}

interface EventContext<Env> {
  request: Request;
  env: Env;
  next(request?: Request | string): Promise<Response>;
}

type PagesFunction<Env> = (context: EventContext<Env>) => Response | Promise<Response>;
