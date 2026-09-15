import { json, jsonError, somenteAdmin } from "@/lib/http";
import { rotateApiKey } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Gera uma nova chave de API (a antiga para de funcionar na hora). Só pelo painel, logado como admin. */
export const POST = somenteAdmin(async (_req, actor) => {
  if (actor.kind !== "user") return jsonError("Só o admin logado no painel pode trocar a chave de API.", 403);
  return json({ apiKey: await rotateApiKey() });
});
