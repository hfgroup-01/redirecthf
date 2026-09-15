import type { NextRequest } from "next/server";
import { escopo } from "@/lib/auth";
import { json, notFound, protegido } from "@/lib/http";
import { aplicarLead, normalizarLead } from "@/lib/leads";
import { findLinkByCode } from "@/lib/stores/links";
import { getTargetUrl } from "@/lib/stores/targets";

export const dynamic = "force-dynamic";

/**
 * Para integrações: o que um código faz hoje (sem registrar clique).
 * ?host= ou ?domainId= quando o código existe em vários domínios; ?lead= mostra o destino daquele lead.
 */
export const GET = protegido<{ code: string }>(async (req: NextRequest, actor, { code }) => {
  const q = req.nextUrl.searchParams;
  const link = await findLinkByCode(code, escopo(actor), { host: q.get("host"), domainId: q.get("domainId") });
  if (!link) throw notFound(`Código "${code}" não existe.`);
  const lead = normalizarLead(q.get("lead")) || null;
  const urlDoLead = lead ? await getTargetUrl(link.id, lead) : null;
  const bruto = urlDoLead ?? link.destinationUrl;
  return json({
    link,
    lead,
    target: lead && urlDoLead ? { lead, destinationUrl: urlDoLead } : null,
    destino: link.active && link.mode === "redirect" && bruto ? aplicarLead(bruto, lead) : null,
  });
});
