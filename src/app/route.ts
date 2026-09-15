import { NextResponse, type NextRequest } from "next/server";
import { isPanelHost, normalizarHost } from "@/lib/hosts";
import { hostInfoForHost } from "@/lib/pageForHost";
import { renderNeutral404, renderWhitePage } from "@/lib/whitePage";

export const dynamic = "force-dynamic";

/**
 * Raiz: no host do painel manda para /admin; num domínio de redirect mostra a
 * página white (com a meta tag do Facebook); em host desconhecido, 404 neutro.
 */
export async function GET(req: NextRequest) {
  const host = normalizarHost(req.headers.get("host"));
  if (await isPanelHost(host)) return NextResponse.redirect(new URL("/admin", req.url), 302);
  const info = await hostInfoForHost(host);
  if (!info.domainId) {
    return new NextResponse(renderNeutral404(), {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return new NextResponse(renderWhitePage(info.cfg, { hostname: host, fbCode: info.fbCode }), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}
