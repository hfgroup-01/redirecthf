import { provisionDomain } from "@/lib/domainSetup";
import { json, somenteAdmin } from "@/lib/http";

export const dynamic = "force-dynamic";

/** (Re)cria o registro DNS na Cloudflare (ou usa a zona curinga) e checa se o domínio está no ar. */
export const POST = somenteAdmin<{ id: string }>(async (_req, _actor, { id }) => json(await provisionDomain(id)));
