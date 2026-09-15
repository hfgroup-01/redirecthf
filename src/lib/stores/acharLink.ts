import type { NextRequest } from "next/server";
import { escopo, type Actor } from "@/lib/auth";
import { findLinkByCode, getLink } from "@/lib/stores/links";
import type { Link } from "@/lib/types";

/** Aceita o id interno OU o código público (com ?host= ou ?domainId= se o código existe em vários domínios). */
export async function acharLink(idOuCodigo: string, actor: Actor, req: NextRequest): Promise<Link | null> {
  const scope = escopo(actor);
  const q = req.nextUrl.searchParams;
  return (await getLink(idOuCodigo, scope)) ?? (await findLinkByCode(idOuCodigo, scope, { domainId: q.get("domainId"), host: q.get("host") }));
}
