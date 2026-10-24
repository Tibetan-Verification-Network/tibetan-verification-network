import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Card({ className, ...props }: ComponentProps<"article">) {
  return <article data-slot="card" className={cn("card", className)} {...props} />;
}

function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("grid gap-1", className)} {...props} />;
}

function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 data-slot="card-title" className={cn("card-title", className)} {...props} />;
}

function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="card-description" className={cn("card-summary", className)} {...props} />;
}

export { Card, CardDescription, CardHeader, CardTitle };
