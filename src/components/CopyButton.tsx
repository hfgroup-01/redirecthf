"use client";

import { AnimatePresence, m } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({ text, label = "Copiar", small = true }: { text: string; label?: string; small?: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className={`btn ${small ? "btn-sm" : ""} ${ok ? "border-ok/40 text-green-300" : ""}`}
      aria-label={`${label}: ${text}`}
      aria-live="polite"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          prompt("Copie:", text);
        }
      }}
      title={text}
    >
      <AnimatePresence mode="wait" initial={false}>
        <m.span
          key={ok ? "ok" : "copy"}
          className="inline-flex items-center gap-2"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.15 }}
        >
          {ok ? <Check size={14} /> : <Copy size={14} />}
          {ok ? "Copiado" : label}
        </m.span>
      </AnimatePresence>
    </button>
  );
}
