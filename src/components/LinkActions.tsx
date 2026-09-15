"use client";

import { Pause, Pencil, Play, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/api";
import { CopyButton } from "@/components/CopyButton";
import { Switch } from "@/components/Switch";
import { Field, Msg } from "@/components/ui";
import type { Link, LinkMode } from "@/lib/types";

/** Ações rápidas na linha da tabela de links. */
export function LinkQuickActions({ link }: { link: Link }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const patch = async (body: Record<string, unknown>) => {
    setOcupado(true);
    setErro(null);
    try {
      await api(`/api/v1/links/${link.id}`, { method: "PATCH", body });
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {link.url ? <CopyButton text={link.url} label="URL" /> : null}
      <button
        type="button"
        className="btn btn-sm"
        disabled={ocupado}
        title="Trocar URL de destino"
        onClick={() => {
          const nova = prompt(`Nova URL de destino para /${link.code}:`, link.destinationUrl ?? "https://");
          if (nova && nova.trim()) void patch({ destinationUrl: nova.trim(), mode: "redirect" });
        }}
      >
        <Pencil size={13} /> Destino
      </button>
      <Switch
        on={link.active}
        size="sm"
        disabled={ocupado}
        title={link.active ? "ON: redireciona. Clique para OFF (página white)." : "OFF: página white. Clique para ON (redirect)."}
        onChange={(v) => void patch({ active: v })}
      />
      <button
        type="button"
        className="btn btn-sm btn-danger"
        disabled={ocupado}
        title="Excluir link"
        onClick={async () => {
          if (!confirm(`Excluir o link /${link.code}? Quem clicar verá a página white (404).`)) return;
          setOcupado(true);
          try {
            await api(`/api/v1/links/${link.id}`, { method: "DELETE" });
            router.refresh();
          } catch (e) {
            setErro((e as Error).message);
          } finally {
            setOcupado(false);
          }
        }}
      >
        <Trash2 size={13} />
      </button>
      {erro ? <span className="text-xs text-red-300">{erro}</span> : null}
    </div>
  );
}

/** Ações em massa para todos os links de um cliente. */
export function BulkLinkActions({ clientId, total }: { clientId: string; total: number }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const bulk = async (body: { destinationUrl?: string; mode?: LinkMode; active?: boolean }, confirmar: string) => {
    if (!confirm(confirmar)) return;
    setOcupado(true);
    setMsg(null);
    try {
      const r = await api<{ updated: number }>("/api/v1/links/bulk", { body: { clientId, ...body } });
      setMsg({ tipo: "ok", texto: `${r.updated} link(s) atualizado(s).` });
      router.refresh();
    } catch (e) {
      setMsg({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-3">
      <Field label={`Trocar o destino de TODOS os ${total} link(s) deste cliente`}>
        <div className="flex gap-2">
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://nova-url…" />
          <button
            type="button"
            className="btn btn-primary shrink-0"
            disabled={ocupado || !url.trim()}
            onClick={() => void bulk({ destinationUrl: url.trim(), mode: "redirect" }, `Apontar ${total} link(s) para ${url.trim()}?`)}
          >
            Aplicar
          </button>
        </div>
      </Field>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm" disabled={ocupado} onClick={() => void bulk({ active: false }, "Pausar todos os links? Eles passam a mostrar a página white.")}>
          <Pause size={13} /> Pausar todos
        </button>
        <button type="button" className="btn btn-sm" disabled={ocupado} onClick={() => void bulk({ active: true }, "Ativar todos os links?")}>
          <Play size={13} /> Ativar todos
        </button>
        <button type="button" className="btn btn-sm" disabled={ocupado} onClick={() => void bulk({ mode: "page" }, "Colocar todos em modo página white?")}>
          Modo página (todos)
        </button>
        <button type="button" className="btn btn-sm" disabled={ocupado} onClick={() => void bulk({ mode: "redirect" }, "Colocar todos em modo redirect?")}>
          Modo redirect (todos)
        </button>
      </div>
      {msg ? <Msg tipo={msg.tipo}>{msg.texto}</Msg> : null}
    </div>
  );
}
