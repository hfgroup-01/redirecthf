"use client";

import { AlertTriangle, CheckCircle2, RefreshCw, Search, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { PageConfigFields } from "@/components/PageConfigFields";
import { Switch } from "@/components/Switch";
import { Field, Msg } from "@/components/ui";
import type { Client, Domain, PageConfig, Role, Wildcard } from "@/lib/types";

export interface Passo {
  step: string;
  status: "ok" | "error" | "warn";
  message?: string;
}

interface CnpjResp {
  pageConfig: PageConfig;
  resumo: { razaoSocial: string; nomeFantasia: string; situacao: string; municipio: string; uf: string; cnae: string; abertura: string };
}

export function Passos({ passos }: { passos: Passo[] }) {
  if (!passos.length) return null;
  return (
    <ul className="space-y-1 rounded-md border border-border bg-bg p-3 text-sm">
      {passos.map((p, i) => (
        <li key={i} className="flex items-start gap-2">
          {p.status === "ok" ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" />
          ) : p.status === "warn" ? (
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
          ) : (
            <XCircle size={16} className="mt-0.5 shrink-0 text-danger" />
          )}
          <div>
            <div className="font-medium">{p.step}</div>
            {p.message ? <div className="text-xs text-muted">{p.message}</div> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

const HINT_FB =
  "Business Manager → Configurações → Segurança da marca → Domínios → Adicionar → opção \"Meta-tag\": copie só o valor do content. Vários códigos: separe por vírgula.";

// ---------------------------------------------------------------- criar (admin)
export function DomainCreateForm({
  hasDefaultToken,
  dnsTargetValue,
  wildcards,
  clients,
}: {
  hasDefaultToken: boolean;
  dnsTargetValue: string;
  wildcards: Wildcard[];
  clients: Client[];
}) {
  const router = useRouter();
  const prontas = wildcards.filter((w) => w.status === "active" || w.status === "dns_ok");
  const [modo, setModo] = useState<"curinga" | "livre">(prontas.length ? "curinga" : "livre");
  const [f, setF] = useState({ base: prontas[0]?.baseHostname ?? "", label: "", hostname: "", clientId: "", token: "", cnpj: "", fbCode: "", provision: true });
  const [passos, setPassos] = useState<Passo[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const up = (k: keyof typeof f, v: string | boolean) => setF({ ...f, [k]: v });
  const labelOk = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(f.label.trim().toLowerCase());
  const pronto = modo === "curinga" ? Boolean(f.base) && labelOk : Boolean(f.hostname.trim());

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setErro(null);
        setPassos([]);
        setAvisos([]);
        setOcupado(true);
        try {
          const r = await api<{ domain: Domain; steps: Passo[]; avisos: string[] }>("/api/v1/domains", {
            body: {
              ...(modo === "curinga" ? { base: f.base, label: f.label.trim().toLowerCase() } : { hostname: f.hostname }),
              clientId: f.clientId || null,
              apiToken: modo === "livre" && f.token ? f.token : undefined,
              cnpj: f.cnpj || undefined,
              fbCode: f.fbCode || undefined,
              provision: f.provision,
            },
          });
          setPassos(r.steps);
          setAvisos(r.avisos ?? []);
          setF({ ...f, label: "", hostname: "", token: "", cnpj: "", fbCode: "" });
          router.refresh();
        } catch (err) {
          setErro((err as Error).message);
        } finally {
          setOcupado(false);
        }
      }}
    >
      {prontas.length ? (
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={modo === "curinga"} onChange={() => setModo("curinga")} /> Subdomínio de zona curinga (sem DNS, nasce pronto)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={modo === "livre"} onChange={() => setModo("livre")} /> Hostname livre (cria um registro DNS)
          </label>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {modo === "curinga" ? (
          <>
            <Field label="Nome da BM (subdomínio)" hint={f.label && f.base ? `Vai virar ${f.label.trim().toLowerCase()}.${f.base}` : "Só letras, números e hífen. Ex.: luiscomercioltda"}>
              <input className="input mono" required value={f.label} onChange={(e) => up("label", e.target.value)} placeholder="nomedabm" />
            </Field>
            <Field label="Zona curinga">
              <select className="input" value={f.base} onChange={(e) => up("base", e.target.value)}>
                {prontas.map((w) => (
                  <option key={w.id} value={w.baseHostname}>
                    *.{w.baseHostname}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : (
          <Field label="Hostname completo" hint="Ex.: go.cliente.com.br — precisa estar numa zona da sua conta Cloudflare.">
            <input className="input mono" required value={f.hostname} onChange={(e) => up("hostname", e.target.value)} placeholder="go.cliente.com.br" />
          </Field>
        )}
        <Field label="Cliente dono" hint="O cliente vê e gerencia este domínio no painel dele.">
          <select className="input" value={f.clientId} onChange={(e) => up("clientId", e.target.value)}>
            <option value="">— sem dono (só o admin) —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="CNPJ da empresa (opcional)" hint="Com o CNPJ a página white já nasce preenchida no padrão de agendamento.">
          <input className="input mono" value={f.cnpj} onChange={(e) => up("cnpj", e.target.value)} placeholder="00.000.000/0001-00" />
        </Field>
        <Field label="Código de verificação do Facebook (opcional)" hint={HINT_FB}>
          <input className="input mono" value={f.fbCode} onChange={(e) => up("fbCode", e.target.value)} placeholder="ex.: 5v8x1k2m9q0p3r7t" />
        </Field>
        {modo === "livre" ? (
          <Field
            label="API token da Cloudflare (opcional)"
            hint={hasDefaultToken ? "Vazio = usa o token padrão das Configurações." : "Não há token padrão: informe um aqui ou em Configurações."}
          >
            <input className="input mono" type="password" value={f.token} onChange={(e) => up("token", e.target.value)} placeholder="Zone:Read + DNS:Edit" autoComplete="off" />
          </Field>
        ) : null}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.provision} onChange={(e) => up("provision", e.target.checked)} />
        Publicar agora {modo === "curinga" ? "(só testa se já responde)" : "(criar o DNS na Cloudflare e testar)"}
        {dnsTargetValue ? <span className="mono text-xs text-muted">(→ {dnsTargetValue})</span> : <span className="text-xs text-warn">(defina o alvo do DNS em Configurações)</span>}
      </label>
      {erro ? <Msg tipo="erro">{erro}</Msg> : null}
      {avisos.map((a) => (
        <Msg key={a} tipo="erro">
          {a}
        </Msg>
      ))}
      <Passos passos={passos} />
      <button className="btn btn-primary" disabled={ocupado || !pronto}>
        {ocupado ? "Publicando…" : "Adicionar e publicar"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------- chave ON/OFF
export function DomainSwitch({ domain, size = "sm" }: { domain: Domain; size?: "sm" | "md" }) {
  const router = useRouter();
  const [on, setOn] = useState(domain.redirectsEnabled);
  const [ocupado, setOcupado] = useState(false);
  // Acompanha o valor do servidor (outra aba, outra tela, refresh).
  useEffect(() => {
    setOn(domain.redirectsEnabled);
  }, [domain.redirectsEnabled, domain.updatedAt]);
  return (
    <Switch
      on={on}
      size={size}
      disabled={ocupado}
      labelOn="ON · redirect"
      labelOff="OFF · página white"
      title="ON: os códigos deste domínio redirecionam. OFF: todos mostram a página white."
      onChange={async (v) => {
        setOcupado(true);
        setOn(v);
        try {
          await api(`/api/v1/domains/${domain.id}`, { method: "PATCH", body: { redirectsEnabled: v } });
          router.refresh();
        } catch (e) {
          setOn(!v);
          alert((e as Error).message);
        } finally {
          setOcupado(false);
        }
      }}
    />
  );
}

// ---------------------------------------------------------------- ações
export function DomainActions({ domain, compact = false, role }: { domain: Domain; compact?: boolean; role: Role }) {
  const router = useRouter();
  const [passos, setPassos] = useState<Passo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const rodar = async (acao: "dns" | "check" | "meta") => {
    setOcupado(acao);
    setErro(null);
    setPassos([]);
    try {
      if (acao === "meta") {
        const r = await api<{ ok: boolean; detail: string }>(`/api/v1/domains/${domain.id}/meta`, { method: "POST" });
        setPassos([{ step: "Meta tag do Facebook", status: r.ok ? "ok" : "warn", message: r.detail }]);
      } else {
        const r = await api<{ steps: Passo[] }>(`/api/v1/domains/${domain.id}/${acao}`, { method: "POST" });
        setPassos(r.steps);
      }
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {role === "admin" ? (
          <button type="button" className="btn btn-sm" disabled={ocupado !== null} onClick={() => void rodar("dns")} title="Cria/corrige o registro DNS na Cloudflare (ou usa a zona curinga)">
            <ShieldCheck size={13} /> {ocupado === "dns" ? "Publicando…" : compact ? "DNS" : "Publicar / DNS"}
          </button>
        ) : null}
        <button type="button" className="btn btn-sm" disabled={ocupado !== null} onClick={() => void rodar("check")} title="Confere se o domínio já chega neste HF">
          <RefreshCw size={13} /> {ocupado === "check" ? "…" : "Verificar"}
        </button>
        {domain.fbCode ? (
          <button type="button" className="btn btn-sm" disabled={ocupado !== null} onClick={() => void rodar("meta")} title="Confere se a meta tag do Facebook está no ar">
            <Search size={13} /> {ocupado === "meta" ? "…" : "Meta tag"}
          </button>
        ) : null}
        {role === "admin" ? (
          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={ocupado !== null}
            title="Remover domínio"
            aria-label="Remover domínio"
            onClick={async () => {
              const n = domain.linksCount ?? 0;
              if (!confirm(`Remover ${domain.hostname} do HF?${n ? ` Ele tem ${n} link(s), que serão apagados.` : ""}`)) return;
              const removerDns = !domain.wildcardId && domain.dnsRecordId ? confirm("Apagar também o registro DNS na Cloudflare?") : false;
              setOcupado("del");
              try {
                const r = await api<{ aviso: string | null }>(`/api/v1/domains/${domain.id}?removeDns=${removerDns ? 1 : 0}&force=1`, { method: "DELETE" });
                if (r.aviso) alert(r.aviso);
                router.push("/admin/dominios");
                router.refresh();
              } catch (e) {
                setErro((e as Error).message);
              } finally {
                setOcupado(null);
              }
            }}
          >
            <Trash2 size={13} />
            {compact ? "" : "Remover"}
          </button>
        ) : null}
      </div>
      {erro ? <Msg tipo="erro">{erro}</Msg> : null}
      <Passos passos={passos} />
    </div>
  );
}

// ---------------------------------------------------------------- editor
export function DomainEditor({
  domain,
  pageDefaults,
  role,
  clients = [],
}: {
  domain: Domain;
  pageDefaults: PageConfig;
  role: Role;
  clients?: Client[];
}) {
  const router = useRouter();
  const [hostname, setHostname] = useState(domain.hostname);
  const [token, setToken] = useState("");
  const [removeToken, setRemoveToken] = useState(false);
  const [active, setActive] = useState(domain.active);
  const [clientId, setClientId] = useState(domain.clientId ?? "");
  const [fbCode, setFbCode] = useState(domain.fbCode ?? "");
  const [cnpj, setCnpj] = useState(domain.cnpj ?? "");
  const [page, setPage] = useState<PageConfig>(domain.pageConfig ?? {});
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro" | "info"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  const preencherPeloCnpj = async () => {
    setMsg(null);
    setBuscando(true);
    try {
      const r = await api<CnpjResp>("/api/v1/cnpj", { body: { cnpj } });
      setPage(r.pageConfig);
      setMsg({
        tipo: "info",
        texto: `Preenchido: ${r.resumo.razaoSocial}${r.resumo.nomeFantasia ? ` (${r.resumo.nomeFantasia})` : ""} · ${r.resumo.municipio}/${r.resumo.uf} · ${r.resumo.situacao}. Revise e clique em Salvar.`,
      });
    } catch (e) {
      setMsg({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setBuscando(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg(null);
          setOcupado(true);
          try {
            const body: Record<string, unknown> = { fbCode, cnpj, pageConfig: page };
            if (role === "admin") {
              Object.assign(body, { hostname, apiToken: token, removeToken, active });
              if ((domain.clientId ?? "") !== clientId) body.clientId = clientId || null;
            }
            await api(`/api/v1/domains/${domain.id}`, { method: "PATCH", body });
            setMsg({ tipo: "ok", texto: "Salvo e publicado: a página do domínio já está atualizada." });
            setToken("");
            setRemoveToken(false);
            setPreviewKey((k) => k + 1);
            router.refresh();
          } catch (err) {
            setMsg({ tipo: "erro", texto: (err as Error).message });
          } finally {
            setOcupado(false);
          }
        }}
      >
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold">Verificação do Facebook (Business Manager)</h2>
          <Field label="Código(s) da meta tag facebook-domain-verification" hint={HINT_FB}>
            <input className="input mono" value={fbCode} onChange={(e) => setFbCode(e.target.value)} placeholder="ex.: 5v8x1k2m9q0p3r7t" />
          </Field>
          <p className="text-xs text-muted">
            Ao salvar, a tag entra no <code className="mono">&lt;head&gt;</code> da raiz <code className="mono">https://{domain.hostname}/</code>. Depois use o botão <em>Meta tag</em> acima para conferir e clique em <em>Verificar</em> na BM.
          </p>
        </div>

        <div className="card space-y-3">
          <h2 className="text-sm font-semibold">Empresa (CNPJ)</h2>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Field label="CNPJ" hint="Consulta a Receita e monta a página no padrão de agendamento (você pode ajustar depois).">
                <input className="input mono" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0001-00" />
              </Field>
            </div>
            <button type="button" className="btn mb-5" disabled={buscando || cnpj.replace(/\D/g, "").length !== 14} onClick={() => void preencherPeloCnpj()}>
              <Search size={14} /> {buscando ? "Consultando…" : "Preencher pelo CNPJ"}
            </button>
          </div>
        </div>

        <div className="card space-y-3">
          <h2 className="text-sm font-semibold">Página white deste domínio</h2>
          <p className="text-xs text-muted">Campos vazios herdam o padrão global. O bloco de opt-out e a política de privacidade entram automaticamente.</p>
          <PageConfigFields value={page} onChange={setPage} placeholders={pageDefaults} />
        </div>

        {role === "admin" ? (
          <div className="card space-y-3">
            <h2 className="text-sm font-semibold">Domínio (só admin)</h2>
            <Field label="Cliente dono" hint="Os links do domínio vão junto quando o dono muda.">
              <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">— sem dono (só o admin) —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hostname" hint={domain.wildcardId ? `Coberto pela zona curinga *.${domain.wildcardBase}. Trocar o hostname exige publicar de novo.` : "Trocar o hostname exige publicar o DNS de novo."}>
              <input className="input mono" value={hostname} onChange={(e) => setHostname(e.target.value)} />
            </Field>
            <Field label="API token próprio" hint={domain.hasToken ? "Há um token salvo. Vazio = manter." : "Sem token próprio: usa o padrão das Configurações."}>
              <input className="input mono" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" placeholder={domain.hasToken ? "••••••••" : "opcional"} />
            </Field>
            {domain.hasToken ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={removeToken} onChange={(e) => setRemoveToken(e.target.checked)} />
                Remover o token próprio (passa a usar o padrão)
              </label>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Domínio ativo <span className="text-xs text-muted">(inativo = o HF responde 404 nesse host)</span>
            </label>
          </div>
        ) : null}

        {msg ? <Msg tipo={msg.tipo}>{msg.texto}</Msg> : null}
        <button className="btn btn-primary" disabled={ocupado}>
          {ocupado ? "Salvando…" : "Salvar e publicar"}
        </button>
      </form>

      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Pré-visualização</h2>
          <button type="button" className="btn btn-sm" onClick={() => setPreviewKey((k) => k + 1)}>
            <RefreshCw size={13} /> Atualizar
          </button>
        </div>
        <iframe key={previewKey} src={`/hf/preview?domain=${domain.id}`} className="h-[900px] w-full rounded-md border border-border bg-white" title="Pré-visualização" />
      </div>
    </div>
  );
}
