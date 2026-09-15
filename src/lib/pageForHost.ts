/**
 * O que o servidor precisa saber sobre um host no hot path: a qual domínio
 * pertence, config da página white, meta tag do Facebook e se os redirects
 * estão ligados. Cache curto (positivo 30s, negativo 10s) guardado em hosts.ts.
 */
import { hostInfoGet, hostInfoSet, normalizarHost, type HostInfo } from "@/lib/hosts";
import { getPageDefaults } from "@/lib/settings";
import { getDomainByHostname } from "@/lib/stores/domains";
import type { PageConfig } from "@/lib/types";
import { mergePageConfig } from "@/lib/whitePage";

export type { HostInfo };

const TTL_OK = 30_000;
const TTL_NEG = 10_000;

export async function hostInfoForHost(hostRaw: string | null | undefined): Promise<HostInfo> {
  const host = normalizarHost(hostRaw);
  const hit = hostInfoGet(host);
  if (hit) return hit;
  const dom = host ? await getDomainByHostname(host) : null;
  const info: HostInfo = {
    domainId: dom?.id ?? null,
    hostname: host,
    clientId: dom?.clientId ?? null,
    cfg: mergePageConfig(await getPageDefaults(), dom?.pageConfig),
    fbCode: dom?.fbCode ?? null,
    redirectsEnabled: dom ? dom.redirectsEnabled : false,
  };
  hostInfoSet(host, info, dom ? TTL_OK : TTL_NEG);
  return info;
}

export async function pageConfigForHost(hostRaw: string | null | undefined): Promise<PageConfig> {
  return (await hostInfoForHost(hostRaw)).cfg;
}
