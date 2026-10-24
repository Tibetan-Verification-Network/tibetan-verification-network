import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
      {...props}
    />
  );
}

export function SearchIcon() {
  return (
    <Icon className="icon">
      <circle cx="11" cy="11" r="6.25" />
      <path d="M16 16.5 20 20.5" strokeLinecap="round" />
    </Icon>
  );
}

export function ClearIcon() {
  return (
    <Icon className="icon">
      <path d="M7 7l10 10M17 7 7 17" strokeLinecap="round" />
    </Icon>
  );
}

export function GlobeIcon() {
  return (
    <Icon className="icon icon-globe">
      <circle cx="12" cy="12" r="8.25" />
      <path d="M3.75 12h16.5M12 3.75c2.2 2.3 3.3 5.1 3.3 8.25s-1.1 5.95-3.3 8.25c-2.2-2.3-3.3-5.1-3.3-8.25s1.1-5.95 3.3-8.25Z" />
    </Icon>
  );
}

export function EyeIcon() {
  return (
    <Icon className="icon">
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.4" />
    </Icon>
  );
}

export function UserIcon() {
  return (
    <Icon className="icon">
      <circle cx="12" cy="8.25" r="3.1" />
      <path d="M5.2 19.2c1.3-3.1 3.5-4.6 6.8-4.6s5.5 1.5 6.8 4.6" strokeLinecap="round" />
    </Icon>
  );
}

export function EyeOffIcon() {
  return (
    <Icon className="icon">
      <path d="M4 5.5 19 18.5" strokeLinecap="round" />
      <path
        d="M9.2 7.2A8 8 0 0 1 12 6.5c6 0 9.5 5.5 9.5 5.5a16 16 0 0 1-3.2 3.6M6.2 8.7C4 10.2 2.5 12 2.5 12S6 17.5 12 17.5c1.1 0 2.1-.2 3-.6"
        strokeLinecap="round"
      />
    </Icon>
  );
}
