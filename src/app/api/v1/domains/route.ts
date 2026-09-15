import type { NextRequest } from "next/server";
import { escopo } from "@/lib/auth";
import { consultarCnpj, digitosCnpj } from "@/lib/cnpj";
import { provisionDomain } from "@/lib/domainSetup";
import { badRequest, bool, json, protegido, readJson, somenteAdmin, str, validarHostname, validarLabel } from "@/lib/http";
import { createDomain, listDomains } from "@/lib/stores/domains";
import { getWildcardByBase } from "@/lib/stores/wildcards";
import type { PageConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET ?clientId=&unassigned=1 — no escopo do ator. */
export const GET = protegido(async (req: NextRequest, actor) => {
  const p = req.nextUrl.searchParams;
  return json({ domains: await listDomains(escopo(actor), { clientId: p.get("clientId") ?? undefined, unassigned: p.get("unassigned") === "1" }) });
});

interface Body {
  /** Hostname completo... */
  hostname?: string;
  /** ...ou subdomínio de uma zona curinga cadastrada: label + base (ex.: "minhaempresa" + "lumix10.cfd"). */
  label?: string;
  base?: string;
  clientId?: string | null;
  apiToken?: string;
  pageConfig?: PageConfig;
  /** Código(s) da meta tag facebook-domain-verification. */
  fbCode?: string;
  /** Com CNPJ, a página white é montada sozinha no padrão de agendamento. */
  cnpj?: string;
  /** default true: já cria o DNS na Cloudflare (ou usa o curinga) e checa se está no ar. */
  provision?: boolean;
}

export const POST = somenteAdmin(async (req: NextRequest) => {
  const b = await readJson<Body>(req);
  let hostname: string;
  let wildcardId: string | null = null;
  if (str(b.base)) {
    const base = validarHostname(str(b.base));
    const wc = await getWildcardByBase(base);
    if (!wc) throw badRequest(`A zona curinga "${base}" não está cadastrada. Cadastre em Domínios > Zonas curinga.`);
    hostname = `${validarLabel(str(b.label))}.${wc.baseHostname}`;
    wildcardId = wc.id;
  } else {
    hostname = validarHostname(str(b.hostname));
  }
  const avisos: string[] = [];

  let pageConfig: PageConfig = b.pageConfig && typeof b.pageConfig === "object" ? b.pageConfig : {};
  const cnpj = digitosCnpj(str(b.cnpj));
  if (cnpj) {
    try {
      const r = await consultarCnpj(cnpj);
      pageConfig = { ...r.pageConfig, ...pageConfig };
    } catch (e) {
      avisos.push(`Não consegui preencher pelo CNPJ: ${(e as Error).message}`);
    }
  }

  const domain = await createDomain({
    hostname,
    apiToken: str(b.apiToken) || undefined,
    pageConfig,
    fbCode: str(b.fbCode) || null,
    cnpj: cnpj || null,
    clientId: str(b.clientId) || null,
    wildcardId,
  });
  if (!bool(b.provision, true)) return json({ domain, steps: [], avisos }, 201);
  const r = await provisionDomain(domain.id);
  return json({ ...r, avisos }, 201);
});
