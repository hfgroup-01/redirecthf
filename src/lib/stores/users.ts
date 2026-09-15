/**
 * Usuários do painel: admin (vê tudo) e client (preso ao próprio cliente).
 * `session_version` cresce a cada troca/reset de senha: sessões antigas caem.
 */
import { agora, escalar, rodar, todos, um } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { hashPassword, newId } from "@/lib/crypto";
import type { Role, UserView } from "@/lib/types";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  password_hash: string;
  role: Role;
  client_id: string | null;
  active: number | boolean;
  must_change_password: number | boolean;
  session_version: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  client_name?: string | null;
}

/** Visão interna (com hash e versão de sessão). Nunca sai numa resposta. */
export interface UserAuth extends UserView {
  passwordHash: string;
  sessionVersion: number;
}

function rowToAuth(r: UserRow): UserAuth {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role === "admin" ? "admin" : "client",
    clientId: r.client_id,
    clientName: r.client_name ?? null,
    active: Boolean(r.active),
    mustChangePassword: Boolean(r.must_change_password),
    lastLoginAt: r.last_login_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    passwordHash: r.password_hash,
    sessionVersion: Number(r.session_version ?? 1),
  };
}

export function toView(u: UserAuth): UserView {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    clientId: u.clientId,
    clientName: u.clientName ?? null,
    active: u.active,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

const SELECT = `SELECT u.*, c.name AS client_name FROM users u LEFT JOIN clients c ON c.id = u.client_id`;

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizarEmail(email: string): string {
  const e = (email ?? "").trim().toLowerCase();
  if (!REGEX_EMAIL.test(e)) throw badRequest(`E-mail inválido: "${email}".`);
  return e;
}

export function validarSenha(senha: string): void {
  if (typeof senha !== "string" || senha.length < 8) throw badRequest("A senha precisa ter pelo menos 8 caracteres.");
  if (senha.length > 200) throw badRequest("Senha longa demais.");
}

export async function listUsers(f: { clientId?: string; role?: Role } = {}): Promise<UserView[]> {
  const where: string[] = [];
  const vals: string[] = [];
  if (f.clientId) {
    where.push("u.client_id = ?");
    vals.push(f.clientId);
  }
  if (f.role) {
    where.push("u.role = ?");
    vals.push(f.role);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return (await todos<UserRow>(`${SELECT} ${w} ORDER BY u.role ASC, lower(u.email) ASC`, ...vals)).map((r) => toView(rowToAuth(r)));
}

export async function getUserAuth(id: string): Promise<UserAuth | null> {
  const r = await um<UserRow>(`${SELECT} WHERE u.id = ?`, id);
  return r ? rowToAuth(r) : null;
}

export async function getUser(id: string): Promise<UserView | null> {
  const u = await getUserAuth(id);
  return u ? toView(u) : null;
}

export async function getUserAuthByEmail(email: string): Promise<UserAuth | null> {
  const r = await um<UserRow>(`${SELECT} WHERE u.email = ?`, (email ?? "").trim().toLowerCase());
  return r ? rowToAuth(r) : null;
}

export interface CreateUserInput {
  email: string;
  name?: string | null;
  role: Role;
  clientId?: string | null;
  password: string;
  mustChangePassword?: boolean;
}

export async function createUser(input: CreateUserInput): Promise<UserView> {
  const email = normalizarEmail(input.email);
  validarSenha(input.password);
  const role: Role = input.role === "admin" ? "admin" : "client";
  const clientId = role === "client" ? input.clientId || null : null;
  if (role === "client") {
    if (!clientId) throw badRequest("Usuário de cliente precisa estar vinculado a um cliente.");
    const c = await um<{ id: string }>("SELECT id FROM clients WHERE id = ?", clientId);
    if (!c) throw badRequest("Cliente não encontrado.");
  }
  const id = newId("usr");
  const ts = agora();
  await rodar(
    `INSERT INTO users (id, email, name, password_hash, role, client_id, active, must_change_password, session_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    id,
    email,
    input.name?.trim() || null,
    hashPassword(input.password),
    role,
    clientId,
    true,
    input.mustChangePassword === true,
    ts,
    ts
  );
  invalidarUserCache(id);
  return (await getUser(id))!;
}

export interface UserPatch {
  email?: string;
  name?: string | null;
  active?: boolean;
  clientId?: string | null;
  role?: Role;
}

export async function updateUser(id: string, patch: UserPatch): Promise<UserView> {
  const atual = await getUserAuth(id);
  if (!atual) throw notFound("Usuário não encontrado.");
  const roleFinal: Role = patch.role ?? atual.role;
  const activeFinal = patch.active ?? atual.active;
  if (atual.role === "admin" && atual.active && (roleFinal !== "admin" || !activeFinal)) {
    if ((await countActiveAdmins()) <= 1) throw badRequest("Este é o único administrador ativo; crie outro antes.");
  }
  const sets: string[] = [];
  const vals: (string | number | boolean | null)[] = [];
  const add = (col: string, v: string | number | boolean | null) => {
    sets.push(`${col} = ?`);
    vals.push(v);
  };
  if (patch.email !== undefined) add("email", normalizarEmail(patch.email));
  if (patch.name !== undefined) add("name", patch.name?.trim() || null);
  if (patch.active !== undefined) add("active", patch.active);
  if (patch.role !== undefined) add("role", roleFinal);
  const clientFinal = roleFinal === "admin" ? null : patch.clientId !== undefined ? patch.clientId || null : atual.clientId;
  if (roleFinal === "client" && !clientFinal) throw badRequest("Usuário de cliente precisa estar vinculado a um cliente.");
  if (patch.clientId !== undefined || patch.role !== undefined) add("client_id", clientFinal);
  // Desativar ou mudar de papel/cliente derruba as sessões abertas.
  if ((patch.active !== undefined && !patch.active) || roleFinal !== atual.role || clientFinal !== atual.clientId) {
    sets.push("session_version = session_version + 1");
  }
  add("updated_at", agora());
  vals.push(id);
  await rodar(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, ...vals);
  invalidarUserCache(id);
  return (await getUser(id))!;
}

/** Troca a senha; por padrão sobe a session_version (derruba outras sessões). Devolve a versão nova. */
export async function setUserPassword(
  id: string,
  senha: string,
  opts: { mustChange?: boolean; bumpSession?: boolean } = {}
): Promise<number> {
  validarSenha(senha);
  const u = await getUserAuth(id);
  if (!u) throw notFound("Usuário não encontrado.");
  const bump = opts.bumpSession !== false;
  await rodar(
    `UPDATE users SET password_hash = ?, must_change_password = ?, session_version = session_version + ?, updated_at = ? WHERE id = ?`,
    hashPassword(senha),
    opts.mustChange === true,
    bump ? 1 : 0,
    agora(),
    id
  );
  invalidarUserCache(id);
  return u.sessionVersion + (bump ? 1 : 0);
}

export async function deleteUser(id: string): Promise<void> {
  const u = await getUserAuth(id);
  if (!u) return;
  if (u.role === "admin" && u.active && (await countActiveAdmins()) <= 1) {
    throw badRequest("Este é o único administrador ativo; crie outro antes de apagar.");
  }
  await rodar("DELETE FROM users WHERE id = ?", id);
  invalidarUserCache(id);
}

export async function touchLogin(id: string): Promise<void> {
  await rodar("UPDATE users SET last_login_at = ? WHERE id = ?", agora(), id);
  invalidarUserCache(id);
}

export async function countUsers(): Promise<number> {
  return escalar("SELECT COUNT(*) FROM users");
}

export async function countActiveAdmins(): Promise<number> {
  return escalar("SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = ?", true);
}

// ----------------------------------------------------------------- cache (30s)
const g = globalThis as unknown as { __hfUserCache?: Map<string, { u: UserAuth | null; exp: number }> };
const TTL = 30_000;

export async function getUserCached(id: string): Promise<UserAuth | null> {
  const c = (g.__hfUserCache ??= new Map());
  const hit = c.get(id);
  const now = Date.now();
  if (hit && hit.exp > now) return hit.u;
  const u = await getUserAuth(id);
  if (c.size > 2000) c.clear();
  c.set(id, { u, exp: now + TTL });
  return u;
}

export function invalidarUserCache(id?: string): void {
  if (!g.__hfUserCache) return;
  if (id === undefined) g.__hfUserCache = undefined;
  else g.__hfUserCache.delete(id);
}
