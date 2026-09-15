"use client";

import { Eye, EyeOff, RefreshCw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/api";
import { CopyButton } from "@/components/CopyButton";
import { Passos, type Passo } from "@/components/DomainForms";
import { PageConfigFields } from "@/components/PageConfigFields";
import { Field, Msg } from "@/components/ui";
import type { DnsType, PageConfig, PanelHostSource } from "@/lib/types";

type M = { tipo: "ok" | "erro"; texto: string } | null;

export function DnsTargetForm({ mode, value }: { mode: DnsType; value: string }) {
  const router = useRouter();
  const [m, setM] = useState<DnsType>(mode);
  const [v, setV] = useState(value);
  const [msg, setMsg] = useState<M>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        try {
          await api("/api/v1/settings", { method: "PATCH", body: { dnsTargetMode: m, dnsTargetValue: v } });
          setMsg({ tipo: "ok", texto: "Alvo do DNS salvo. Domínios novos usarão isso; nos existentes clique em Publicar / DNS." });
          router.refresh();
        } catch (err) {
          setMsg({ tipo: "erro", texto: (err as Error).message });
        }
      }}
    >
      <div className="grid gap-3 md:grid-cols-[180px_1fr]">
        <Field label="Tipo de registro">
          <select className="input" value={m} onChange={(e) => setM(e.target.value as DnsType)}>
            <option value="CNAME">CNAME (túnel Cloudflare)</option>
            <option value="A">A (IP da VPS)</option>
          </select>
        </Field>
        <Field label={m === "A" ? "IP público do servidor" : "Hostname do túnel"} hint={m === "A" ? "Ex.: 203.0.113.10 (a VPS precisa servir HTTPS ou usar SSL Flexible)." : "Ex.: 1234abcd-…-…​.cfargotunnel.com (ID do túnel + .cfargotunnel.com)."}>
          <input className="input mono" value={v} onChange={(e) => setV(e.target.value)} placeholder={m === "A" ? "203.0.113.10" : "<tunnel-id>.cfargotunnel.com"} />
        </Field>
      </div>
      {msg ? <Msg tipo={msg.tipo}>{msg.texto}</Msg> : null}
      <button className="btn btn-primary">Salvar alvo do DNS</button>
    </form>
  );
}

