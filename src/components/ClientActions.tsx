"use client";

import { Eye, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { Switch } from "@/components/Switch";
import type { Client } from "@/lib/types";

/** Excluir cliente (apaga os links dele em cascata; domínios e logins ficam/caem conforme o banco). */
export function ClientDeleteButton({ client, compact = false }: { client: Client; compact?: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm btn-danger"
      disabled={ocupado}
      title="Excluir cliente"
      aria-label="Excluir cliente"
      onClick={async () => {
        const n = client.linksCount ?? 0;
        const aviso =
          `Excluir o cliente "${client.name}"?` +
          (n ? `\n\nIsso apaga também os ${n} link(s) dele. Quem clicar nesses links passa a ver a página white (404).` : "") +
          "\n\nOs logins do cliente são apagados e os domínios ficam sem dono. Essa ação não tem volta.";
        if (!confirm(aviso)) return;
        setOcupado(true);
        try {
          await api(`/api/v1/clients/${client.id}`, { method: "DELETE" });
          router.push("/admin/clientes");
          router.refresh();
        } catch (e) {
          alert((e as Error).message);
        } finally {
          setOcupado(false);
        }
      }}
    >
      <Trash2 size={13} />
      {compact ? null : "Excluir cliente"}
    </button>
  );
}

/** Chave ON/OFF do cliente: OFF pausa todos os links dele (página white). */
export function ClientSwitch({ client }: { client: Client }) {
  const router = useRouter();
  const [on, setOn] = useState(client.active);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    setOn(client.active);
  }, [client.active, client.updatedAt]);
  return (
    <Switch
      on={on}
      size="sm"
      disabled={ocupado}
      labelOn="ON"
      labelOff="OFF"
      title={on ? "ON: links do cliente redirecionam. Clique para pausar todos." : "OFF: todos os links do cliente mostram a página white."}
      onChange={async (v) => {
        setOcupado(true);
        setOn(v);
        try {
          await api(`/api/v1/clients/${client.id}`, { method: "PATCH", body: { active: v } });
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

/** Admin entra no painel como o cliente (escopo dele), para ver o que ele vê. */
export function ImpersonateButton({ client, compact = false }: { client: Client; compact?: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm"
      disabled={ocupado}
      title="Ver o painel como este cliente"
      aria-label="Entrar como cliente"
      onClick={async () => {
        setOcupado(true);
        try {
          await api("/api/v1/auth/impersonate", { body: { clientId: client.id } });
          router.push("/admin");
          router.refresh();
        } catch (e) {
          alert((e as Error).message);
        } finally {
          setOcupado(false);
        }
      }}
    >
      <Eye size={13} /> {compact ? "" : "Entrar como cliente"}
    </button>
  );
}

/** Ações da linha na lista de clientes. */
export function ClientRowActions({ client }: { client: Client }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Link href={`/admin/clientes/${client.id}`} className="btn btn-sm" title="Editar cliente">
        <Pencil size={13} /> Editar
      </Link>
      <ImpersonateButton client={client} compact />
      <ClientDeleteButton client={client} compact />
    </div>
  );
}
