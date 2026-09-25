/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Ban } from "lucide-react";
import { Popover } from "@plane/propel/popover";
import { cn } from "@plane/utils";

/** Keeps focus where it is: a toolbar click must not blur the board or a text field being edited. */
const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();

/** Plait clears the selection when a pointer is released outside its board, except on elements carrying this class. */
export const PLAIT_ATTACHED_CLASS = "plait-board-attached";

export const CONTROL_BUTTON_CLASS =
  "grid size-7 shrink-0 place-items-center rounded-sm text-secondary hover:bg-layer-transparent-hover disabled:cursor-not-allowed disabled:opacity-40";

type ControlButtonProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
};

export function ControlButton({ label, active, disabled, onClick, children, className }: ControlButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn(CONTROL_BUTTON_CLASS, active && "bg-accent-subtle text-accent-primary", className)}
      onMouseDown={keepFocus}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Divider() {
  return <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-layer-3" />;
}

type SelectFieldProps<T extends string | number> = {
  label: string;
  value: T | null;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
};

/** A small native `<select>`: it is keyboard friendly and needs no popup layering. */
export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className,
}: SelectFieldProps<T>) {
  const known = value !== null && options.some((option) => option.value === value);
  return (
    <select
      title={label}
      aria-label={label}
      className={cn(
        "text-xs h-7 max-w-32 shrink-0 rounded-sm border border-subtle bg-surface-1 px-1 text-secondary",
        className
      )}
      value={known ? String(value) : ""}
      onChange={(event) => {
        const picked = options.find((option) => String(option.value) === event.target.value);
        if (picked) onChange(picked.value);
      }}
    >
      {!known && <option value="" hidden />}
      {options.map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

const SWATCHES = [
  "#1f2937",
  "#6b7280",
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#fecaca",
  "#fed7aa",
  "#fef08a",
  "#bbf7d0",
  "#bfdbfe",
];

type ColorControlProps = {
  label: string;
  value: string | null;
  /** Label of the swatch that clears the color; omitted when the color cannot be cleared. */
  clearLabel?: string;
  icon: ReactNode;
  onChange: (color: string | null) => void;
};

/** A colour pop-up: preset swatches, an optional "clear", and the browser's own picker for anything else. */
export function ColorControl({ label, value, clearLabel, icon, onChange }: ColorControlProps) {
  const customRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // The native picker fires `input` for every drag; `change` fires once when it closes.
  useEffect(() => {
    const input = customRef.current;
    if (!input) return;
    const commit = () => onChangeRef.current(input.value);
    input.addEventListener("change", commit);
    return () => input.removeEventListener("change", commit);
  });

  return (
    <Popover>
      <Popover.Button
        title={label}
        aria-label={label}
        className={cn(CONTROL_BUTTON_CLASS, "relative")}
        onMouseDown={keepFocus}
      >
        {icon}
        <span
          aria-hidden
          className="absolute inset-x-1.5 bottom-0.5 h-1 rounded-full border border-subtle"
          style={{ backgroundColor: value ?? "transparent" }}
        />
      </Popover.Button>
      <Popover.Panel
        side="bottom"
        align="start"
        positionerClassName="z-[130]"
        className={cn(PLAIT_ATTACHED_CLASS, "w-44 rounded-md border border-subtle bg-surface-1 p-2 shadow-raised-200")}
      >
        <div className="grid grid-cols-8 gap-1" role="group" aria-label={label}>
          {SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              title={color}
              aria-label={color}
              aria-pressed={value?.toLowerCase() === color}
              className={cn(
                "size-4 rounded-full border border-strong",
                value?.toLowerCase() === color && "ring-2 ring-accent-strong ring-offset-1"
              )}
              style={{ backgroundColor: color }}
              onMouseDown={keepFocus}
              onClick={() => onChange(color)}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            ref={customRef}
            type="color"
            aria-label={label}
            className="h-6 w-8 shrink-0 cursor-pointer rounded-sm border border-subtle bg-transparent p-0"
            defaultValue={value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#3b82f6"}
          />
          {clearLabel && (
            <button
              type="button"
              className="text-xs flex min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 text-secondary hover:bg-layer-transparent-hover"
              onMouseDown={keepFocus}
              onClick={() => onChange(null)}
            >
              <Ban className="size-3 shrink-0" />
              <span className="truncate">{clearLabel}</span>
            </button>
          )}
        </div>
      </Popover.Panel>
    </Popover>
  );
}
