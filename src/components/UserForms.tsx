"use client";

import { KeyRound, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/api";
import { CopyButton } from "@/components/CopyButton";
import { Switch } from "@/components/Switch";
import { Badge, Field, Msg, fmtData } from "@/components/ui";
import type { Client, Role, UserView } from "@/lib/types";

type M = { tipo: "ok" | "erro" | "info"; texto: string } | null;

/** Senha temporária mostrada UMA vez, com botão de copiar. */
function SenhaTemporaria({ email, senha }: { email: string; senha: string }) {
  const texto = `Acesso ao painel HF\nLogin: ${email}\nSenha temporária: ${senha}\n(Ao entrar, o sistema pede para criar uma senha nova.)`;
  return (
    <Msg tipo="info">
      <div className="text-sm">
        Senha temporária de <strong>{email}</strong>: <code className="mono rounded bg-bg px-2 py-0.5">{senha}</code>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <CopyButton text={texto} label="Copiar login + senha" />
        <span className="text-muted">Ela não aparece de novo. No primeiro acesso o usuário cria a senha definitiva.</span>
      </div>
    </Msg>
  );
}

/** Cria um login (de cliente ou de admin). */
export function CreateUserForm({ role, clientId, clients }: { role: Role; clientId?: string; clients?: Client[] }) {
  const router = useRouter();
  const [f, setF] = useState({ email: "", name: "", clientId: clientId ?? "", password: "" });
  const [temp, setTemp] = useState<{ email: string; senha: string } | null>(null);
  const [msg, setMsg] = useState<M>(null);
  const [ocupado, setOcupado] = useState(false);
  const up = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        setTemp(null);
        setOcupado(true);
        try {
          const r = await api<{ user: UserView; tempPassword: string | null }>("/api/v1/users", {
            body: { email: f.email, name: f.name, role, clientId: role === "client" ? f.clientId : null, password: f.password || undefined },
          });
          if (r.tempPassword) setTemp({ email: r.user.email, senha: r.tempPassword });
          else setMsg({ tipo: "ok", texto: `Usuário ${r.user.email} criado.` });
          setF({ email: "", name: "", clientId: clientId ?? "", password: "" });
          router.refresh();
        } catch (err) {
          setMsg({ tipo: "erro", texto: (err as Error).message });
        } finally {
          setOcupado(false);
        }
      }}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="E-mail (login)">
          <input className="input" type="email" required value={f.email} onChange={(e) => up("email", e.target.value)} placeholder="cliente@empresa.com.br" />
        </Field>
        <Field label="Nome (opcional)">
          <input className="input" value={f.name} onChange={(e) => up("name", e.target.value)} />
        </Field>
        {role === "client" && clients ? (
          <Field label="Cliente">
            <select className="input" required value={f.clientId} onChange={(e) => up("clientId", e.target.value)}>
              <option value="">— escolha —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Senha (opcional)" hint="Vazio = o HF gera uma temporária e mostra aqui.">
            <input className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => up("password", e.target.value)} />
          </Field>
        )}
      </div>
      {msg ? <Msg tipo={msg.tipo}>{msg.texto}</Msg> : null}
      {temp ? <SenhaTemporaria email={temp.email} senha={temp.senha} /> : null}
      <button className="btn btn-primary" disabled={ocupado || !f.email || (role === "client" && !f.clientId)}>
        <UserPlus size={14} /> {ocupado ? "Criando…" : role === "admin" ? "Criar administrador" : "Criar login do cliente"}
      </button>
    </form>
  );
}

/** Tabela de usuários com resetar senha, ativar/desativar e apagar. */
export function UsersTable({ users, showRole = false, meId }: { users: UserView[]; showRole?: boolean; meId?: string }) {
  const router = useRouter();
  const [temp, setTemp] = useState<{ email: string; senha: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const chamar = async (id: string, fn: () => Promise<void>) => {
    setOcupado(id);
    setErro(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  if (!users.length) return <p className="text-sm text-muted">Nenhum login ainda.</p>;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Nome</th>
              {showRole ? <th>Papel</th> : null}
              <th>Último acesso</th>
              <th>Ativo</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="mono text-xs">
                  {u.email}
                  {u.mustChangePassword ? <span className="ml-2 text-[11px] text-amber-300">senha temporária</span> : null}
                </td>
                <td>{u.name ?? "—"}</td>
                {showRole ? (
                  <td>
                    {u.role === "admin" ? <Badge tone="accent">admin</Badge> : <Badge tone="muted">cliente</Badge>}
                    {u.clientName ? <div className="text-xs text-muted">{u.clientName}</div> : null}
                  </td>
                ) : null}
                <td className="whitespace-nowrap text-xs text-muted">{fmtData(u.lastLoginAt)}</td>
                <td>
                  <Switch
                    on={u.active}
                    size="sm"
                    disabled={ocupado !== null || u.id === meId}
                    onChange={(v) => void chamar(u.id, async () => void (await api(`/api/v1/users/${u.id}`, { method: "PATCH", body: { active: v } })))}
                  />
                </td>
                <td>
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={ocupado !== null}
                      title="Gerar nova senha temporária (derruba as sessões do usuário)"
                      onClick={() => {
                        if (!confirm(`Gerar nova senha temporária para ${u.email}?`)) return;
                        void chamar(u.id, async () => {
                          const r = await api<{ tempPassword: string }>(`/api/v1/users/${u.id}/reset-password`, { method: "POST" });
                          setTemp({ email: u.email, senha: r.tempPassword });
                        });
                      }}
                    >
                      <KeyRound size={13} /> Resetar senha
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      disabled={ocupado !== null || u.id === meId}
                      title="Apagar login"
                      aria-label="Apagar login"
                      onClick={() => {
                        if (!confirm(`Apagar o login ${u.email}?`)) return;
                        void chamar(u.id, async () => void (await api(`/api/v1/users/${u.id}`, { method: "DELETE" })));
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {erro ? <Msg tipo="erro">{erro}</Msg> : null}
      {temp ? <SenhaTemporaria email={temp.email} senha={temp.senha} /> : null}
    </div>
  );
}
