import type { ReactNode } from "react";

import { Alert as UiAlert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const toneClass = {
  error: undefined,
  success: "border-l-4 border-l-[#1c5a2b]",
  info: "border-l-4 border-l-[#2d3a5f]",
} as const;

export function Alert({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: ReactNode;
}) {
  return (
    <UiAlert
      variant={tone === "error" ? "destructive" : "default"}
      role={tone === "error" ? "alert" : "status"}
      className={cn(toneClass[tone])}
    >
      {children}
    </UiAlert>
  );
}
