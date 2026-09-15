import { agora, likeOp, rodar, todos, um, type Valor } from "@/lib/db";
import type { Actor } from "@/lib/auth";
import { newId } from "@/lib/crypto";
import { slugify } from "@/lib/codes";
import { badRequest, notFound } from "@/lib/errors";
import { invalidarHostInfo } from "@/lib/hosts";
import { invalidateLinkCache } from "@/lib/resolve";
import { assignDomainToClient } from "@/lib/stores/domains";
import type { Client } from "@/lib/types";

interface ClientRow {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  notes: string | null;
  default_domain_id: string | null;
  default_url: string | null;
  active: number | boolean;
  created_at: string;
  updated_at: string;
  links_count: number;
  clicks_count: number;
  domains_count: number;
  users_count: number;
  default_domain_hostname: string | null;
}

function rowToClient(r: ClientRow): Client {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    phone: r.phone,
    notes: r.notes,
    defaultDomainId: r.default_domain_id,
    defaultUrl: r.default_url,
    active: Boolean(r.active),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    linksCount: Number(r.links_count ?? 0),
    clicksCount: Number(r.clicks_count ?? 0),
    domainsCount: Number(r.domains_count ?? 0),
    usersCount: Number(r.users_count ?? 0),
    defaultDomainHostname: r.default_domain_hostname,
  };
}

const SELECT = `
  SELECT c.*,
    (SELECT COUNT(*) FROM links l WHERE l.client_id = c.id) AS links_count,
    (SELECT COALESCE(SUM(l.clicks_count), 0) FROM links l WHERE l.client_id = c.id) AS clicks_count,
    (SELECT COUNT(*) FROM domains d WHERE d.client_id = c.id) AS domains_count,
    (SELECT COUNT(*) FROM users u WHERE u.client_id = c.id) AS users_count,
    (SELECT d.hostname FROM domains d WHERE d.id = c.default_domain_id) AS default_domain_hostname
  FROM clients c`;

export async function listClients(q?: string, apenasAtivos = false): Promise<Client[]> {
  const where: string[] = [];
  const vals: Valor[] = [];
  if (q?.trim()) {
    const L = likeOp();
    where.push(`(c.name ${L} ? OR c.slug ${L} ? OR c.phone ${L} ?)`);
    const like = `%${q.trim()}%`;
    vals.push(like, like, like);
  }
  if (apenasAtivos) {
    where.push("c.active = ?");
    vals.push(true);
  }
  const sql = `${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY lower(c.name) ASC`;
  return (await todos<ClientRow>(sql, ...vals)).map(rowToClient);
}

export async function getClient(id: string): Promise<Client | null> {
  const r = await um<ClientRow>(`${SELECT} WHERE c.id = ?`, id);
  return r ? rowToClient(r) : null;
}

export async function getClientBySlug(slug: string): Promise<Client | null> {
  const r = await um<ClientRow>(`${SELECT} WHERE c.slug = ?`, slug);
  return r ? rowToClient(r) : null;
}

export interface ClientInput {
  name: string;
  slug?: string;
  phone?: string | null;
  notes?: string | null;
  defaultDomainId?: string | null;
  defaultUrl?: string | null;
  active?: boolean;
}

/** O domínio padrão precisa ser do cliente; se estiver sem dono, é atribuído a ele. */
async function conferirDominioPadrao(domainId: string, clientId: string, actor: Actor): Promise<void> {
  const d = await um<{ id: string; client_id: string | null }>("SELECT id, client_id FROM domains WHERE id = ?", domainId);
  if (!d) throw badRequest("Domínio padrão não encontrado.");
  if (d.client_id && d.client_id !== clientId) throw badRequest("Esse domínio pertence a outro cliente.");
  if (!d.client_id) await assignDomainToClient(domainId, clientId, actor);
}

export async function createClient(input: ClientInput, actor: Actor): Promise<Client> {
  if (!input.name?.trim()) throw badRequest("Informe o nome do cliente.");
  const id = newId("cli");
  const ts = agora();
  let slug = slugify(input.slug || input.name) || `cliente-${Date.now()}`;
  // Evita colisão de slug gerado a partir do nome.
  if (!input.slug && (await getClientBySlug(slug))) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  if (input.defaultDomainId) {
    const d = await um<{ id: string; client_id: string | null }>("SELECT id, client_id FROM domains WHERE id = ?", input.defaultDomainId);
    if (!d) throw badRequest("Domínio padrão não encontrado.");
    if (d.client_id) throw badRequest("Esse domínio já pertence a outro cliente.");
  }
  await rodar(
    `INSERT INTO clients (id, name, slug, phone, notes, default_domain_id, default_url, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.name.trim(),
    slug,
    input.phone?.trim() || null,
    input.notes?.trim() || null,
    input.defaultDomainId || null,
    input.defaultUrl?.trim() || null,
    input.active !== false,
    ts,
    ts
  );
  if (input.defaultDomainId) await assignDomainToClient(input.defaultDomainId, id, actor);
  return (await getClient(id))!;
}

export async function updateClient(id: string, patch: Partial<ClientInput>, actor: Actor): Promise<Client> {
  const antes = await getClient(id);
  if (!antes) throw notFound("Cliente não encontrado.");
  if (patch.defaultDomainId) await conferirDominioPadrao(patch.defaultDomainId, id, actor);
  const sets: string[] = [];
  const vals: Valor[] = [];
  const add = (col: string, v: Valor) => {
    sets.push(`${col} = ?`);
    vals.push(v);
  };
  if (patch.name !== undefined) add("name", patch.name.trim());
  if (patch.slug !== undefined) add("slug", slugify(patch.slug) || slugify(patch.name ?? "") || id);
  if (patch.phone !== undefined) add("phone", patch.phone?.trim() || null);
  if (patch.notes !== undefined) add("notes", patch.notes?.trim() || null);
  if (patch.defaultDomainId !== undefined) add("default_domain_id", patch.defaultDomainId || null);
  if (patch.defaultUrl !== undefined) add("default_url", patch.defaultUrl?.trim() || null);
  if (patch.active !== undefined) add("active", patch.active);
  add("updated_at", agora());
  vals.push(id);
  const r = await rodar(`UPDATE clients SET ${sets.join(", ")} WHERE id = ?`, ...vals);
  if (!r.changes) throw notFound("Cliente não encontrado.");
  // Pausar/reativar o cliente muda a resposta de todos os links dele: derruba o cache já.
  if (patch.active !== undefined && patch.active !== antes.active) invalidateLinkCache();
  return (await getClient(id))!;
}

export async function deleteClient(id: string): Promise<void> {
  await rodar("DELETE FROM clients WHERE id = ?", id);
  invalidateLinkCache();
  invalidarHostInfo();
}
