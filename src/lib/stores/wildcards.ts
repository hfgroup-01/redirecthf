/**
 * Zonas curinga: um registro `*` proxied na zona (ex.: *.lumix10.cfd) apontando
 * para o alvo DNS do HF. Qualquer <label>.<base> cadastrado como domínio nasce
 * sem chamada à Cloudflare: só a verificação /hf/ping.
 */
import { agora, rodar, todos, um } from "@/lib/db";
import { decrypt, encrypt, newId } from "@/lib/crypto";
import { getDefaultCfToken } from "@/lib/settings";
import type { DnsType, DomainStatus, Wildcard } from "@/lib/types";

interface Row {
  id: string;
  base_hostname: string;
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
  created_at: string;
  updated_at: string;
  domains_count?: number;
}

function rowToWildcard(r: Row): Wildcard {
  return {
    id: r.id,
    baseHostname: r.base_hostname,
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
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    domainsCount: r.domains_count === undefined ? undefined : Number(r.domains_count),
  };
}

const SELECT = `SELECT w.*, (SELECT COUNT(*) FROM domains d WHERE d.wildcard_id = w.id) AS domains_count FROM wildcards w`;

export async function listWildcards(): Promise<Wildcard[]> {
  return (await todos<Row>(`${SELECT} ORDER BY w.base_hostname ASC`)).map(rowToWildcard);
}

export async function getWildcard(id: string): Promise<Wildcard | null> {
  const r = await um<Row>(`${SELECT} WHERE w.id = ?`, id);
  return r ? rowToWildcard(r) : null;
}

export async function getWildcardByBase(base: string): Promise<Wildcard | null> {
  const r = await um<Row>(`${SELECT} WHERE w.base_hostname = ?`, base.toLowerCase());
  return r ? rowToWildcard(r) : null;
}

/** Zona curinga pronta (dns_ok/active) que cobre `label.base`. Só um nível abaixo da base. */
export async function wildcardForHostname(hostname: string): Promise<Wildcard | null> {
  const labels = hostname.toLowerCase().split(".").filter(Boolean);
  if (labels.length < 3) return null;
  const base = labels.slice(1).join(".");
  const r = await um<Row>(`${SELECT} WHERE w.base_hostname = ? AND w.status IN ('dns_ok', 'active')`, base);
  return r ? rowToWildcard(r) : null;
}

export async function createWildcard(input: { baseHostname: string; apiToken?: string | null }): Promise<Wildcard> {
  const id = newId("wc");
  const ts = agora();
  await rodar(
    `INSERT INTO wildcards (id, base_hostname, api_token_enc, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)`,
    id,
    input.baseHostname.toLowerCase(),
    input.apiToken?.trim() ? encrypt(input.apiToken.trim()) : null,
    ts,
    ts
  );
  return (await getWildcard(id))!;
}

export interface WildcardPatch {
  apiToken?: string | null;
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

export async function updateWildcard(id: string, patch: WildcardPatch): Promise<Wildcard> {
  const sets: string[] = [];
  const vals: (string | number | boolean | null)[] = [];
  const add = (col: string, v: string | number | boolean | null) => {
    sets.push(`${col} = ?`);
    vals.push(v);
  };
  if (patch.apiToken !== undefined) add("api_token_enc", patch.apiToken?.trim() ? encrypt(patch.apiToken.trim()) : null);
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
  const r = await rodar(`UPDATE wildcards SET ${sets.join(", ")} WHERE id = ?`, ...vals);
  if (!r.changes) throw new Error(`Zona curinga "${id}" não encontrada.`);
  return (await getWildcard(id))!;
}

export async function deleteWildcard(id: string): Promise<void> {
  await rodar("DELETE FROM wildcards WHERE id = ?", id);
}

/** Token da zona (se tiver) ou o token padrão das configurações. */
export async function getWildcardToken(id: string): Promise<string> {
  const r = await um<{ api_token_enc: string | null }>("SELECT api_token_enc FROM wildcards WHERE id = ?", id);
  const proprio = r?.api_token_enc ? decrypt(r.api_token_enc) : "";
  return proprio || (await getDefaultCfToken());
}
