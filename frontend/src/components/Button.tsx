import type { ButtonHTMLAttributes } from "react";

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }) {
  const classes = ["button", `button-${variant}`, className].filter(Boolean).join(" ");
  return <button className={classes} type={type} {...props} />;
}