export function DefaultTokenForm({ hasToken }: { hasToken: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState<M>(null);
  const [ocupado, setOcupado] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        setOcupado(true);
        try {
          const r = await api<{ avisos: string[] }>("/api/v1/settings", { method: "PATCH", body: { defaultCfToken: token } });
          setMsg({ tipo: r.avisos.length ? "erro" : "ok", texto: r.avisos.length ? r.avisos.join(" ") : "Token validado e salvo (criptografado)." });
          setToken("");
          router.refresh();
        } catch (err) {
          setMsg({ tipo: "erro", texto: (err as Error).message });
        } finally {
          setOcupado(false);
        }
      }}
    >
      <Field label="API token padrão da Cloudflare" hint={`${hasToken ? "Há um token salvo. " : "Nenhum token salvo. "}Permissões: Zone → Zone: Read, Zone → DNS: Edit (em todas as zonas que você usar).`}>
        <input className="input mono" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" placeholder={hasToken ? "•••••••• (vazio = manter)" : "cole o token"} />
      </Field>
      {msg ? <Msg tipo={msg.tipo}>{msg.texto}</Msg> : null}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={ocupado || !token.trim()}>
          {ocupado ? "Validando…" : "Salvar token"}
        </button>
        {hasToken ? (
          <button
            type="button"
            className="btn btn-danger"
            onClick={async () => {
              if (!confirm("Remover o token padrão?")) return;
              await api("/api/v1/settings", { method: "PATCH", body: { defaultCfToken: null } });
              router.refresh();
            }}
          >
            Remover
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** Host onde o painel responde (além de localhost). */
export function PanelHostForm({ host, source }: { host: string; source: PanelHostSource }) {
  const router = useRouter();
  const [v, setV] = useState(host);
  const [msg, setMsg] = useState<M>(null);
  const [passos, setPassos] = useState<Passo[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const doEnv = source === "env";
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        setPassos([]);
        setOcupado("save");
        try {
          const r = await api<{ avisos: string[] }>("/api/v1/settings", { method: "PATCH", body: { panelHost: v } });
          setMsg({ tipo: r.avisos.length ? "erro" : "ok", texto: r.avisos.length ? r.avisos.join(" ") : v ? `Painel liberado em ${v} (e em localhost).` : "Painel só em localhost." });
          router.refresh();
        } catch (err) {
          setMsg({ tipo: "erro", texto: (err as Error).message });
        } finally {
          setOcupado(null);
        }
      }}
    >
      <Field
        label="Host do painel"
        hint={
          doEnv
            ? "Definido por HF_ADMIN_HOST no ambiente (tem prioridade sobre este campo)."
            : "Ex.: hfredirect.online. Vazio = o painel só abre em localhost. Nunca use um domínio de redirect."
        }
      >
        <input className="input mono" value={v} disabled={doEnv} onChange={(e) => setV(e.target.value)} placeholder="painel.suaagencia.com.br" />
      </Field>
      {msg ? <Msg tipo={msg.tipo}>{msg.texto}</Msg> : null}
      <Passos passos={passos} />
      <div className="flex flex-wrap gap-2">
        {!doEnv ? (
          <button className="btn btn-primary" disabled={ocupado !== null}>
            {ocupado === "save" ? "Salvando…" : "Salvar host do painel"}
          </button>
        ) : null}
        {host ? (
          <button
            type="button"
            className="btn"
            disabled={ocupado !== null}
            title="Cria/corrige o registro DNS do host do painel na Cloudflare apontando para o HF"
            onClick={async () => {
              setOcupado("dns");
              setMsg(null);
              setPassos([]);
              try {
                const r = await api<{ steps: Passo[] }>("/api/v1/settings/panel-host/dns", { method: "POST" });
                setPassos(r.steps);
              } catch (err) {
                setMsg({ tipo: "erro", texto: (err as Error).message });
              } finally {
                setOcupado(null);
              }
            }}
          >
            <ShieldCheck size={14} /> {ocupado === "dns" ? "Provisionando…" : "Provisionar DNS do painel"}
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function ApiKeyPanel({ apiKey }: { apiKey: string }) {
  const router = useRouter();
  const [mostrar, setMostrar] = useState(false);
  const [key, setKey] = useState(apiKey);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <code className="mono flex-1 truncate rounded-md border border-border bg-bg px-3 py-2 text-sm">{mostrar ? key : "•".repeat(28)}</code>
        <button type="button" className="btn" onClick={() => setMostrar((v) => !v)}>
          {mostrar ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <CopyButton text={key} small={false} />
        <button
          type="button"
          className="btn"
          onClick={async () => {
            if (!confirm("Gerar nova chave? A atual para de funcionar imediatamente (n8n etc. precisam ser atualizados).")) return;
            const r = await api<{ apiKey: string }>("/api/v1/settings/api-key", { method: "POST" });
            setKey(r.apiKey);
            setMostrar(true);
            router.refresh();
          }}
        >
          <RefreshCw size={14} /> Regenerar
        </button>
      </div>
      <p className="text-xs text-muted">
        Envie como header <code className="mono">x-api-key</code> (ou <code className="mono">Authorization: Bearer</code>) nas chamadas a <code className="mono">/api/v1/*</code>. A chave age como administrador.
      </p>
    </div>
  );
}

export function PageDefaultsForm({ value }: { value: PageConfig }) {
  const router = useRouter();
  const [page, setPage] = useState<PageConfig>(value);
  const [msg, setMsg] = useState<M>(null);
  const [previewKey, setPreviewKey] = useState(0);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg(null);
          try {
            await api("/api/v1/settings", { method: "PATCH", body: { pageDefaults: page } });
            setMsg({ tipo: "ok", texto: "Padrão da página white salvo." });
            setPreviewKey((k) => k + 1);
            router.refresh();
          } catch (err) {
            setMsg({ tipo: "erro", texto: (err as Error).message });
          }
        }}
      >
        <PageConfigFields value={page} onChange={setPage} />
        {msg ? <Msg tipo={msg.tipo}>{msg.texto}</Msg> : null}
        <button className="btn btn-primary">Salvar padrão</button>
      </form>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Pré-visualização (padrão global)</span>
          <button type="button" className="btn btn-sm" onClick={() => setPreviewKey((k) => k + 1)}>
            <RefreshCw size={13} /> Atualizar
          </button>
        </div>
        <iframe key={previewKey} src="/hf/preview" className="h-[640px] w-full rounded-md border border-border bg-white" title="Pré-visualização" />
      </div>
    </div>
  );
}

export function RetentionForm({ days }: { days: number }) {
  const router = useRouter();
  const [n, setN] = useState(String(days));
  const [msg, setMsg] = useState<M>(null);
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        try {
          await api("/api/v1/settings", { method: "PATCH", body: { clicksRetentionDays: Number(n) } });
          setMsg({ tipo: "ok", texto: "Salvo." });
          router.refresh();
        } catch (err) {
          setMsg({ tipo: "erro", texto: (err as Error).message });
        }
      }}
    >
      <Field label="Guardar o log de cliques por (dias)" hint="Os contadores por link não são apagados.">
        <input className="input w-32" type="number" min={1} value={n} onChange={(e) => setN(e.target.value)} />
      </Field>
      <button className="btn">Salvar</button>
      {msg ? <span className={`text-sm ${msg.tipo === "ok" ? "text-green-300" : "text-red-300"}`}>{msg.texto}</span> : null}
    </form>
  );
}
