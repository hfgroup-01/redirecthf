"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/api";
import { CopyButton } from "@/components/CopyButton";
import { Field, Msg } from "@/components/ui";
import type { Client, Domain, Link, LinkMode, Role } from "@/lib/types";

interface Props {
  link?: Link;
  /** Admin: todos os clientes. Cliente: lista vazia (o cliente é fixo). */
  clients: Client[];
  /** Domínios visíveis: admin = todos; cliente = só os dele. */
  domains: Domain[];
  defaultClientId?: string;
  role: Role;
}

export function LinkForm({ link, clients, domains, defaultClientId, role }: Props) {
  const router = useRouter();
  const clienteInicial = clients.find((c) => c.id === (link?.clientId ?? defaultClientId));
  const [f, setF] = useState({
    clientId: link?.clientId ?? defaultClientId ?? "",
    domainId: link?.domainId ?? clienteInicial?.defaultDomainId ?? "",
    code: link?.code ?? "",
    label: link?.label ?? "",
    destinationUrl: link?.destinationUrl ?? clienteInicial?.defaultUrl ?? "",
    mode: (link?.mode ?? "redirect") as LinkMode,
    appendQuery: link?.appendQuery ?? true,
    pageTitle: link?.pageTitle ?? "",
    pageBody: link?.pageBody ?? "",
    active: link?.active ?? true,
  });
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [criado, setCriado] = useState<Link | null>(null);
  const [salvando, setSalvando] = useState(false);
  const up = (k: keyof typeof f, v: string | boolean) => setF({ ...f, [k]: v });

  // Admin: o domínio precisa ter o mesmo dono do link (cliente escolhido, ou sem dono).
  const dominiosVisiveis = role === "admin" ? domains.filter((d) => (d.clientId ?? "") === (f.clientId || "")) : domains;
  const domainIdValido = dominiosVisiveis.some((d) => d.id === f.domainId) ? f.domainId : "";

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        setSalvando(true);
        try {
          const body = role === "admin" ? { ...f, domainId: domainIdValido } : { ...f, clientId: undefined, domainId: domainIdValido };
          if (link) {
            await api(`/api/v1/links/${link.id}`, { method: "PATCH", body });
            setMsg({ tipo: "ok", texto: "Link salvo." });
          } else {
            const r = await api<{ link: Link }>("/api/v1/links", { body });
            setCriado(r.link);
            setF({ ...f, code: "", label: "" });
            setMsg({ tipo: "ok", texto: `Link criado: ${r.link.url ?? r.link.code}` });
          }
          router.refresh();
        } catch (err) {
          setMsg({ tipo: "erro", texto: (err as Error).message });
        } finally {
          setSalvando(false);
        }
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        {role === "admin" ? (
          <Field label="Cliente" hint="Define de quem é o link. Só aparecem os domínios desse cliente.">
            <select
              className="input"
              value={f.clientId}
              onChange={(e) => {
                const c = clients.find((x) => x.id === e.target.value);
                setF({ ...f, clientId: e.target.value, domainId: c?.defaultDomainId ?? "", destinationUrl: f.destinationUrl || c?.defaultUrl || "" });
              }}
            >
              <option value="">— sem cliente (domínios sem dono) —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field
          label="Domínio"
          hint={
            dominiosVisiveis.length
              ? "O código só funciona neste domínio: a URL do template é https://<domínio>/{{1}}."
              : role === "admin"
                ? "Nenhum domínio com esse dono. Vincule um domínio ao cliente em Domínios."
                : "Nenhum domínio vinculado a você ainda. Fale com o administrador."
          }
        >
          <select className="input" value={domainIdValido} onChange={(e) => up("domainId", e.target.value)} required>
            <option value="">— escolha —</option>
            {dominiosVisiveis.map((d) => (
              <option key={d.id} value={d.id}>
                {d.hostname}
                {d.status !== "active" ? ` (${d.status})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Código" hint={link ? "Trocar o código quebra links já enviados." : "Vazio = gerado (6 caracteres). Ex.: promo-abril"}>
          <input className="input mono" value={f.code} onChange={(e) => up("code", e.target.value)} placeholder="automático" />
        </Field>
        <Field label="Etiqueta" hint="Só para identificar (campanha, template, etc.).">
          <input className="input" value={f.label} onChange={(e) => up("label", e.target.value)} placeholder="Template reunião confirmada · set/26" />
        </Field>
        <Field label="Modo">
          <select className="input" value={f.mode} onChange={(e) => up("mode", e.target.value)}>
            <option value="redirect">Redirect (302) para a URL de destino</option>
            <option value="page">Página white (informativa, sem redirect)</option>
          </select>
        </Field>
        <Field
          label="URL de destino"
          hint="Para onde a pessoa vai ao clicar. Pode ser trocada a qualquer momento. Use {lead} para encaixar o id/CPF/telefone do lead: https://site.com/order/{lead} com {{1}} = codigo.ID vira https://site.com/order/ID."
        >
          <input className="input" value={f.destinationUrl} onChange={(e) => up("destinationUrl", e.target.value)} placeholder="https://…  ou  https://site.com/order/{lead}" />
        </Field>
        {f.mode === "page" ? (
          <>
            <Field label="Título da página (opcional)" hint="Sobrescreve o título da página white só neste link.">
              <input className="input" value={f.pageTitle} onChange={(e) => up("pageTitle", e.target.value)} />
            </Field>
            <Field label="Texto da página (opcional)">
              <textarea className="input" rows={2} value={f.pageBody} onChange={(e) => up("pageBody", e.target.value)} />
            </Field>
          </>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.appendQuery} onChange={(e) => up("appendQuery", e.target.checked)} />
          Repassar parâmetros da URL (?utm_…, ?l=lead) para o destino
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.active} onChange={(e) => up("active", e.target.checked)} />
          Ativo <span className="text-xs text-muted">(pausado = mostra a página white)</span>
        </label>
      </div>
      {msg ? <Msg tipo={msg.tipo}>{msg.texto}</Msg> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" disabled={salvando || !domainIdValido}>
          {salvando ? "Salvando…" : link ? "Salvar" : "Criar link"}
        </button>
        {criado?.url ? <CopyButton text={criado.url} label="Copiar URL criada" small={false} /> : null}
      </div>
    </form>
  );
}
