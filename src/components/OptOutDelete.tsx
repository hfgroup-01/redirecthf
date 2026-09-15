"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/api";

export function OptOutDelete({ id }: { id: number }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm btn-danger"
      disabled={ocupado}
      title="Remover este registro"
      aria-label="Remover este pedido de opt-out"
      onClick={async () => {
        if (!confirm("Remover este pedido de opt-out?")) return;
        setOcupado(true);
        try {
          await api(`/api/v1/optouts/${id}`, { method: "DELETE" });
          router.refresh();
        } finally {
          setOcupado(false);
        }
      }}
    >
      <Trash2 size={13} />
    </button>
  );
}
