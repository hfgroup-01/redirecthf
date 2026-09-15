import type { NextRequest } from "next/server";
import { CloudflareError, verifyToken } from "@/lib/cloudflare";
import { badRequest, HttpError, json, readJson, somenteAdmin, str, validarHostname } from "@/lib/http";
import {
  getSettingsView,
  setClicksRetentionDays,
  setDefaultCfToken,
  setDnsTarget,
  setPageDefaults,
  setPanelHostSetting,
} from "@/lib/settings";
import { getDomainByHostnameAny } from "@/lib/stores/domains";
import type { DnsType, PageConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = somenteAdmin(async () => json({ settings: await getSettingsView() }));

interface Body {
  dnsTargetMode?: DnsType;
  dnsTargetValue?: string;
  /** "" = manter; null = remover. */
  defaultCfToken?: string | null;
  pageDefaults?: PageConfig;
  clicksRetentionDays?: number;
  /** Host do painel (além de localhost). "" = só localhost. HF_ADMIN_HOST do ambiente tem prioridade. */
  panelHost?: string;
}

export const PATCH = somenteAdmin(async (req: NextRequest) => {
  const b = await readJson<Body>(req);
  const avisos: string[] = [];

  if (b.dnsTargetMode !== undefined || b.dnsTargetValue !== undefined) {
    const atual = await getSettingsView();
    const mode: DnsType = b.dnsTargetMode === "A" ? "A" : b.dnsTargetMode === "CNAME" ? "CNAME" : atual.dnsTargetMode;
    const value = b.dnsTargetValue !== undefined ? str(b.dnsTargetValue) : atual.dnsTargetValue;
    if (mode === "A" && value && !/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
      throw badRequest("Para registro A informe um IPv4 (ex.: 203.0.113.10).");
    }
    if (mode === "CNAME" && value && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) {
      throw badRequest("Para CNAME informe um hostname (ex.: <uuid>.cfargotunnel.com).");
    }
    await setDnsTarget(mode, value);
  }

  if (b.defaultCfToken === null) await setDefaultCfToken("");
  else if (str(b.defaultCfToken)) {
    const token = str(b.defaultCfToken);
    try {
      const t = await verifyToken(token);
      if (t.status !== "active") throw badRequest(`A Cloudflare diz que esse token está "${t.status}".`);
    } catch (e) {
      if (e instanceof HttpError) throw e;
      // Resposta 4xx da Cloudflare = token realmente inválido; falha de rede = salva com aviso.
      if (e instanceof CloudflareError && e.status >= 400 && e.status < 500) {
        throw badRequest(`Token inválido: ${e.message}`);
      }
      avisos.push(`Token salvo, mas não foi possível validar agora: ${(e as Error).message}`);
    }
    await setDefaultCfToken(token);
  }

  if (b.pageDefaults && typeof b.pageDefaults === "object") await setPageDefaults(b.pageDefaults);

  if (b.clicksRetentionDays !== undefined) {
    const n = Number(b.clicksRetentionDays);
    if (!Number.isFinite(n) || n < 1) throw badRequest("Retenção de cliques precisa ser um número de dias >= 1.");
    await setClicksRetentionDays(n);
  }

  if (b.panelHost !== undefined) {
    const h = str(b.panelHost);
    if (h) {
      const host = validarHostname(h);
      if (await getDomainByHostnameAny(host)) throw badRequest("Esse host é um domínio de redirect cadastrado; o painel precisa de outro host.");
      await setPanelHostSetting(host);
    } else {
      await setPanelHostSetting("");
    }
    if (process.env.HF_ADMIN_HOST?.trim()) avisos.push("HF_ADMIN_HOST está definido no ambiente e tem prioridade sobre este campo.");
  }

  return json({ settings: await getSettingsView(), avisos });
});
