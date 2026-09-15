import type { NextRequest } from "next/server";
import { escopo } from "@/lib/auth";
import { deleteDnsRecord } from "@/lib/cloudflare";
import { bool, conflict, json, jsonError, notFound, protegido, readJson, somenteAdmin, str, validarHostname } from "@/lib/http";
import { ADMIN_SCOPE } from "@/lib/scope";
import { assignDomainToClient, countLinksOfDomain, deleteDomain, getDomain, getDomainToken, updateDomain, type DomainPatch } from "@/lib/stores/domains";
import type { PageConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = protegido<{ id: string }>(async (_req, actor, { id }) => {
  const domain = await getDomain(id, escopo(actor));
  if (!domain) throw notFound("Domínio não encontrado.");
  return json({ domain });
});

interface Body {
  hostname?: string;
  /** "" = manter o atual. */
  apiToken?: string;
  removeToken?: boolean;
  pageConfig?: PageConfig;
  active?: boolean;
  /** Chave ON/OFF: true = códigos redirecionam; false = tudo cai na página white. */
  redirectsEnabled?: boolean;
  fbCode?: string | null;
  cnpj?: string | null;
  /** Só admin: novo dono (null = sem dono). Os links do domínio vão junto. */
  clientId?: string | null;
}

export const PATCH = protegido<{ id: string }>(async (req: NextRequest, actor, { id }) => {
  const scope = escopo(actor);
  const domain = await getDomain(id, scope);
  if (!domain) throw notFound("Domínio não encontrado.");
  const b = await readJson<Body>(req);

  const pedeAdmin = b.hostname !== undefined || str(b.apiToken) || b.removeToken || b.active !== undefined || b.clientId !== undefined;
  if (pedeAdmin && actor.role !== "admin") return jsonError("Só o administrador altera hostname, token, ativo ou dono do domínio.", 403);

  const patch: DomainPatch = {};
  if (b.hostname !== undefined && str(b.hostname) && str(b.hostname) !== domain.hostname) {
    patch.hostname = validarHostname(str(b.hostname));
    // Hostname novo = DNS precisa ser refeito.
    patch.status = "pending";
    patch.dnsRecordId = null;
    patch.zoneId = null;
    patch.zoneName = null;
    patch.wildcardId = null;
  }
  if (b.removeToken) patch.apiToken = null;
  else if (str(b.apiToken)) patch.apiToken = str(b.apiToken);
  if (b.pageConfig && typeof b.pageConfig === "object") patch.pageConfig = b.pageConfig;
  if (b.active !== undefined) patch.active = bool(b.active, domain.active);
  if (b.redirectsEnabled !== undefined) patch.redirectsEnabled = bool(b.redirectsEnabled, domain.redirectsEnabled);
  if (b.fbCode !== undefined) patch.fbCode = b.fbCode === null ? null : str(b.fbCode) || null;
  if (b.cnpj !== undefined) patch.cnpj = b.cnpj === null ? null : str(b.cnpj) || null;

  let atualizado = Object.keys(patch).length ? await updateDomain(id, patch) : domain;
  if (b.clientId !== undefined && actor.role === "admin") {
    atualizado = await assignDomainToClient(id, str(b.clientId) || null, actor);
  }
  return json({ domain: atualizado });
});

/** DELETE ?removeDns=1 apaga o registro DNS na Cloudflare (melhor esforço); ?force=1 apaga mesmo com links. */
export const DELETE = somenteAdmin<{ id: string }>(async (req: NextRequest, _actor, { id }) => {
  const domain = await getDomain(id, ADMIN_SCOPE);
  if (!domain) throw notFound("Domínio não encontrado.");
  const links = await countLinksOfDomain(id);
  if (links > 0 && req.nextUrl.searchParams.get("force") !== "1") {
    throw conflict(`Esse domínio tem ${links} link(s). Mova ou apague os links, ou use force=1 para apagar tudo.`);
  }
  let dnsRemovido = false;
  let aviso: string | null = null;
  if (req.nextUrl.searchParams.get("removeDns") === "1" && !domain.wildcardId && domain.zoneId && domain.dnsRecordId) {
    try {
      await deleteDnsRecord(domain.zoneId, await getDomainToken(id), domain.dnsRecordId);
      dnsRemovido = true;
    } catch (e) {
      aviso = `O domínio foi removido do HF, mas o DNS não pôde ser apagado: ${(e as Error).message}`;
    }
  }
  await deleteDomain(id);
  return json({ ok: true, dnsRemovido, aviso });
});
