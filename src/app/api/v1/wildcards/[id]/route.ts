import { conflict, json, notFound, somenteAdmin } from "@/lib/http";
import { deleteWildcard, getWildcard } from "@/lib/stores/wildcards";

export const dynamic = "force-dynamic";

export const GET = somenteAdmin<{ id: string }>(async (_req, _actor, { id }) => {
  const wildcard = await getWildcard(id);
  if (!wildcard) throw notFound("Zona curinga não encontrada.");
  return json({ wildcard });
});

/** Remove do HF (o registro `*` na Cloudflare fica; apague à mão se quiser). */
export const DELETE = somenteAdmin<{ id: string }>(async (_req, _actor, { id }) => {
  const wildcard = await getWildcard(id);
  if (!wildcard) throw notFound("Zona curinga não encontrada.");
  if ((wildcard.domainsCount ?? 0) > 0) {
    throw conflict(`Essa zona cobre ${wildcard.domainsCount} domínio(s). Remova ou mova esses domínios antes.`);
  }
  await deleteWildcard(id);
  return json({ ok: true });
});
