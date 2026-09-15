"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/api";
import { Field, Msg } from "@/components/ui";
import type { Client, Domain } from "@/lib/types";

/** `domains` = domínios do cliente + domínios sem dono (um sem dono escolhido como padrão passa a ser do cliente). */
export function ClientForm({ client, domains }: { client?: Client; domains: Domain[] }) {
  const router = useRouter();
  const [f, setF] = useState({
    name: client?.name ?? "",
    slug: client?.slug ?? "",
    phone: client?.phone ?? "",
    notes: client?.notes ?? "",
    defaultDomainId: client?.defaultDomainId ?? "",
    defaultUrl: client?.defaultUrl ?? "",
    active: client?.active ?? true,
  });
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const up = (k: keyof typeof f, v: string | boolean) => setF({ ...f, [k]: v });

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        setSalvando(true);
        try {
          if (client) {
            await api(`/api/v1/clients/${client.id}`, { method: "PATCH", body: f });
            setMsg({ tipo: "ok", texto: "Cliente salvo." });
            router.refresh();
          } else {
            const r = await api<{ client: Client }>("/api/v1/clients", { body: f });
            router.push(`/admin/clientes/${r.client.id}`);
            router.refresh();
          }
        } catch (err) {
          setMsg({ tipo: "erro", texto: (err as Error).message });
        } finally {
          setSalvando(false);
        }
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nome">
          <input className="input" required value={f.name} onChange={(e) => up("name", e.target.value)} placeholder="Ex.: Clínica Sorriso" />
        </Field>
        <Field label="Slug" hint="Identificador curto (usado na API). Vazio = gerado do nome.">
          <input className="input mono" value={f.slug} onChange={(e) => up("slug", e.target.value)} placeholder="clinica-sorriso" />
        </Field>
        <Field label="WhatsApp / contato">
          <input className="input" value={f.phone} onChange={(e) => up("phone", e.target.value)} placeholder="+55 11 9…" />
        </Field>
        <Field label="Domínio padrão" hint="Pré-selecionado ao criar links. Um domínio sem dono escolhido aqui passa a pertencer ao cliente.">
          <select className="input" value={f.defaultDomainId} onChange={(e) => up("defaultDomainId", e.target.value)}>
            <option value="">— nenhum —</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.hostname}
                {d.clientId ? "" : " (sem dono)"}
                {d.status !== "active" ? ` (${d.status})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="URL de destino padrão" hint="Pré-preenche o destino ao criar links para este cliente.">
            <input className="input" value={f.defaultUrl} onChange={(e) => up("defaultUrl", e.target.value)} placeholder="https://wa.me/55…  ou  https://site-do-cliente.com/agendar" />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Observações">
            <textarea className="input" rows={2} value={f.notes} onChange={(e) => up("notes", e.target.value)} />
          </Field>
        </div>
        {client ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.active} onChange={(e) => up("active", e.target.checked)} />
            Cliente ativo <span className="text-xs text-muted">(desmarcar pausa TODOS os links dele: caem na página white)</span>
          </label>
        ) : null}
      </div>
      {msg ? <Msg tipo={msg.tipo}>{msg.texto}</Msg> : null}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={salvando}>
          {salvando ? "Salvando…" : client ? "Salvar" : "Criar cliente"}
        </button>
      </div>
    </form>
  );
}
