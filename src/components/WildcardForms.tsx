"use client";

import { RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/api";
import { Passos, type Passo } from "@/components/DomainForms";
import { Field, Msg } from "@/components/ui";
import type { Wildcard } from "@/lib/types";

interface Resp {
  wildcard: Wildcard;
  steps: Passo[];
  needsConfirm?: boolean;
  existing?: { type: string; content: string; proxied: boolean }[];
}

/** Aviso de `*` existente + botão de substituir. */
function Confirmar({ resp, onConfirm, ocupado }: { resp: Resp; onConfirm: () => void; ocupado: boolean }) {
  if (!resp.needsConfirm) return null;
  return (
    <Msg tipo="info">
      <div className="text-sm">
        Já existe um registro curinga em <code className="mono">*.{resp.wildcard.baseHostname}</code>:{" "}
        {resp.existing?.map((r) => `${r.type} → ${r.content}${r.proxied ? "" : " (sem proxy)"}`).join(", ")}.
      </div>
      <div className="mt-1 text-xs text-muted">Nada foi alterado. Ao substituir, subdomínios que hoje caem nesse registro passam a chegar no HF.</div>
      <button type="button" className="btn btn-primary mt-2" disabled={ocupado} onClick={onConfirm}>
        Substituir e apontar para o HF
      </button>
    </Msg>
  );
}

export function WildcardCreateForm({ hasDefaultToken, dnsTargetValue }: { hasDefaultToken: boolean; dnsTargetValue: string }) {
  const router = useRouter();
  const [base, setBase] = useState("");
  const [token, setToken] = useState("");
  const [resp, setResp] = useState<Resp | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const confirmar = async () => {
    if (!resp) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await api<Resp>(`/api/v1/wildcards/${resp.wildcard.id}/dns`, { body: { confirmReplace: true } });
      setResp(r);
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setErro(null);
        setResp(null);
        setOcupado(true);
        try {
          const r = await api<Resp>("/api/v1/wildcards", { body: { base, apiToken: token || undefined, provision: true } });
          setResp(r);
          setBase("");
          setToken("");
          router.refresh();
        } catch (err) {
          setErro((err as Error).message);
        } finally {
          setOcupado(false);
        }
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Raiz da zona" hint="Ex.: lumix10.cfd. O HF cria *.lumix10.cfd → alvo do DNS; qualquer nomedabm.lumix10.cfd nasce pronto.">
          <input className="input mono" required value={base} onChange={(e) => setBase(e.target.value)} placeholder="lumix10.cfd" />
        </Field>
        <Field label="API token (opcional)" hint={hasDefaultToken ? "Vazio = usa o token padrão das Configurações." : "Não há token padrão: informe um aqui ou em Configurações."}>
          <input className="input mono" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" placeholder="Zone:Read + DNS:Edit" />
        </Field>
      </div>
      {!dnsTargetValue ? <Msg tipo="erro">Defina o alvo do DNS em Configurações antes.</Msg> : null}
      {erro ? <Msg tipo="erro">{erro}</Msg> : null}
      {resp ? <Passos passos={resp.steps} /> : null}
      {resp ? <Confirmar resp={resp} onConfirm={() => void confirmar()} ocupado={ocupado} /> : null}
      <button className="btn btn-primary" disabled={ocupado || !base.trim() || !dnsTargetValue}>
        <ShieldCheck size={14} /> {ocupado ? "Configurando…" : "Adicionar zona curinga"}
      </button>
    </form>
  );
}

export function WildcardActions({ wildcard }: { wildcard: Wildcard }) {
  const router = useRouter();
  const [resp, setResp] = useState<Resp | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const rodar = async (acao: "dns" | "check", body?: unknown) => {
    setOcupado(acao);
    setErro(null);
    setResp(null);
    try {
      const r = await api<Resp>(`/api/v1/wildcards/${wildcard.id}/${acao}`, { method: "POST", body: body ?? {} });
      setResp(r);
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
        <button type="button" className="btn btn-sm" disabled={ocupado !== null} onClick={() => void rodar("dns")} title="Cria/corrige o registro * na Cloudflare">
          <ShieldCheck size={13} /> {ocupado === "dns" ? "…" : "DNS"}
        </button>
        <button type="button" className="btn btn-sm" disabled={ocupado !== null} onClick={() => void rodar("check")} title="Testa um host aleatório sob o curinga">
          <RefreshCw size={13} /> {ocupado === "check" ? "…" : "Verificar"}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-danger"
          disabled={ocupado !== null}
          title="Remover do HF (o registro * na Cloudflare fica)"
          aria-label="Remover zona curinga"
          onClick={async () => {
            if (!confirm(`Remover a zona curinga ${wildcard.baseHostname} do HF? O registro * na Cloudflare não é apagado.`)) return;
            setOcupado("del");
            try {
              await api(`/api/v1/wildcards/${wildcard.id}`, { method: "DELETE" });
              router.refresh();
            } catch (e) {
              setErro((e as Error).message);
            } finally {
              setOcupado(null);
            }
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
      {erro ? <Msg tipo="erro">{erro}</Msg> : null}
      {resp ? <Passos passos={resp.steps} /> : null}
      {resp ? <Confirmar resp={resp} ocupado={ocupado !== null} onConfirm={() => void rodar("dns", { confirmReplace: true })} /> : null}
    </div>
  );
}
