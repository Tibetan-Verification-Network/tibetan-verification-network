import type { ChangeEvent, ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClearIcon, SearchIcon } from "./icons";

export function SearchControl({
  id,
  label,
  hint,
  value,
  clearLabel,
  onChange,
  onClear,
  name = "q",
  maxLength = 200,
  overlay,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  value: string;
  clearLabel: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  name?: string;
  maxLength?: number;
  overlay?: ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      {hint ? (
        <p id={hintId} className="hint">
          {hint}
        </p>
      ) : null}
      <div className="search-control">
        <SearchIcon />
        {overlay}
        <Input
          id={id}
          type="search"
          name={name}
          value={value}
          maxLength={maxLength}
          autoComplete="off"
          aria-describedby={hintId}
          onChange={onChange}
        />
        {value.trim() !== "" ? (
          <button type="button" className="search-clear" aria-label={clearLabel} onClick={onClear}>
            <ClearIcon />
          </button>
        ) : null}
      </div>
    </div>
  );
}
