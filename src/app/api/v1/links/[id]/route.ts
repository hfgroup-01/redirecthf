import type { NextRequest } from "next/server";
import { escopo } from "@/lib/auth";
import { bool, json, notFound, protegido, readJson, str, validarUrl } from "@/lib/http";
import { acharLink } from "@/lib/stores/acharLink";
import { serieDiaria } from "@/lib/stores/clicks";
import { deleteLink, listEvents, updateLink } from "@/lib/stores/links";
import type { LinkMode } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = protegido<{ id: string }>(async (req: NextRequest, actor, { id }) => {
  const link = await acharLink(id, actor, req);
  if (!link) throw notFound("Link não encontrado.");
  return json({ link, events: await listEvents(link.id), serie: await serieDiaria(14, link.id) });
});

interface Body {
  clientId?: string | null;
  domainId?: string | null;
  code?: string;
  label?: string | null;
  destinationUrl?: string | null;
  mode?: LinkMode;
  appendQuery?: boolean;
  pageTitle?: string | null;
  pageBody?: string | null;
  active?: boolean;
}

export const PATCH = protegido<{ id: string }>(async (req: NextRequest, actor, { id }) => {
  const link = await acharLink(id, actor, req);
  if (!link) throw notFound("Link não encontrado.");
  const b = await readJson<Body>(req);
  const patch: Parameters<typeof updateLink>[1] = {};
  if (b.clientId !== undefined && actor.role === "admin") patch.clientId = str(b.clientId) || null;
  if (b.domainId !== undefined) patch.domainId = str(b.domainId) || null;
  if (b.code !== undefined && str(b.code)) patch.code = str(b.code);
  if (b.label !== undefined) patch.label = str(b.label) || null;
  if (b.destinationUrl !== undefined) patch.destinationUrl = validarUrl(str(b.destinationUrl), "URL de destino") || null;
  if (b.mode !== undefined) patch.mode = b.mode === "page" ? "page" : "redirect";
  if (b.appendQuery !== undefined) patch.appendQuery = bool(b.appendQuery, link.appendQuery);
  if (b.pageTitle !== undefined) patch.pageTitle = str(b.pageTitle) || null;
  if (b.pageBody !== undefined) patch.pageBody = str(b.pageBody) || null;
  if (b.active !== undefined) patch.active = bool(b.active, link.active);
  return json({ link: await updateLink(link.id, patch, actor, escopo(actor)) });
});

export const DELETE = protegido<{ id: string }>(async (req: NextRequest, actor, { id }) => {
  const link = await acharLink(id, actor, req);
  if (!link) throw notFound("Link não encontrado.");
  await deleteLink(link.id, escopo(actor));
  return json({ ok: true });
});
