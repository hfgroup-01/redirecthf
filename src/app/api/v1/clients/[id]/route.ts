import type { NextRequest } from "next/server";
import { escopo } from "@/lib/auth";
import { bool, json, notFound, protegido, readJson, somenteAdmin, str, validarUrl } from "@/lib/http";
import { serieDiaria } from "@/lib/stores/clicks";
import { deleteClient, getClient, getClientBySlug, updateClient } from "@/lib/stores/clients";
import { listDomains } from "@/lib/stores/domains";
import { listLinks } from "@/lib/stores/links";
import { listUsers } from "@/lib/stores/users";

export const dynamic = "force-dynamic";

async function achar(idOuSlug: string) {
  const c = (await getClient(idOuSlug)) ?? (await getClientBySlug(idOuSlug));
  if (!c) throw notFound("Cliente não encontrado.");
  return c;
}

/** Admin vê qualquer cliente; usuário de cliente só o próprio. */
export const GET = protegido<{ id: string }>(async (_req, actor, { id }) => {
  const client = await achar(id);
  const scope = escopo(actor);
  if (scope.clientId && scope.clientId !== client.id) throw notFound("Cliente não encontrado.");
  return json({
    client,
    domains: await listDomains(scope, { clientId: client.id }),
    users: actor.role === "admin" ? await listUsers({ clientId: client.id }) : [],
    links: (await listLinks({ clientId: client.id, pageSize: 200 }, scope)).items,
    serie: await serieDiaria(14, undefined, client.id),
  });
});

interface Body {
  name?: string;
  slug?: string;
  phone?: string | null;
  notes?: string | null;
  defaultDomainId?: string | null;
  defaultUrl?: string | null;
  active?: boolean;
}

export const PATCH = somenteAdmin<{ id: string }>(async (req: NextRequest, actor, { id }) => {
  const client = await achar(id);
  const b = await readJson<Body>(req);
  const patch: Parameters<typeof updateClient>[1] = {};
  if (b.name !== undefined) patch.name = str(b.name) || client.name;
  if (b.slug !== undefined) patch.slug = str(b.slug) || client.slug;
  if (b.phone !== undefined) patch.phone = str(b.phone) || null;
  if (b.notes !== undefined) patch.notes = str(b.notes) || null;
  if (b.defaultDomainId !== undefined) patch.defaultDomainId = str(b.defaultDomainId) || null;
  if (b.defaultUrl !== undefined) patch.defaultUrl = validarUrl(str(b.defaultUrl), "URL padrão") || null;
  if (b.active !== undefined) patch.active = bool(b.active, client.active);
  return json({ client: await updateClient(client.id, patch, actor) });
});

export const DELETE = somenteAdmin<{ id: string }>(async (_req, _actor, { id }) => {
  const client = await achar(id);
  await deleteClient(client.id);
  return json({ ok: true });
});
