import { NextResponse, type NextRequest } from "next/server";
import { normalizarHost } from "@/lib/hosts";
import { hostInfoForHost } from "@/lib/pageForHost";
import { renderNeutral404, renderPrivacyPage } from "@/lib/whitePage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const info = await hostInfoForHost(normalizarHost(req.headers.get("host")));
  if (!info.domainId) {
    return new NextResponse(renderNeutral404(), {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return new NextResponse(renderPrivacyPage(info.cfg, info.fbCode), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
