/**
 * Hot path do redirect: (domínio, código) -> link, com cache em memória (TTL
 * curto + invalidação explícita quando o link muda). Cache negativo evita bater
 * no banco a cada código inexistente (bots testando URLs). Um código só
 * resolve no domínio dono: o mesmo código pode existir em vários hosts.
 */
import { um } from "@/lib/db";
import { normalizarCodigo } from "@/lib/codes";
import { evictOldest } from "@/lib/hosts";
import type { LinkMode } from "@/lib/types";

export interface ResolvedLink {
  id: string;
  code: string;
  active: boolean;
  mode: LinkMode;
  destinationUrl: string | null;
  appendQuery: boolean;
  pageTitle: string | null;
  pageBody: string | null;
  domainId: string | null;
  clientId: string | null;
  clientActive: boolean;
  /** true = existem destinos por lead (lead_targets) para este link. */
  hasTargets: boolean;
}

interface Entrada {
  link: ResolvedLink | null;
  exp: number;
}

const TTL_OK = 30_000;
const TTL_NEG = 10_000;
const MAX = 20_000;

const g = globalThis as unknown as { __hfLinkCache?: Map<string, Entrada> };
const cache = (): Map<string, Entrada> => (g.__hfLinkCache ??= new Map());
const chave = (domainId: string, code: string) => `${domainId}|${code}`;

export async function resolveLink(domainId: string, codeRaw: string): Promise<ResolvedLink | null> {
  const code = normalizarCodigo(codeRaw);
  const c = cache();
  const now = Date.now();
  const k = chave(domainId, code);
  const hit = c.get(k);
  if (hit && hit.exp > now) return hit.link;

  const r = await um<{
    id: string;
    code: string;
    active: number | boolean;
    mode: LinkMode;
    destination_url: string | null;
    append_query: number | boolean;
    page_title: string | null;
    page_body: string | null;
    domain_id: string | null;
    client_id: string | null;
    client_active: number | boolean | null;
    has_targets: number | boolean;
  }>(
    `SELECT l.id, l.code, l.active, l.mode, l.destination_url, l.append_query, l.page_title, l.page_body,
            l.domain_id, l.client_id, c.active AS client_active,
            EXISTS (SELECT 1 FROM lead_targets t WHERE t.link_id = l.id) AS has_targets
     FROM links l LEFT JOIN clients c ON c.id = l.client_id
     WHERE l.domain_id = ? AND l.code = ?`,
    domainId,
    code
  );

  const link: ResolvedLink | null = r
    ? {
        id: r.id,
        code: r.code,
        active: Boolean(r.active),
        mode: r.mode,
        destinationUrl: r.destination_url,
        appendQuery: Boolean(r.append_query),
        pageTitle: r.page_title,
        pageBody: r.page_body,
        domainId: r.domain_id,
        clientId: r.client_id,
        clientActive: r.client_active === null ? true : Boolean(r.client_active),
        hasTargets: Boolean(r.has_targets),
      }
    : null;

  if (c.size >= MAX) evictOldest(c, MAX / 2);
  c.set(k, { link, exp: now + (link ? TTL_OK : TTL_NEG) });
  return link;
}

/** Sem argumentos limpa tudo (mudança de cliente/domínio que afeta muitos links). */
export function invalidateLinkCache(domainId?: string | null, code?: string): void {
  if (!domainId || !code) {
    cache().clear();
    return;
  }
  cache().delete(chave(domainId, normalizarCodigo(code)));
}
