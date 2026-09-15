import { randomPassword } from "@/lib/crypto";
import { json, notFound, somenteAdmin } from "@/lib/http";
import { getUser, setUserPassword } from "@/lib/stores/users";

export const dynamic = "force-dynamic";

/** Gera senha temporária (mostrada uma vez) e derruba as sessões do usuário. */
export const POST = somenteAdmin<{ id: string }>(async (_req, _actor, { id }) => {
  const user = await getUser(id);
  if (!user) throw notFound("Usuário não encontrado.");
  const tempPassword = randomPassword(12);
  await setUserPassword(id, tempPassword, { mustChange: true, bumpSession: true });
  return json({ ok: true, tempPassword });
});
