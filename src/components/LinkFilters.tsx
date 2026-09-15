"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { Client, Domain, Role } from "@/lib/types";

export interface FiltrosAtuais {
  clientId?: string;
  domainId?: string;
  active?: string;
  mode?: string;
  q?: string;
}

export function LinkFilters({ clients, domains, atual, role }: { clients: Client[]; domains: Domain[]; atual: FiltrosAtuais; role: Role }) {
  const router = useRouter();
  const path = usePathname();
  const [q, setQ] = useState(atual.q ?? "");

  const aplicar = (patch: Partial<FiltrosAtuais>) => {
    const p = new URLSearchParams();
    const next = { ...atual, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    router.push(`${path}?${p.toString()}`);
  };

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        aplicar({ q });
      }}
    >
      <input className="input w-full sm:w-56" placeholder="Buscar código, etiqueta, URL…" value={q} onChange={(e) => setQ(e.target.value)} />
      {role === "admin" ? (
        <select className="input w-full sm:w-48" value={atual.clientId ?? ""} onChange={(e) => aplicar({ clientId: e.target.value })}>
          <option value="">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : null}
      <select className="input w-full sm:w-44" value={atual.domainId ?? ""} onChange={(e) => aplicar({ domainId: e.target.value })}>
        <option value="">Todos os domínios</option>
        {domains.map((d) => (
          <option key={d.id} value={d.id}>
            {d.hostname}
          </option>
        ))}
      </select>
      <select className="input w-[calc(50%-0.25rem)] sm:w-32" value={atual.active ?? ""} onChange={(e) => aplicar({ active: e.target.value })}>
        <option value="">Ativos e pausados</option>
        <option value="1">Ativos</option>
        <option value="0">Pausados</option>
      </select>
      <select className="input w-[calc(50%-0.25rem)] sm:w-32" value={atual.mode ?? ""} onChange={(e) => aplicar({ mode: e.target.value })}>
        <option value="">Todos os modos</option>
        <option value="redirect">Redirect</option>
        <option value="page">Página</option>
      </select>
      <button className="btn">Filtrar</button>
      {Object.values(atual).some(Boolean) ? (
        <button type="button" className="btn" onClick={() => router.push(path)}>
          Limpar
        </button>
      ) : null}
    </form>
  );
}
