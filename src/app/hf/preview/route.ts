import { NextResponse, type NextRequest } from "next/server";
import { authenticateRequest, escopo } from "@/lib/auth";
import { foraDoPainel } from "@/lib/http";
import { getPageDefaults } from "@/lib/settings";
import { getDomain } from "@/lib/stores/domains";
import { getLink } from "@/lib/stores/links";
import type { PageConfig } from "@/lib/types";
import { mergePageConfig, renderWhitePage } from "@/lib/whitePage";

export const dynamic = "force-dynamic";

/** Pré-visualização da página white no painel: ?domain=<id> e/ou ?link=<id>. Exige login; respeita o escopo. */
export async function GET(req: NextRequest) {
  if (await foraDoPainel(req)) return new NextResponse("Não encontrado.", { status: 404 });
  const actor = await authenticateRequest(req);
  if (!actor) return new NextResponse("Não autenticado.", { status: 401 });
  const scope = escopo(actor);
  const domainId = req.nextUrl.searchParams.get("domain");
  const linkId = req.nextUrl.searchParams.get("link");

  let cfg: PageConfig = await getPageDefaults();
  let title: string | null = null;
  let body: string | null = null;

  const link = linkId ? await getLink(linkId, scope) : null;
  if (linkId && !link) return new NextResponse("Não encontrado.", { status: 404 });
  const dom = domainId ? await getDomain(domainId, scope) : link?.domainId ? await getDomain(link.domainId, scope) : null;
  if (domainId && !dom) return new NextResponse("Não encontrado.", { status: 404 });
  if (dom) cfg = mergePageConfig(cfg, dom.pageConfig);
  if (link) {
    title = link.pageTitle;
    body = link.pageBody;
  }

  return new NextResponse(renderWhitePage(cfg, { titleOverride: title, bodyOverride: body, fbCode: dom?.fbCode ?? null }), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
