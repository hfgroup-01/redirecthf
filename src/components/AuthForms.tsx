"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/api";
import { Field, Msg } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setErro(null);
        setCarregando(true);
        try {
          const r = await api<{ mustChangePassword: boolean }>("/api/v1/auth/login", { body: { email, password: senha } });
          router.push(r.mustChangePassword ? "/admin/senha" : "/admin");
          router.refresh();
        } catch (err) {
          setErro((err as Error).message);
        } finally {
          setCarregando(false);
        }
      }}
    >
      <Field label="E-mail">
        <input className="input" type="email" autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Senha">
        <input className="input" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
      </Field>
      {erro ? <Msg tipo="erro">{erro}</Msg> : null}
      <button className="btn btn-primary w-full" disabled={carregando || !senha || !email}>
        {carregando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

/** Primeiro acesso: cria o administrador. `precisaProva` = existe senha antiga (v2) ou HF_ADMIN_PASSWORD. */
export function SetupForm({ precisaProva }: { precisaProva: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [prova, setProva] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (senha !== confirma) {
          setErro("As senhas não conferem.");
          return;
        }
        setErro(null);
        setCarregando(true);
        try {
          await api("/api/v1/auth/setup", { body: { email, name: nome, password: senha, currentAdminPassword: prova } });
          router.push("/admin/config");
          router.refresh();
        } catch (err) {
          setErro((err as Error).message);
        } finally {
          setCarregando(false);
        }
      }}
    >
      <Field label="Seu e-mail" hint="É o login do administrador.">
        <input className="input" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Nome (opcional)">
        <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
      </Field>
      <Field label="Senha" hint="Mínimo de 8 caracteres.">
        <input className="input" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
      </Field>
      <Field label="Confirmar senha">
        <input className="input" type="password" autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} />
      </Field>
      {precisaProva ? (
        <Field label="Senha antiga do admin" hint="Prova de que é você: a senha usada até agora, ou o HF_ADMIN_PASSWORD do .env.">
          <input className="input" type="password" value={prova} onChange={(e) => setProva(e.target.value)} />
        </Field>
      ) : null}
      {erro ? <Msg tipo="erro">{erro}</Msg> : null}
      <button className="btn btn-primary w-full" disabled={carregando || senha.length < 8 || !email || (precisaProva && !prova)}>
        {carregando ? "Criando…" : "Criar administrador e entrar"}
      </button>
    </form>
  );
}

/** Troca obrigatória (senha temporária). */
export function ForcedPasswordForm() {
  const router = useRouter();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (nova !== confirma) {
          setErro("As senhas não conferem.");
          return;
        }
        setErro(null);
        setCarregando(true);
        try {
          await api("/api/v1/me/password", { method: "PATCH", body: { currentPassword: atual, newPassword: nova } });
          router.push("/admin");
          router.refresh();
        } catch (err) {
          setErro((err as Error).message);
        } finally {
          setCarregando(false);
        }
      }}
    >
      <Field label="Senha temporária (a que você recebeu)">
        <input className="input" type="password" autoFocus autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} />
      </Field>
      <Field label="Nova senha" hint="Mínimo de 8 caracteres.">
        <input className="input" type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />
      </Field>
      <Field label="Confirmar nova senha">
        <input className="input" type="password" autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} />
      </Field>
      {erro ? <Msg tipo="erro">{erro}</Msg> : null}
      <button className="btn btn-primary w-full" disabled={carregando || nova.length < 8 || !atual}>
        {carregando ? "Salvando…" : "Definir senha e continuar"}
      </button>
    </form>
  );
}

/** Troca de senha em "Minha conta". */
export function PasswordForm() {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        try {
          await api("/api/v1/me/password", { method: "PATCH", body: { currentPassword: atual, newPassword: nova } });
          setMsg({ tipo: "ok", texto: "Senha alterada. Outras sessões suas foram encerradas." });
          setAtual("");
          setNova("");
        } catch (err) {
          setMsg({ tipo: "erro", texto: (err as Error).message });
        }
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Senha atual">
          <input className="input" type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} />
        </Field>
        <Field label="Nova senha" hint="Mínimo 8 caracteres.">
          <input className="input" type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />
        </Field>
      </div>
      {msg ? <Msg tipo={msg.tipo}>{msg.texto}</Msg> : null}
      <button className="btn btn-primary" disabled={!atual || nova.length < 8}>
        Trocar senha
      </button>
    </form>
  );
}
