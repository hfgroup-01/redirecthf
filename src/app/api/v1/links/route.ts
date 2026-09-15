import type { NextRequest } from "next/server";
import { escopo } from "@/lib/auth";
import { badRequest, bool, json, protegido, readJson, str, validarUrl } from "@/lib/http";
import { ADMIN_SCOPE } from "@/lib/scope";
import { getClient, getClientBySlug } from "@/lib/stores/clients";
import { listDomains } from "@/lib/stores/domains";
import { createLink, listLinks } from "@/lib/stores/links";
import type { LinkMode } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = protegido(async (req: NextRequest, actor) => {
  const p = req.nextUrl.searchParams;
  const active = p.get("active");
  const mode = p.get("mode");
  return json(
    await listLinks(
      {
        clientId: p.get("clientId") ?? undefined,
        domainId: p.get("domainId") ?? undefined,
        q: p.get("q") ?? undefined,
        active: active === "1" ? true : active === "0" ? false : undefined,
        mode: mode === "page" || mode === "redirect" ? mode : undefined,
        page: Number(p.get("page") ?? 1),
        pageSize: Number(p.get("pageSize") ?? 50),
      },
      escopo(actor)
    )
  );
});

export interface LinkBody {
  clientId?: string | null;
  clientSlug?: string;
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

export const POST = protegido(async (req: NextRequest, actor) => {
  const b = await readJson<LinkBody>(req);
  const scope = escopo(actor);

  let clientId = str(b.clientId) || null;
  if (scope.clientId) {
    clientId = scope.clientId; // usuário de cliente só cria para si
  } else if (!clientId && str(b.clientSlug)) {
    const c = await getClientBySlug(str(b.clientSlug));
    if (!c) throw badRequest(`Cliente com slug "${b.clientSlug}" não existe.`);
    clientId = c.id;
  }
  const client = clientId ? await getClient(clientId) : null;
  if (clientId && !client) throw badRequest("Cliente não encontrado.");

  const mode: LinkMode = b.mode === "page" ? "page" : "redirect";
  const destino = validarUrl(str(b.destinationUrl) || (mode === "redirect" ? client?.defaultUrl ?? "" : ""), "URL de destino");

  // Domínio: o informado -> o padrão do cliente -> o único disponível.
  let domainId = str(b.domainId) || client?.defaultDomainId || null;
  if (!domainId) {
    const ds = client ? await listDomains(ADMIN_SCOPE, { clientId: client.id }) : await listDomains(ADMIN_SCOPE, { unassigned: true });
    if (ds.length === 1) domainId = ds[0].id;
  }
  if (!domainId) throw badRequest("Informe o domínio do link (domainId).");

  const link = await createLink(
    {
      clientId,
      domainId,
      code: str(b.code) || undefined,
      label: str(b.label) || null,
      destinationUrl: destino || null,
      mode,
      appendQuery: bool(b.appendQuery, true),
      pageTitle: str(b.pageTitle) || null,
      pageBody: str(b.pageBody) || null,
      active: bool(b.active, true),
    },
    actor
  );
  return json({ link }, 201);
});
