import type { NextRequest } from "next/server";
import { badRequest, bool, json, readJson, somenteAdmin, str, validarUrl } from "@/lib/http";
import { createClient, listClients } from "@/lib/stores/clients";

export const dynamic = "force-dynamic";

export const GET = somenteAdmin(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const ativos = req.nextUrl.searchParams.get("active") === "1";
  return json({ clients: await listClients(q, ativos) });
});

interface Body {
  name?: string;
  slug?: string;
  phone?: string;
  notes?: string;
  /** Domínio sem dono: passa a pertencer ao cliente. */
  defaultDomainId?: string | null;
  defaultUrl?: string;
  active?: boolean;
}

export const POST = somenteAdmin(async (req: NextRequest, actor) => {
  const b = await readJson<Body>(req);
  const name = str(b.name);
  if (!name) throw badRequest("Informe o nome do cliente.");
  const client = await createClient(
    {
      name,
      slug: str(b.slug) || undefined,
      phone: str(b.phone) || null,
      notes: str(b.notes) || null,
      defaultDomainId: str(b.defaultDomainId) || null,
      defaultUrl: validarUrl(str(b.defaultUrl), "URL padrão") || null,
      active: bool(b.active, true),
    },
    actor
  );
  return json({ client }, 201);
});
