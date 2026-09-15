"use client";

/** Chave ON/OFF. */
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
  const move = size === "sm" ? "translate-x-5" : "translate-x-7";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!on)}
      className={`inline-flex items-center gap-2 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <span className={`relative inline-block ${h} rounded-full transition ${on ? "bg-ok" : "bg-border"}`}>
        <span className={`absolute left-0.5 top-0.5 ${dot} rounded-full bg-white shadow transition ${on ? move : ""}`} />
      </span>
      <span className={`text-xs font-semibold ${on ? "text-green-300" : "text-muted"}`}>{on ? labelOn : labelOff}</span>
    </button>
  );
}
