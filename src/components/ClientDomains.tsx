"use client";

import { Link2Off, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/api";
import { CopyButton } from "@/components/CopyButton";
import { Badge, Msg, statusDominio } from "@/components/ui";
import type { Client, Domain } from "@/lib/types";

/** Domínios do cliente (admin): vincular um sem dono, desvincular, e a URL do template de cada um. */
export function ClientDomains({ client, domains, unassigned }: { client: Client; domains: Domain[]; unassigned: Domain[] }) {
  const router = useRouter();
  const [escolhido, setEscolhido] = useState("");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const atribuir = async (domainId: string, clientId: string | null) => {
    setOcupado(true);
    setMsg(null);
    try {
      await api(`/api/v1/domains/${domainId}`, { method: "PATCH", body: { clientId } });
      setEscolhido("");
      router.refresh();
    } catch (e) {
      setMsg({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-3">
      {domains.length ? (
        <ul className="space-y-2">
          {domains.map((d) => {
            const st = statusDominio(d.status);
            const url = `https://${d.hostname}/{{1}}`;
            return (
              <li key={d.id} className="rounded-md border border-border bg-bg p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/admin/dominios/${d.id}`} className="mono font-medium hover:underline">
                    {d.hostname}
                  </Link>
                  <div className="flex items-center gap-2">
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {d.fbCode ? <Badge tone="ok">meta tag</Badge> : <Badge tone="muted">sem meta tag</Badge>}
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={ocupado}
                      title="Desvincular do cliente (os links do domínio ficam sem dono)"
                      onClick={() => {
                        if (confirm(`Desvincular ${d.hostname} de ${client.name}? Os links desse domínio deixam de aparecer para o cliente.`)) void atribuir(d.id, null);
                      }}
                    >
                      <Link2Off size={13} />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="mono rounded border border-border bg-panel px-2 py-1 text-xs">{url}</code>
                  <CopyButton text={url} label="Copiar URL do template" />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nenhum domínio vinculado. Vincule um abaixo ou crie em Domínios já escolhendo este cliente.</p>
      )}
      {unassigned.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-64" value={escolhido} onChange={(e) => setEscolhido(e.target.value)}>
            <option value="">— domínio sem dono —</option>
            {unassigned.map((d) => (
              <option key={d.id} value={d.id}>
                {d.hostname}
              </option>
            ))}
          </select>
          <button type="button" className="btn" disabled={ocupado || !escolhido} onClick={() => void atribuir(escolhido, client.id)}>
            <Plus size={14} /> Vincular ao cliente
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted">
          Não há domínios sem dono. <Link href="/admin/dominios" className="text-blue-300 hover:underline">Adicione um</Link> escolhendo este cliente.
        </p>
      )}
      {msg ? <Msg tipo={msg.tipo}>{msg.texto}</Msg> : null}
    </div>
  );
}
