import { escopo } from "@/lib/auth";
import { badRequest, json, notFound, protegido } from "@/lib/http";
import { deleteOptOut } from "@/lib/stores/optouts";

export const dynamic = "force-dynamic";

export const DELETE = protegido<{ id: string }>(async (_req, actor, { id }) => {
  const n = Number(id);
  if (!Number.isInteger(n)) throw badRequest("id inválido.");
  if (!(await deleteOptOut(n, escopo(actor)))) throw notFound("Opt-out não encontrado.");
  return json({ ok: true });
});
