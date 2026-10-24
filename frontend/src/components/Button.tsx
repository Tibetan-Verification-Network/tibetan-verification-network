import type { ButtonHTMLAttributes } from "react";

import { Button as UiButton } from "@/components/ui/button";

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }) {
  return (
    <UiButton
      variant={variant === "secondary" ? "outline" : "default"}
      className={className}
      type={type}
      {...props}
    />
  );
}
