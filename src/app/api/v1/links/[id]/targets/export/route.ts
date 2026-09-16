import { NextResponse, type NextRequest } from "next/server";
import { toCsv } from "@/lib/csv";
import { notFound, protegido } from "@/lib/http";
import { variavelTemplate } from "@/lib/leads";
import { acharLink } from "@/lib/stores/acharLink";
import { allTargets } from "@/lib/stores/targets";

export const dynamic = "force-dynamic";

/** GET — CSV com todos os leads do link: id, referência, destino, variável e URL. */
export const GET = protegido<{ id: string }>(async (req: NextRequest, actor, { id }) => {
  const link = await acharLink(id, actor, req);
  if (!link) throw notFound("Link não encontrado.");
  const host = link.domainHostname;
  const linhas: unknown[][] = [["hf_id", "referencia", "destino", "hf_var", "hf_url", "cliques", "ultimo_clique"]];
  for (const t of await allTargets(link.id)) {
    const v = variavelTemplate(link.code, t.lead);
    linhas.push([t.lead, t.ref ?? "", t.destinationUrl, v, host ? `https://${host}/${v}` : "", t.clicksCount, t.lastClickAt ?? ""]);
  }
  return new NextResponse(toCsv(linhas, ";"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${link.code}-leads.csv"`,
      "cache-control": "no-store",
    },
  });
});
