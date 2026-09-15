import type { NextRequest } from "next/server";
import { json, notFound, protegido } from "@/lib/http";
import { acharLink } from "@/lib/stores/acharLink";
import { listClicks } from "@/lib/stores/clicks";

export const dynamic = "force-dynamic";

export const GET = protegido<{ id: string }>(async (req: NextRequest, actor, { id }) => {
  const link = await acharLink(id, actor, req);
  if (!link) throw notFound("Link não encontrado.");
  const page = Number(req.nextUrl.searchParams.get("page") ?? 1);
  return json(await listClicks(link.id, page, 50));
});
