import type { NextRequest } from "next/server";
import { escopo } from "@/lib/auth";
import { badRequest, json, protegido, readJson, str, validarUrl } from "@/lib/http";
import { bulkUpdateLinks, type BulkPatch } from "@/lib/stores/links";
import type { LinkMode } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Body {
  ids?: string[];
  clientId?: string;
  destinationUrl?: string;
  mode?: LinkMode;
  active?: boolean;
  domainId?: string | null;
}

/** Troca destino/modo/status de vários links de uma vez (por ids ou por cliente), só no escopo do ator. */
export const POST = protegido(async (req: NextRequest, actor) => {
  const b = await readJson<Body>(req);
  const scope = escopo(actor);
  const ids = Array.isArray(b.ids) ? b.ids.filter((x) => typeof x === "string") : [];
  const clientId = str(b.clientId) || (scope.clientId && !ids.length ? scope.clientId : "");
  if (!ids.length && !clientId) throw badRequest("Informe ids[] ou clientId.");

  const patch: BulkPatch = {};
  if (b.destinationUrl !== undefined) {
    const u = validarUrl(str(b.destinationUrl), "URL de destino");
    if (!u) throw badRequest("URL de destino vazia.");
    patch.destinationUrl = u;
  }
  if (b.mode !== undefined) patch.mode = b.mode === "page" ? "page" : "redirect";
  if (b.active !== undefined) patch.active = Boolean(b.active);
  if (b.domainId !== undefined) patch.domainId = str(b.domainId) || null;
  if (!Object.keys(patch).length) throw badRequest("Nada para alterar.");

  const n = await bulkUpdateLinks({ ids, clientId: clientId || undefined }, patch, actor, scope);
  return json({ ok: true, updated: n });
});
