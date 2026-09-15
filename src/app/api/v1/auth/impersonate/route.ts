import type { NextRequest } from "next/server";
import { createSessionValue, requestIsSecure, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { json, jsonError, notFound, readJson, somenteSessao, str } from "@/lib/http";
import { getClient } from "@/lib/stores/clients";
import { getUserAuth } from "@/lib/stores/users";

export const dynamic = "force-dynamic";

/** Admin entra como um cliente (vê o painel com o escopo dele). As ações ficam atribuídas ao admin. */
export const POST = somenteSessao(async (req: NextRequest, actor) => {
  if (actor.role !== "admin" || actor.impersonating) return jsonError("Só o administrador pode entrar como cliente.", 403);
  const b = await readJson<{ clientId?: string }>(req);
  const client = str(b.clientId) ? await getClient(str(b.clientId)) : null;
  if (!client) throw notFound("Cliente não encontrado.");
  const u = await getUserAuth(actor.userId!);
  if (!u) return jsonError("Não autenticado.", 401);
  const res = json({ ok: true, client: { id: client.id, name: client.name } });
  res.cookies.set(SESSION_COOKIE, createSessionValue({ uid: u.id, sv: u.sessionVersion, imp: client.id }), sessionCookieOptions(requestIsSecure(req)));
  return res;
});

/** Volta a ser admin. */
export const DELETE = somenteSessao(async (req: NextRequest, actor) => {
  const u = await getUserAuth(actor.userId!);
  if (!u) return jsonError("Não autenticado.", 401);
  const res = json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionValue({ uid: u.id, sv: u.sessionVersion }), sessionCookieOptions(requestIsSecure(req)));
  return res;
});
