import type { NextRequest } from "next/server";
import { badRequest, json, notFound, protegido, readJson, str } from "@/lib/http";
import { variavelTemplate } from "@/lib/leads";
import { acharLink } from "@/lib/stores/acharLink";
import { countTargets, criarTargetsComId, deleteTargets, listTargets, upsertTargets, type TargetInput } from "@/lib/stores/targets";

export const dynamic = "force-dynamic";

/** GET ?page=&q= — destinos por lead deste link (paginado) + total. */
export const GET = protegido<{ id: string }>(async (req: NextRequest, actor, { id }) => {
  const link = await acharLink(id, actor, req);
  if (!link) throw notFound("Link não encontrado.");
  const p = req.nextUrl.searchParams;
  const [pag, total] = await Promise.all([listTargets(link.id, Number(p.get("page") ?? 1), 50, p.get("q") ?? undefined), countTargets(link.id)]);
  return json({ ...pag, totalNoLink: total, code: link.code, host: link.domainHostname });
});

interface Body {
  /**
   * Sem `lead`, o HF gera o id: [{ url, ref? }] e devolve `ids` na mesma ordem.
   * Com `lead`, usa o identificador enviado (upsert): [{ lead, url }].
   * Até 50 mil por chamada.
   */
  targets?: { lead?: string; url?: string; ref?: string }[];
}

/** POST JSON — cria destinos por lead. Para n8n/disparador. */
export const POST = protegido<{ id: string }>(async (req: NextRequest, actor, { id }) => {
  const link = await acharLink(id, actor, req);
  if (!link) throw notFound("Link não encontrado.");
  const b = await readJson<Body>(req);
  const lista = Array.isArray(b.targets) ? b.targets : [];
  if (!lista.length) throw badRequest("Envie targets: [{ url }] (o HF gera o id) ou [{ lead, url }].");
  if (lista.length > 50_000) throw badRequest("Máximo de 50 mil destinos por chamada; divida em lotes.");

  // Sem nenhum `lead` informado, o HF gera os ids e devolve na mesma ordem.
  if (!lista.some((t) => str(t?.lead))) {
    const r = await criarTargetsComId(
      link.id,
      lista.map((t) => ({ url: str(t?.url), ref: str(t?.ref) || null }))
    );
    const host = link.domainHostname;
    return json({
      ok: true,
      resumo: r.resumo,
      total: await countTargets(link.id),
      leads: r.ids.map((leadId) => ({
        id: leadId,
        var: leadId ? variavelTemplate(link.code, leadId) : null,
        url: leadId && host ? `https://${host}/${variavelTemplate(link.code, leadId)}` : null,
      })),
    });
  }

  const entradas: TargetInput[] = lista.map((t) => ({ lead: str(t?.lead), url: str(t?.url), ref: str(t?.ref) || null }));
  const resumo = await upsertTargets(link.id, entradas);
  return json({ ok: true, resumo, total: await countTargets(link.id) });
});

/** DELETE ?lead=<lead> apaga um; sem lead apaga todos os destinos do link. */
export const DELETE = protegido<{ id: string }>(async (req: NextRequest, actor, { id }) => {
  const link = await acharLink(id, actor, req);
  if (!link) throw notFound("Link não encontrado.");
  const lead = req.nextUrl.searchParams.get("lead");
  const n = await deleteTargets(link.id, lead || undefined);
  return json({ ok: true, removidos: n });
});
