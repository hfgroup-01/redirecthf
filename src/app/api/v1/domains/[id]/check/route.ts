import { escopo } from "@/lib/auth";
import { checkDomain } from "@/lib/domainSetup";
import { json, notFound, protegido } from "@/lib/http";
import { getDomain } from "@/lib/stores/domains";

export const dynamic = "force-dynamic";

/** Só confere se https://<hostname>/hf/ping chega nesta instância. */
export const POST = protegido<{ id: string }>(async (_req, actor, { id }) => {
  if (!(await getDomain(id, escopo(actor)))) throw notFound("Domínio não encontrado.");
  return json(await checkDomain(id));
});
