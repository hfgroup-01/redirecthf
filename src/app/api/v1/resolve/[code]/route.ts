import type { NextRequest } from "next/server";
import { escopo } from "@/lib/auth";
import { json, notFound, protegido } from "@/lib/http";
import { findLinkByCode } from "@/lib/stores/links";

export const dynamic = "force-dynamic";

/** Para integrações: o que um código faz hoje (sem registrar clique). ?host= ou ?domainId= quando o código existe em vários domínios. */
export const GET = protegido<{ code: string }>(async (req: NextRequest, actor, { code }) => {
  const q = req.nextUrl.searchParams;
  const link = await findLinkByCode(code, escopo(actor), { host: q.get("host"), domainId: q.get("domainId") });
  if (!link) throw notFound(`Código "${code}" não existe.`);
  return json({ link });
});
