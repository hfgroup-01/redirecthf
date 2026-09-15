"use client";

import { m } from "framer-motion";

/** Chave ON/OFF acessível (role=switch), com o botão deslizando por mola. */
export function Switch({
  on,
  onChange,
  disabled = false,
  labelOn = "ON",
  labelOff = "OFF",
  size = "md",
  title,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  labelOn?: string;
  labelOff?: string;
  size?: "sm" | "md";
  title?: string;
}) {
  const h = size === "sm" ? "h-5 w-10" : "h-7 w-14";
  const dot = size === "sm" ? "h-4 w-4" : "h-6 w-6";
  const move = size === "sm" ? 20 : 28;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={title ?? (on ? labelOn : labelOff)}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!on)}
      className={`inline-flex min-h-8 items-center gap-2 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <span className={`relative inline-block ${h} rounded-full transition-colors duration-200 ${on ? "bg-ok" : "bg-border"}`}>
        <m.span
          className={`absolute left-0.5 top-0.5 ${dot} rounded-full bg-white shadow`}
          animate={{ x: on ? move : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 32, mass: 0.6 }}
        />
      </span>
      <span className={`text-xs font-semibold transition-colors duration-200 ${on ? "text-green-300" : "text-muted"}`}>{on ? labelOn : labelOff}</span>
    </button>
  );
}
