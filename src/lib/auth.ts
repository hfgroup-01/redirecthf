/**
 * Autenticação e identidade.
 *
 *  - Sessão: cookie assinado (HMAC) com { uid, sv, exp, imp? }. `sv` é a
 *    session_version do usuário: trocar/resetar senha invalida as sessões.
 *  - Chave de API (x-api-key ou Authorization: Bearer) = administrador.
 *  - Impersonação: admin "entra como cliente" (imp = clientId); as ações ficam
 *    atribuídas ao admin, mas o escopo vira o do cliente.
 *
 * Painel e API só existem no host do painel (localhost ou HF_ADMIN_HOST /
 * setting): em qualquer outro host respondem 404.
 */
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { hmac, safeEqual } from "@/lib/crypto";
import { isPanelHost } from "@/lib/hosts";
import type { Scope } from "@/lib/scope";
import { getApiKey } from "@/lib/settings";
import { countUsers, createUser, getUserCached, toView } from "@/lib/stores/users";
import type { Role, UserView } from "@/lib/types";

export const SESSION_COOKIE = "hf_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface Actor {
  kind: "user" | "api";
  /** Papel EFETIVO: admin impersonando um cliente age como "client". */
  role: Role;
  userId: string | null;
  email: string | null;
  /** null = enxerga tudo (admin). */
  clientId: string | null;
  impersonating: { clientId: string } | null;
  /** Vai em link_events.actor: "api" | "user:<email>" | "user:<email> (como cliente)". */
  label: string;
}

export const API_ACTOR: Actor = {
  kind: "api",
  role: "admin",
  userId: null,
  email: null,
  clientId: null,
  impersonating: null,
  label: "api",
};

export interface SessionPayload {
  v: 2;
  uid: string;
  sv: number;
  exp: number;
  imp?: string;
}

export function createSessionValue(p: { uid: string; sv: number; imp?: string | null }): string {
  const data: SessionPayload = { v: 2, uid: p.uid, sv: p.sv, exp: Date.now() + SESSION_TTL_MS };
  if (p.imp) data.imp = p.imp;
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

export function readSession(value: string | undefined | null): SessionPayload | null {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  if (!safeEqual(hmac(payload), sig)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as Partial<SessionPayload>;
    if (data.v !== 2 || typeof data.uid !== "string" || typeof data.sv !== "number") return null;
    if (typeof data.exp !== "number" || data.exp <= Date.now()) return null;
    const out: SessionPayload = { v: 2, uid: data.uid, sv: data.sv, exp: data.exp };
    if (typeof data.imp === "string" && data.imp) out.imp = data.imp;
    return out;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

/** HTTPS direto ou atrás de proxy/túnel (x-forwarded-proto). */
export function requestIsSecure(req: NextRequest): boolean {
  return req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}

/** Sessão -> ator efetivo. Exige usuário ativo e session_version igual à do cookie. */
export async function resolveSessionActor(p: SessionPayload): Promise<Actor | null> {
  const u = await getUserCached(p.uid);
  if (!u || !u.active || u.sessionVersion !== p.sv) return null;
  if (u.role === "client") {
    if (!u.clientId) return null;
    return { kind: "user", role: "client", userId: u.id, email: u.email, clientId: u.clientId, impersonating: null, label: `user:${u.email}` };
  }
  if (p.imp) {
    return {
      kind: "user",
      role: "client",
      userId: u.id,
      email: u.email,
      clientId: p.imp,
      impersonating: { clientId: p.imp },
      label: `user:${u.email} (como cliente)`,
    };
  }
  return { kind: "user", role: "admin", userId: u.id, email: u.email, clientId: null, impersonating: null, label: `user:${u.email}` };
}

/** Em rotas de API: aceita sessão de usuário OU chave de API (= admin). */
export async function authenticateRequest(req: NextRequest): Promise<Actor | null> {
  const sessao = readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (sessao) {
    const actor = await resolveSessionActor(sessao);
    if (actor) return actor;
  }
  const apiKey = req.headers.get("x-api-key") || bearer(req.headers.get("authorization"));
  if (apiKey && safeEqual(apiKey, await getApiKey())) return API_ACTOR;
  return null;
}

function bearer(h: string | null): string {
  if (!h) return "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1] : "";
}

export interface SessionUser {
  user: UserView;
  actor: Actor;
  session: SessionPayload;
}

/** Em server components: usuário logado (ou null). Memoizado por request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const session = readSession(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const actor = await resolveSessionActor(session);
  if (!actor || !actor.userId) return null;
  const u = await getUserCached(actor.userId);
  if (!u) return null;
  return { user: toView(u), actor, session };
});

export async function requirePanelHost(): Promise<void> {
  const h = await headers();
  if (!(await isPanelHost(h.get("host")))) notFound();
}

/** Páginas do painel: host certo, setup feito e sessão válida (senão redireciona). */
export async function requirePanelUser(): Promise<SessionUser> {
  await requirePanelHost();
  if (!(await isSetupDone())) redirect("/admin/setup");
  const s = await getSessionUser();
  if (!s) redirect("/admin/login");
  return s;
}

/** Páginas só do admin (um admin impersonando também não entra: use "sair da conta do cliente"). */
export async function requirePanelAdmin(): Promise<SessionUser> {
  const s = await requirePanelUser();
  if (s.actor.role !== "admin") notFound();
  return s;
}

export function escopo(actor: Actor): Scope {
  return { clientId: actor.clientId };
}

const g = globalThis as unknown as { __hfSetupDone?: boolean; __hfLoginAttempts?: Map<string, { n: number; reset: number }> };

/**
 * Setup concluído = existe pelo menos um usuário. Com HF_ADMIN_EMAIL +
 * HF_ADMIN_PASSWORD no ambiente, o primeiro admin nasce sozinho (Docker).
 */
export async function isSetupDone(): Promise<boolean> {
  if (g.__hfSetupDone) return true;
  if ((await countUsers()) > 0) {
    g.__hfSetupDone = true;
    return true;
  }
  const email = process.env.HF_ADMIN_EMAIL?.trim().toLowerCase();
  const senha = process.env.HF_ADMIN_PASSWORD?.trim();
  if (email && senha) {
    try {
      await createUser({ email, name: "Administrador", role: "admin", clientId: null, password: senha, mustChangePassword: false });
      console.log(`[hf] primeiro administrador criado a partir do ambiente: ${email}`);
      g.__hfSetupDone = true;
      return true;
    } catch (err) {
      console.error("[hf] não consegui criar o admin do ambiente:", err instanceof Error ? err.message : err);
    }
  }
  return false;
}

export function marcarSetupFeito(): void {
  g.__hfSetupDone = true;
}

// ---------------------------------------------------------------------------
// Rate limit simples do login (em memória): 8 tentativas por minuto por chave
// (uma chave por IP e outra por e-mail).
// ---------------------------------------------------------------------------
export function loginRateLimited(chave: string): boolean {
  const map = (g.__hfLoginAttempts ??= new Map());
  const now = Date.now();
  if (map.size > 10_000) map.clear();
  const e = map.get(chave);
  if (!e || e.reset < now) {
    map.set(chave, { n: 1, reset: now + 60_000 });
    return false;
  }
  e.n += 1;
  return e.n > 8;
}
