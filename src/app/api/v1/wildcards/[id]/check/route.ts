import { json, somenteAdmin } from "@/lib/http";
import { checkWildcard } from "@/lib/wildcardSetup";

export const dynamic = "force-dynamic";

/** Só a checagem: um host aleatório sob o curinga precisa responder /hf/ping nesta instância. */
export const POST = somenteAdmin<{ id: string }>(async (_req, _actor, { id }) => json(await checkWildcard(id)));
