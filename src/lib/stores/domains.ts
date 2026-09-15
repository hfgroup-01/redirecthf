import { agora, rodar, todos, transacao, um, type Valor } from "@/lib/db";
import type { Actor } from "@/lib/auth";
import { decrypt, encrypt, newId } from "@/lib/crypto";
import { badRequest, notFound } from "@/lib/errors";
import { invalidarHostInfo, isPanelHost } from "@/lib/hosts";
import { invalidateLinkCache } from "@/lib/resolve";
import { ADMIN_SCOPE, escopado, type Scope } from "@/lib/scope";
import { getDefaultCfToken } from "@/lib/settings";
import { registrarEvento } from "@/lib/stores/links";
import type { DnsType, Domain, DomainStatus, PageConfig } from "@/lib/types";

interface DomainRow {
  id: string;
  hostname: string;
  zone_id: string | null;
  zone_name: string | null;
  account_id: string | null;
  api_token_enc: string | null;
  dns_record_id: string | null;
  dns_type: string | null;
  dns_target: string | null;
  status: DomainStatus;
  last_error: string | null;
  last_check_at: string | null;
  page_config: string | PageConfig | null;
  active: number | boolean;
  redirects_enabled: number | boolean;
  fb_code: string | null;
  cnpj: string | null;
  client_id: string | null;
  wildcard_id: string | null;
  created_at: string;
  updated_at: string;
  client_name?: string | null;
  wildcard_base?: string | null;
  links_count?: number;
}

/** SQLite guarda TEXT; Postgres (jsonb) já devolve objeto. */
function parsePage(v: string | PageConfig | null): PageConfig {
  if (!v) return {};
  if (typeof v === "object") return v;
  try {
    const p = JSON.parse(v);
    return p && typeof p === "object" ? (p as PageConfig) : {};
  } catch {
    return {};
  }
}

function rowToDomain(r: DomainRow): Domain {
  return {
    id: r.id,
    hostname: r.hostname,
    zoneId: r.zone_id,
    zoneName: r.zone_name,
    accountId: r.account_id,
    hasToken: Boolean(r.api_token_enc),
    dnsRecordId: r.dns_record_id,
    dnsType: (r.dns_type as DnsType | null) ?? null,
    dnsTarget: r.dns_target,
    status: r.status,
    lastError: r.last_error,
    lastCheckAt: r.last_check_at,
    pageConfig: parsePage(r.page_config),
    active: Boolean(r.active),
    redirectsEnabled: r.redirects_enabled === undefined || r.redirects_enabled === null ? true : Boolean(r.redirects_enabled),
    fbCode: r.fb_code ?? null,
    cnpj: r.cnpj ?? null,
    clientId: r.client_id ?? null,
    clientName: r.client_name ?? null,
    wildcardId: r.wildcard_id ?? null,
    wildcardBase: r.wildcard_base ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    linksCount: r.links_count === undefined ? undefined : Number(r.links_count),
  };
}

const SELECT = `
  SELECT d.*, c.name AS client_name, w.base_hostname AS wildcard_base,
    (SELECT COUNT(*) FROM links l WHERE l.domain_id = d.id) AS links_count
  FROM domains d
  LEFT JOIN clients c ON c.id = d.client_id
  LEFT JOIN wildcards w ON w.id = d.wildcard_id`;

export interface ListDomainsFilter {
  clientId?: string;
  /** Só domínios sem dono (para atribuir). */
  unassigned?: boolean;
}

