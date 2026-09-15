/**
 * HOT PATH: https://<dominio>/<code>  ou  https://<dominio>/<code>.<lead>
 *   - host desconhecido/inativo -> 404 neutro (nunca o painel)
 *   - link ativo em modo redirect (e chave do domínio ON) -> 302 para a URL do
 *     lead (lead_targets) ou, sem destino próprio, para a URL do link
 *   - link em modo página / pausado / cliente pausado / domínio OFF -> página white (200)
 *   - código desconhecido NESTE domínio -> página white (404, sem registrar clique)
 */
import { NextResponse, type NextRequest } from "next/server";
import { enqueueClick, type ClickInput } from "@/lib/clickQueue";
import { hmac } from "@/lib/crypto";
import { clientIp } from "@/lib/http";
import { normalizarHost } from "@/lib/hosts";
import { normalizarLead, separarCodigoELead } from "@/lib/leads";
import { hostInfoForHost } from "@/lib/pageForHost";
import { resolveLink } from "@/lib/resolve";
import { getTargetUrl } from "@/lib/stores/targets";
import { renderNeutral404, renderWhitePage } from "@/lib/whitePage";

export const dynamic = "force-dynamic";

const BOT_PREVIEW = /facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|Googlebot|bingbot|Applebot|preview|HeadlessChrome/i;

function html(body: string, status: number): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code: segmento } = await ctx.params;
  const host = normalizarHost(req.headers.get("host"));
  const info = await hostInfoForHost(host);
  if (!info.domainId) return html(renderNeutral404(), 404);

  // Lead: "codigo.lead" no caminho tem prioridade; senão ?l=.
  const { code, lead: leadDoCaminho } = separarCodigoELead(segmento);
  const lead = leadDoCaminho ?? (normalizarLead(req.nextUrl.searchParams.get("l")) || null);

  const link = await resolveLink(info.domainId, code);
  if (!link) {
    return html(renderWhitePage(info.cfg, { hostname: host, fbCode: info.fbCode, lead }), 404);
  }

  const ua = (req.headers.get("user-agent") ?? "").slice(0, 300);
  const search = req.nextUrl.search;
  const base: Omit<ClickInput, "outcome"> = {
    linkId: link.id,
    host: host || null,
    country: req.headers.get("cf-ipcountry"),
    ua: ua || null,
    referer: (req.headers.get("referer") ?? "").slice(0, 300) || null,
    query: search ? search.slice(1, 501) : null,
    ipHash: hmac(clientIp(req)).slice(0, 24),
    lead,
  };
  const isBot = BOT_PREVIEW.test(ua);

  const ligado = link.active && link.clientActive && info.redirectsEnabled;
  const podeRedirecionar = ligado && link.mode === "redirect";

  // Destino do lead (se o link tem destinos por lead e o lead veio na URL).
  const urlDoLead = podeRedirecionar && lead && link.hasTargets ? await getTargetUrl(link.id, lead) : null;
  let destino = urlDoLead ?? link.destinationUrl;

  if (!podeRedirecionar || !destino) {
    enqueueClick({ ...base, outcome: isBot ? "bot" : ligado ? "page" : "inactive" });
    return html(
      renderWhitePage(info.cfg, {
        titleOverride: link.pageTitle,
        bodyOverride: link.pageBody,
        hostname: host,
        fbCode: info.fbCode,
        code: link.code,
        lead,
      }),
      200
    );
  }

  if (link.appendQuery) {
    try {
      const u = new URL(destino);
      for (const [k, v] of req.nextUrl.searchParams) u.searchParams.append(k, v);
      // Lead vindo do caminho (codigo.lead) também vai como ?l= para o destino.
      if (leadDoCaminho && !req.nextUrl.searchParams.has("l")) u.searchParams.append("l", leadDoCaminho);
      destino = u.toString();
    } catch {
      /* mantém o destino como está */
    }
  }

  enqueueClick({ ...base, viaTarget: Boolean(urlDoLead), outcome: isBot ? "bot" : "redirect" });
  return new NextResponse(null, {
    status: 302,
    headers: {
      location: destino,
      "cache-control": "no-store, no-cache, must-revalidate",
      "referrer-policy": "no-referrer-when-downgrade",
    },
  });
}
