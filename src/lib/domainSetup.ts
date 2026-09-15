/**
 * Provisionamento de um domínio de redirect:
 *   1. valida o token na Cloudflare
 *   2. descobre a zona (zone_id / account_id) pelo hostname
 *   3. cria/corrige o registro DNS (A -> IP do servidor ou CNAME -> túnel), proxied
 *   4. confere se https://<hostname>/hf/ping já responde NESTA instância
 *
 * Se o host está coberto por uma zona curinga (*.base) pronta, os passos 1-3
 * são pulados: nenhuma chamada à Cloudflare, só a verificação.
 */
import { checkReachability, ensureDnsRecord, findZoneForHostname, verifyToken } from "@/lib/cloudflare";
import { agora } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { ADMIN_SCOPE } from "@/lib/scope";
import { getDnsTarget, getInstanceId } from "@/lib/settings";
import { getDomain, getDomainToken, updateDomain } from "@/lib/stores/domains";
import { wildcardForHostname } from "@/lib/stores/wildcards";
import type { Domain } from "@/lib/types";

export interface Passo {
  step: string;
  status: "ok" | "error" | "warn";
  message?: string;
}

export interface ProvisionResult {
  domain: Domain;
  steps: Passo[];
}

export async function provisionDomain(id: string): Promise<ProvisionResult> {
  const steps: Passo[] = [];
  let domain = await getDomain(id, ADMIN_SCOPE);
  if (!domain) throw notFound("Domínio não encontrado.");

  const wc = await wildcardForHostname(domain.hostname);
  if (wc) {
    domain = await updateDomain(id, {
      wildcardId: wc.id,
      zoneId: wc.zoneId,
      zoneName: wc.zoneName,
      accountId: wc.accountId,
      dnsType: wc.dnsType,
      dnsTarget: wc.dnsTarget,
      dnsRecordId: null,
      status: "dns_ok",
      lastError: null,
    });
    steps.push({ step: "Registro DNS", status: "ok", message: `Coberto pela zona curinga *.${wc.baseHostname} (sem registro próprio).` });
    return { domain: await verificar(id, domain, steps), steps };
  }

  const token = await getDomainToken(id);
  if (!token) {
    domain = await updateDomain(id, {
      status: "error",
      lastError: "Sem token da Cloudflare: informe um token no domínio ou um token padrão em Configurações.",
      lastCheckAt: agora(),
    });
    steps.push({ step: "Token da Cloudflare", status: "error", message: domain.lastError ?? "" });
    return { domain, steps };
  }

  const alvo = await getDnsTarget();
  if (!alvo.value) {
    domain = await updateDomain(id, {
      status: "error",
      lastError: "Defina em Configurações para onde o DNS deve apontar (IP do servidor ou hostname do túnel).",
      lastCheckAt: agora(),
    });
    steps.push({ step: "Alvo do DNS", status: "error", message: domain.lastError ?? "" });
    return { domain, steps };
  }

  try {
    const t = await verifyToken(token);
    if (t.status !== "active") throw new Error(`Token com status "${t.status}".`);
    steps.push({ step: "Token da Cloudflare", status: "ok" });
  } catch (e) {
    return falhar(id, steps, "Token da Cloudflare", e);
  }

  try {
    const zona = await findZoneForHostname(domain.hostname, token);
    domain = await updateDomain(id, { zoneId: zona.id, zoneName: zona.name, accountId: zona.accountId, wildcardId: null });
    steps.push({ step: "Zona encontrada", status: "ok", message: `${zona.name} (${zona.accountName})` });
  } catch (e) {
    return falhar(id, steps, "Zona da Cloudflare", e);
  }

  try {
    const r = await ensureDnsRecord({
      zoneId: domain.zoneId!,
      token,
      hostname: domain.hostname,
      type: alvo.mode,
      content: alvo.value,
    });
    domain = await updateDomain(id, {
      dnsRecordId: r.recordId,
      dnsType: alvo.mode,
      dnsTarget: alvo.value,
      status: "dns_ok",
      lastError: null,
    });
    const acao = r.action === "created" ? "criado" : r.action === "updated" ? "corrigido" : "já estava certo";
    steps.push({ step: "Registro DNS", status: "ok", message: `${alvo.mode} ${domain.hostname} -> ${alvo.value} (${acao}, proxied)` });
  } catch (e) {
    return falhar(id, steps, "Registro DNS", e);
  }

  return { domain: await verificar(id, domain, steps), steps };
}

async function verificar(id: string, domain: Domain, steps: Passo[]): Promise<Domain> {
  const check = await checkReachability(domain.hostname, await getInstanceId());
  if (check.ok) {
    steps.push({ step: "Domínio no ar", status: "ok", message: check.detail });
    return updateDomain(id, { status: "active", lastError: null, lastCheckAt: agora() });
  }
  steps.push({
    step: "Domínio no ar",
    status: "warn",
    message: `${check.detail} O DNS foi configurado; a propagação/SSL pode levar alguns minutos. Use "Verificar" depois.`,
  });
  return updateDomain(id, { status: "dns_ok", lastError: check.detail, lastCheckAt: agora() });
}

async function falhar(id: string, steps: Passo[], passo: string, e: unknown): Promise<ProvisionResult> {
  const msg = e instanceof Error ? e.message : String(e);
  const domain = await updateDomain(id, { status: "error", lastError: msg, lastCheckAt: agora() });
  steps.push({ step: passo, status: "error", message: msg });
  return { domain, steps };
}

/** Só a checagem de alcance (sem mexer na Cloudflare). */
export async function checkDomain(id: string): Promise<ProvisionResult> {
  const domain = await getDomain(id, ADMIN_SCOPE);
  if (!domain) throw notFound("Domínio não encontrado.");
  const check = await checkReachability(domain.hostname, await getInstanceId());
  const atualizado = await updateDomain(id, {
    status: check.ok ? "active" : domain.status === "active" ? "dns_ok" : domain.status,
    lastError: check.ok ? null : check.detail,
    lastCheckAt: agora(),
  });
  return {
    domain: atualizado,
    steps: [{ step: "Domínio no ar", status: check.ok ? "ok" : "warn", message: check.detail }],
  };
}