export async function listDomains(scope: Scope, f: ListDomainsFilter = {}): Promise<Domain[]> {
  const where: string[] = [];
  const vals: Valor[] = [];
  if (escopado(scope)) {
    where.push("d.client_id = ?");
    vals.push(scope.clientId);
  } else if (f.clientId) {
    where.push("d.client_id = ?");
    vals.push(f.clientId);
  } else if (f.unassigned) {
    where.push("d.client_id IS NULL");
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return (await todos<DomainRow>(`${SELECT} ${w} ORDER BY d.hostname ASC`, ...vals)).map(rowToDomain);
}

/** Domínios no ar (para montar URLs e selects). */
export async function listActiveDomains(scope: Scope): Promise<Domain[]> {
  const extra = escopado(scope) ? "AND d.client_id = ?" : "";
  const vals: Valor[] = [true];
  if (escopado(scope)) vals.push(scope.clientId);
  return (await todos<DomainRow>(`${SELECT} WHERE d.active = ? AND d.status = 'active' ${extra} ORDER BY d.hostname ASC`, ...vals)).map(rowToDomain);
}

export async function getDomain(id: string, scope: Scope): Promise<Domain | null> {
  const r = escopado(scope)
    ? await um<DomainRow>(`${SELECT} WHERE d.id = ? AND d.client_id = ?`, id, scope.clientId)
    : await um<DomainRow>(`${SELECT} WHERE d.id = ?`, id);
  return r ? rowToDomain(r) : null;
}

/** Hot path: só domínios ativos (inativo = o HF ignora o host). */
export async function getDomainByHostname(hostname: string): Promise<Domain | null> {
  const r = await um<DomainRow>(`${SELECT} WHERE d.hostname = ? AND d.active = ?`, hostname.toLowerCase(), true);
  return r ? rowToDomain(r) : null;
}

export async function getDomainByHostnameAny(hostname: string): Promise<Domain | null> {
  const r = await um<DomainRow>(`${SELECT} WHERE d.hostname = ?`, hostname.toLowerCase());
  return r ? rowToDomain(r) : null;
}

async function conferirHostnameLivre(hostname: string): Promise<void> {
  if (await isPanelHost(hostname)) throw badRequest("Esse host é o do painel do HF; não pode ser um domínio de redirect.");
}

export interface CreateDomainInput {
  hostname: string;
  apiToken?: string;
  pageConfig?: PageConfig;
  fbCode?: string | null;
  cnpj?: string | null;
  clientId?: string | null;
  wildcardId?: string | null;
}

export async function createDomain(input: CreateDomainInput): Promise<Domain> {
  const hostname = input.hostname.toLowerCase();
  await conferirHostnameLivre(hostname);
  if (input.clientId) {
    const c = await um<{ id: string }>("SELECT id FROM clients WHERE id = ?", input.clientId);
    if (!c) throw badRequest("Cliente não encontrado.");
  }
  const id = newId("dom");
  const ts = agora();
  await rodar(
    `INSERT INTO domains (id, hostname, api_token_enc, page_config, fb_code, cnpj, client_id, wildcard_id, status, active, redirects_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    id,
    hostname,
    input.apiToken?.trim() ? encrypt(input.apiToken.trim()) : null,
    JSON.stringify(input.pageConfig ?? {}),
    input.fbCode?.trim() || null,
    input.cnpj?.replace(/\D/g, "") || null,
    input.clientId || null,
    input.wildcardId || null,
    true,
    true,
    ts,
    ts
  );
  invalidarHostInfo(hostname);
  return (await getDomain(id, ADMIN_SCOPE))!;
}

export interface DomainPatch {
  hostname?: string;
  apiToken?: string | null; // null = remover; undefined = manter
  pageConfig?: PageConfig;
  active?: boolean;
  redirectsEnabled?: boolean;
  fbCode?: string | null;
  cnpj?: string | null;
  wildcardId?: string | null;
  zoneId?: string | null;
  zoneName?: string | null;
  accountId?: string | null;
  dnsRecordId?: string | null;
  dnsType?: DnsType | null;
  dnsTarget?: string | null;
  status?: DomainStatus;
  lastError?: string | null;
  lastCheckAt?: string | null;
}

/** Atualiza campos do domínio (o dono muda só por `assignDomainToClient`). */
export async function updateDomain(id: string, patch: DomainPatch): Promise<Domain> {
  const antes = await um<{ hostname: string }>("SELECT hostname FROM domains WHERE id = ?", id);
  if (!antes) throw notFound("Domínio não encontrado.");
  const sets: string[] = [];
  const vals: Valor[] = [];
  const add = (col: string, v: Valor) => {
    sets.push(`${col} = ?`);
    vals.push(v);
  };
  if (patch.hostname !== undefined) {
    const h = patch.hostname.toLowerCase();
    if (h !== antes.hostname) await conferirHostnameLivre(h);
    add("hostname", h);
  }
  if (patch.apiToken !== undefined) add("api_token_enc", patch.apiToken?.trim() ? encrypt(patch.apiToken.trim()) : null);
  if (patch.pageConfig !== undefined) add("page_config", JSON.stringify(patch.pageConfig));
  if (patch.active !== undefined) add("active", patch.active);
  if (patch.redirectsEnabled !== undefined) add("redirects_enabled", patch.redirectsEnabled);
  if (patch.fbCode !== undefined) add("fb_code", patch.fbCode?.trim() || null);
  if (patch.cnpj !== undefined) add("cnpj", patch.cnpj?.replace(/\D/g, "") || null);
  if (patch.wildcardId !== undefined) add("wildcard_id", patch.wildcardId);
  if (patch.zoneId !== undefined) add("zone_id", patch.zoneId);
  if (patch.zoneName !== undefined) add("zone_name", patch.zoneName);
  if (patch.accountId !== undefined) add("account_id", patch.accountId);
  if (patch.dnsRecordId !== undefined) add("dns_record_id", patch.dnsRecordId);
  if (patch.dnsType !== undefined) add("dns_type", patch.dnsType);
  if (patch.dnsTarget !== undefined) add("dns_target", patch.dnsTarget);
  if (patch.status !== undefined) add("status", patch.status);
  if (patch.lastError !== undefined) add("last_error", patch.lastError);
  if (patch.lastCheckAt !== undefined) add("last_check_at", patch.lastCheckAt);
  add("updated_at", agora());
  vals.push(id);
  const r = await rodar(`UPDATE domains SET ${sets.join(", ")} WHERE id = ?`, ...vals);
  if (!r.changes) throw notFound("Domínio não encontrado.");
  invalidarHostInfo(antes.hostname);
  if (patch.hostname !== undefined) invalidarHostInfo(patch.hostname);
  return (await getDomain(id, ADMIN_SCOPE))!;
}

export async function deleteDomain(id: string): Promise<void> {
  const d = await um<{ hostname: string }>("SELECT hostname FROM domains WHERE id = ?", id);
  await rodar("DELETE FROM domains WHERE id = ?", id);
  if (d) invalidarHostInfo(d.hostname);
  invalidateLinkCache();
}

export async function countLinksOfDomain(id: string): Promise<number> {
  const r = await um<{ n: number }>("SELECT COUNT(*) AS n FROM links WHERE domain_id = ?", id);
  return Number(r?.n ?? 0);
}

/**
 * Troca o dono do domínio (só admin). Os links do domínio vão junto (invariante:
 * link.client_id == domínio.client_id), e o dono antigo perde o domínio padrão.
 */
export async function assignDomainToClient(id: string, clientId: string | null, actor: Actor): Promise<Domain> {
  const dom = await getDomain(id, ADMIN_SCOPE);
  if (!dom) throw notFound("Domínio não encontrado.");
  if (clientId) {
    const c = await um<{ id: string }>("SELECT id FROM clients WHERE id = ?", clientId);
    if (!c) throw badRequest("Cliente não encontrado.");
  }
  if ((dom.clientId ?? null) === (clientId ?? null)) return dom;
  const ts = agora();
  await transacao(async (tx) => {
    await tx.rodar("UPDATE domains SET client_id = ?, updated_at = ? WHERE id = ?", clientId, ts, id);
    const links = await tx.todos<{ id: string; client_id: string | null }>("SELECT id, client_id FROM links WHERE domain_id = ?", id);
    for (const l of links) {
      if ((l.client_id ?? null) === (clientId ?? null)) continue;
      await tx.rodar("UPDATE links SET client_id = ?, updated_at = ? WHERE id = ?", clientId, ts, l.id);
      await registrarEvento(tx, l.id, actor, "moved", { clientId: { de: l.client_id, para: clientId } });
    }
    if (dom.clientId) {
      await tx.rodar(
        "UPDATE clients SET default_domain_id = NULL, updated_at = ? WHERE id = ? AND default_domain_id = ?",
        ts,
        dom.clientId,
        id
      );
    }
  });
  invalidarHostInfo(dom.hostname);
  invalidateLinkCache();
  return (await getDomain(id, ADMIN_SCOPE))!;
}

/** Token do domínio (se tiver) ou o token padrão das configurações. */
export async function getDomainToken(id: string): Promise<string> {
  const r = await um<{ api_token_enc: string | null }>("SELECT api_token_enc FROM domains WHERE id = ?", id);
  const proprio = r?.api_token_enc ? decrypt(r.api_token_enc) : "";
  return proprio || (await getDefaultCfToken());
}
