"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { CopyButton } from "@/components/CopyButton";
import { Field, Msg } from "@/components/ui";
import type { Client, Domain, Link, LinkMode, Role, Wildcard } from "@/lib/types";

interface Props {
  link?: Link;
  /** Admin: todos os clientes. Cliente: lista vazia (o cliente é fixo). */
  clients: Client[];
  /** Domínios visíveis: admin = todos; cliente = só os dele. */
  domains: Domain[];
  /** Zonas curinga prontas (só admin): permitem criar a BM aqui mesmo. */
  wildcards?: Wildcard[];
  defaultClientId?: string;
  role: Role;
}

/** Valor sentinela do select de domínio para "cadastrar a BM agora". */
const NOVO = "__novo";

/** "Driggo Restaurante" -> "driggorestaurante": o hostname não aceita espaço nem acento. */
function normalizarLabel(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]/g, "");
}

function valores(link: Link | undefined, cliente: Client | undefined, defaultClientId?: string) {
  return {
    clientId: link?.clientId ?? defaultClientId ?? "",
    domainId: link?.domainId ?? cliente?.defaultDomainId ?? "",
    code: link?.code ?? "",
    label: link?.label ?? "",
    destinationUrl: link?.destinationUrl ?? cliente?.defaultUrl ?? "",
    mode: (link?.mode ?? "redirect") as LinkMode,
    appendQuery: link?.appendQuery ?? true,
    pageTitle: link?.pageTitle ?? "",
    pageBody: link?.pageBody ?? "",
    active: link?.active ?? true,
  };
}

export function LinkForm({ link, clients, domains, wildcards = [], defaultClientId, role }: Props) {
  const router = useRouter();
  const clienteInicial = clients.find((c) => c.id === (link?.clientId ?? defaultClientId));
  const [f, setF] = useState(() => valores(link, clienteInicial, defaultClientId));
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [criado, setCriado] = useState<Link | null>(null);
  const [salvando, setSalvando] = useState(false);
  const up = (k: keyof typeof f, v: string | boolean) => setF({ ...f, [k]: v });

  // Cadastrar a BM junto com o link: só faz sentido criando, e só para o admin.
  const zonas = wildcards.filter((w) => w.status === "active" || w.status === "dns_ok");
  const podeCriarSub = !link && role === "admin" && zonas.length > 0;
  const [sub, setSub] = useState({ ligado: false, label: "", base: "" });
  const subBase = sub.base || zonas[0]?.baseHostname || "";
  const subHost = sub.label && subBase ? `${sub.label}.${subBase}` : "";

  // O servidor mandou dados novos (ex.: o modo foi trocado pelos botões da linha):
  // recarrega o formulário, senão o próximo "Salvar" desfaria a mudança.
  const carimbo = link?.updatedAt;
  useEffect(() => {
    if (link) setF(valores(link, clienteInicial, defaultClientId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carimbo]);

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
          const base = role === "admin" ? { ...f, domainId: domainIdValido } : { ...f, clientId: undefined, domainId: domainIdValido };
          const body = sub.ligado ? { ...base, domainId: undefined, subdomain: { label: sub.label, base: subBase } } : base;
          if (link) {
            await api(`/api/v1/links/${link.id}`, { method: "PATCH", body });
            setMsg({ tipo: "ok", texto: "Link salvo." });
          } else {
            const r = await api<{ link: Link }>("/api/v1/links", { body });
            setCriado(r.link);
            // Fica no domínio recém-criado: o normal é cadastrar vários links na mesma BM.
            setF({ ...f, code: "", label: "", domainId: r.link.domainId ?? f.domainId });
            setSub({ ligado: false, label: "", base: subBase });
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
              : podeCriarSub
                ? "Nenhum domínio com esse dono ainda — use “cadastrar a BM agora”."
                : role === "admin"
                  ? "Nenhum domínio com esse dono. Vincule um domínio ao cliente em Domínios."
                  : "Nenhum domínio vinculado a você ainda. Fale com o administrador."
          }
        >
          <select
            className="input"
            value={sub.ligado ? NOVO : domainIdValido}
            onChange={(e) => {
              const v = e.target.value;
              setSub({ ...sub, ligado: v === NOVO });
              if (v !== NOVO) up("domainId", v);
            }}
            required
          >
            <option value="">— escolha —</option>
            {dominiosVisiveis.map((d) => (
              <option key={d.id} value={d.id}>
                {d.hostname}
                {d.status !== "active" ? ` (${d.status})` : ""}
              </option>
            ))}
            {podeCriarSub ? <option value={NOVO}>+ cadastrar a BM agora…</option> : null}
          </select>
        </Field>
        {sub.ligado ? (
          <>
            <Field
              label="Nome da BM"
              hint={subHost ? `O domínio ${subHost} é criado junto com o link.` : "Só letras, números e hífen. Ex.: driggorestaurante"}
            >
              <input
                className="input mono"
                required
                value={sub.label}
                onChange={(e) => setSub({ ...sub, label: normalizarLabel(e.target.value) })}
                placeholder="driggorestaurante"
              />
            </Field>
            <Field label="Zona curinga" hint="A zona já tem o DNS pronto: o subdomínio nasce funcionando.">
              <select className="input" value={subBase} onChange={(e) => setSub({ ...sub, base: e.target.value })}>
                {zonas.map((w) => (
                  <option key={w.id} value={w.baseHostname}>
                    *.{w.baseHostname}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}
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
        <button className="btn btn-primary" disabled={salvando || (sub.ligado ? !sub.label || !subBase : !domainIdValido)}>
          {salvando ? "Salvando…" : link ? "Salvar" : "Criar link"}
        </button>
        {criado?.url ? <CopyButton text={criado.url} label="Copiar URL criada" small={false} /> : null}
      </div>
    </form>
  );
}
