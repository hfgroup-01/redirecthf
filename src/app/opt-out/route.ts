/**
 * Opt-out público ("não quero mais receber mensagens").
 *   GET  -> página white (o bloco fica no fim, âncora #sair)
 *   POST -> registra o pedido e mostra a confirmação
 * A lista fica em /admin/optouts e em GET /api/v1/optouts (para o disparador filtrar).
 * Só existe nos domínios cadastrados: host desconhecido recebe 404 neutro.
 */
import { NextResponse, type NextRequest } from "next/server";
import { hmac } from "@/lib/crypto";
import { clientIp } from "@/lib/http";
import { normalizarHost } from "@/lib/hosts";
import { hostInfoForHost } from "@/lib/pageForHost";
import { insertOptOut } from "@/lib/stores/optouts";
import { renderNeutral404, renderOptOutDone, renderWhitePage } from "@/lib/whitePage";

export const dynamic = "force-dynamic";

const html = (body: string, status = 200) =>
  new NextResponse(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

export async function GET(req: NextRequest) {
  const host = normalizarHost(req.headers.get("host"));
  const info = await hostInfoForHost(host);
  if (!info.domainId) return html(renderNeutral404(), 404);
  return html(renderWhitePage(info.cfg, { hostname: host, fbCode: info.fbCode, lead: req.nextUrl.searchParams.get("l") }));
}

export async function POST(req: NextRequest) {
  const host = normalizarHost(req.headers.get("host"));
  const info = await hostInfoForHost(host);
  if (!info.domainId) return html(renderNeutral404(), 404);

  let form: FormData | null = null;
  try {
    form = await req.formData();
  } catch {
    form = null;
  }
  const campo = (k: string, max: number) => String(form?.get(k) ?? "").trim().slice(0, max) || null;

  await insertOptOut({
    host: host || null,
    code: campo("code", 40),
    lead: campo("l", 80),
    contact: campo("contact", 40),
    ua: (req.headers.get("user-agent") ?? "").slice(0, 300) || null,
    ipHash: hmac(clientIp(req)).slice(0, 24),
  });

  return html(renderOptOutDone(info.cfg, info.fbCode));
}
