/**
 * Hosts: (1) quem é o host do painel e (2) o cache host -> domínio usado no
 * hot path. Não importa stores: stores/domains importa daqui para invalidar.
 *
 * Regra: painel e API só existem em localhost ou no host do painel
 * (HF_ADMIN_HOST no env tem prioridade; senão o setting `panel_host`).
 * Qualquer outro host é domínio de redirect (se cadastrado) ou 404 neutro.
 */
import { um } from "@/lib/db";
import type { PageConfig, PanelHostSource } from "@/lib/types";

export function normalizarHost(raw: string | null | undefined): string {
  return (raw ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

const LOCAIS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export interface HostInfo {
  /** null = host desconhecido ou domínio inativo (nunca redireciona). */
  domainId: string | null;
  hostname: string;
  clientId: string | null;
  cfg: PageConfig;
  fbCode: string | null;
  /** false = chave OFF no domínio: todo código cai na página white. */
  redirectsEnabled: boolean;
}

const g = globalThis as unknown as {
  __hfPanelHost?: { host: string; source: PanelHostSource; exp: number };
  __hfHostInfo?: Map<string, { info: HostInfo; exp: number }>;
};

const TTL_PANEL = 30_000;
const MAX_HOSTS = 5000;

export async function getPanelHost(): Promise<{ host: string; source: PanelHostSource }> {
  const env = process.env.HF_ADMIN_HOST?.trim();
  if (env) return { host: normalizarHost(env), source: "env" };
  const now = Date.now();
  if (g.__hfPanelHost && g.__hfPanelHost.exp > now) return g.__hfPanelHost;
  let host = "";
  try {
    const row = await um<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", "panel_host");
    if (row?.value) {
      const v = JSON.parse(row.value) as unknown;
      if (typeof v === "string") host = normalizarHost(v);
    }
  } catch {
    host = "";
  }
  g.__hfPanelHost = { host, source: host ? "setting" : "none", exp: now + TTL_PANEL };
  return g.__hfPanelHost;
}

export function invalidarPanelHost(): void {
  g.__hfPanelHost = undefined;
}

export function isLocalHost(raw: string | null | undefined): boolean {
  return LOCAIS.has(normalizarHost(raw));
}

export async function isPanelHost(raw: string | null | undefined): Promise<boolean> {
  const h = normalizarHost(raw);
  if (!h) return false;
  if (LOCAIS.has(h)) return true;
  const p = await getPanelHost();
  return Boolean(p.host) && h === p.host;
}

// ----------------------------------------------------------- cache host -> domínio
const cache = (): Map<string, { info: HostInfo; exp: number }> => (g.__hfHostInfo ??= new Map());

export function hostInfoGet(host: string): HostInfo | undefined {
  const hit = cache().get(host);
  return hit && hit.exp > Date.now() ? hit.info : undefined;
}

export function hostInfoSet(host: string, info: HostInfo, ttlMs: number): void {
  const c = cache();
  if (c.size >= MAX_HOSTS) evictOldest(c, MAX_HOSTS / 2);
  c.set(host, { info, exp: Date.now() + ttlMs });
}

/** Sem argumento limpa tudo (só para mudança dos padrões globais da página). */
export function invalidarHostInfo(host?: string): void {
  if (host === undefined) {
    g.__hfHostInfo = undefined;
    return;
  }
  cache().delete(normalizarHost(host));
}

/** Map preserva ordem de inserção: apaga as N entradas mais antigas (nunca `clear()`). */
export function evictOldest<K, V>(m: Map<K, V>, n: number): void {
  let i = 0;
  for (const k of m.keys()) {
    if (i++ >= n) break;
    m.delete(k);
  }
}
