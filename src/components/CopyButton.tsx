"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({ text, label = "Copiar", small = true }: { text: string; label?: string; small?: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className={`btn ${small ? "btn-sm" : ""}`}
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
      {ok ? <Check size={14} /> : <Copy size={14} />}
      {ok ? "Copiado" : label}
    </button>
  );
}
