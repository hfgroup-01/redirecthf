import { json, protegido } from "@/lib/http";
import { getUser } from "@/lib/stores/users";

export const dynamic = "force-dynamic";

/** Quem sou eu: usuário da sessão (ou null com chave de API) e o ator efetivo. */
export const GET = protegido(async (_req, actor) => {
  const user = actor.userId ? await getUser(actor.userId) : null;
  return json({
    user,
    actor: { kind: actor.kind, role: actor.role, clientId: actor.clientId, email: actor.email, impersonating: actor.impersonating },
  });
});
