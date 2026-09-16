/**
 * Zona curinga: cria (ou corrige) o registro `*.<base>` proxied apontando para
 * o alvo DNS do HF. Depois disso, qualquer <label>.<base> cadastrado como
 * domínio dispensa chamada à Cloudflare: só a verificação /hf/ping.
 *
 * Se já existe um `*` diferente (ex.: A para IP de estacionamento), NÃO mexe:
 * devolve `needsConfirm` com o que existe e só substitui com `confirmReplace`.
 */
import { checkReachability, ensureDnsRecord, findZoneForHostname, listDnsRecords, verifyToken } from "@/lib/cloudflare";
import { agora } from "@/lib/db";
import type { Passo } from "@/lib/domainSetup";
import { notFound } from "@/lib/errors";
import { getDnsTarget, getInstanceId } from "@/lib/settings";
import { getWildcard, getWildcardToken, updateWildcard } from "@/lib/stores/wildcards";
import type { Wildcard } from "@/lib/types";

export interface ExistingRecord {
  type: string;
  content: string;
  proxied: boolean;
}

export interface WildcardResult {
  wildcard: Wildcard;
  steps: Passo[];
  /** true = existe um `*` divergente; nada foi alterado. Repita com confirmReplace. */
  needsConfirm?: boolean;
  existing?: ExistingRecord[];
}

function probeHost(base: string): string {
  return `hfprobe-${Math.random().toString(36).slice(2, 8)}.${base}`;
}

export async function provisionWildcard(id: string, opts: { confirmReplace?: boolean } = {}): Promise<WildcardResult> {
  const steps: Passo[] = [];
  let wc = await getWildcard(id);
  if (!wc) throw notFound("Zona curinga não encontrada.");

  const token = await getWildcardToken(id);
  if (!token) {
    wc = await updateWildcard(id, {
      status: "error",
      lastError: "Sem token da Cloudflare: informe um token na zona ou um token padrão em Configurações.",
      lastCheckAt: agora(),
    });
    steps.push({ step: "Token da Cloudflare", status: "error", message: wc.lastError ?? "" });
    return { wildcard: wc, steps };
  }

  const alvo = await getDnsTarget();
  if (!alvo.value) {
    wc = await updateWildcard(id, {
      status: "error",
      lastError: "Defina em Configurações para onde o DNS deve apontar (IP do servidor ou hostname do túnel).",
      lastCheckAt: agora(),
    });
    steps.push({ step: "Alvo do DNS", status: "error", message: wc.lastError ?? "" });
    return { wildcard: wc, steps };
  }

  try {
    const t = await verifyToken(token);
    if (t.status !== "active") throw new Error(`Token com status "${t.status}".`);
    steps.push({ step: "Token da Cloudflare", status: "ok" });
  } catch (e) {
    return falhar(id, steps, "Token da Cloudflare", e);
  }

  let zoneId: string;
  try {
    const zona = await findZoneForHostname(wc.baseHostname, token);
    if (zona.name !== wc.baseHostname) {
      throw new Error(
        `"${wc.baseHostname}" não é a raiz da zona (a zona é "${zona.name}"). O certificado da Cloudflare só cobre um nível de subdomínio: cadastre a zona curinga na raiz.`
      );
    }
    zoneId = zona.id;
    wc = await updateWildcard(id, { zoneId: zona.id, zoneName: zona.name, accountId: zona.accountId });
    steps.push({ step: "Zona encontrada", status: "ok", message: `${zona.name} (${zona.accountName})` });
  } catch (e) {
    return falhar(id, steps, "Zona da Cloudflare", e);
  }

  const nome = `*.${wc.baseHostname}`;
  try {
    const existentes = (await listDnsRecords(zoneId, token, nome)).filter((r) => r.type === "A" || r.type === "AAAA" || r.type === "CNAME");
    const divergentes = existentes.filter(
      (r) => !(r.type === alvo.mode && r.content.toLowerCase() === alvo.value.toLowerCase() && r.proxied)
    );
    if (divergentes.length && !opts.confirmReplace) {
      const lista = divergentes.map((r) => `${r.type} → ${r.content}${r.proxied ? "" : " (sem proxy)"}`).join(", ");
      steps.push({
        step: "Registro curinga",
        status: "warn",
        message: `Já existe ${lista} em ${nome}. Nada foi alterado: confirme a substituição para o HF assumir o curinga.`,
      });
      return {
        wildcard: wc,
        steps,
        needsConfirm: true,
        existing: divergentes.map((r) => ({ type: r.type, content: r.content, proxied: r.proxied })),
      };
    }
    const r = await ensureDnsRecord({ zoneId, token, hostname: nome, type: alvo.mode, content: alvo.value });
    wc = await updateWildcard(id, {
      dnsRecordId: r.recordId,
      dnsType: alvo.mode,
      dnsTarget: alvo.value,
      status: "dns_ok",
      lastError: null,
    });
    const acao = r.action === "created" ? "criado" : r.action === "updated" ? "substituído" : "já estava certo";
    steps.push({ step: "Registro curinga", status: "ok", message: `${alvo.mode} ${nome} -> ${alvo.value} (${acao}, proxied)` });
  } catch (e) {
    return falhar(id, steps, "Registro curinga", e);
  }

  return { wildcard: await verificar(id, wc, steps), steps };
}

async function verificar(id: string, wc: Wildcard, steps: Passo[]): Promise<Wildcard> {
  const probe = probeHost(wc.baseHostname);
  const check = await checkReachability(probe, await getInstanceId());
  if (check.ok) {
    steps.push({ step: "Curinga no ar", status: "ok", message: `${probe} chega neste HF.` });
    return updateWildcard(id, { status: "active", lastError: null, lastCheckAt: agora() });
  }
  // Sem registro criado, "dns_ok" seria mentira: o painel mostraria "DNS OK ·
  // propagando" para uma zona cujo `*` nunca foi cadastrado (o botão Verificar
  // não toca na Cloudflare, então ele sozinho nunca deixa o DNS pronto).
  const temRegistro = Boolean(wc.dnsRecordId);
  steps.push({
    step: "Curinga no ar",
    status: "warn",
    message: temRegistro
      ? `${check.detail} O DNS foi configurado; a propagação pode levar alguns minutos. Use "Verificar" depois.`
      : `${check.detail} O registro curinga ainda não foi criado: use o botão "DNS".`,
  });
  return updateWildcard(id, { status: temRegistro ? "dns_ok" : "pending", lastError: check.detail, lastCheckAt: agora() });
}

async function falhar(id: string, steps: Passo[], passo: string, e: unknown): Promise<WildcardResult> {
  const msg = e instanceof Error ? e.message : String(e);
  const wildcard = await updateWildcard(id, { status: "error", lastError: msg, lastCheckAt: agora() });
  steps.push({ step: passo, status: "error", message: msg });
  return { wildcard, steps };
}

/** Só a checagem de alcance com um host aleatório sob o curinga (sem mexer na Cloudflare). */
export async function checkWildcard(id: string): Promise<WildcardResult> {
  const wc = await getWildcard(id);
  if (!wc) throw notFound("Zona curinga não encontrada.");
  const steps: Passo[] = [];
  return { wildcard: await verificar(id, wc, steps), steps };
}
