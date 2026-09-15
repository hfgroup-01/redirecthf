import type { NextRequest } from "next/server";
import { createSessionValue, requestIsSecure, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";
import { json, jsonError, readJson, somenteSessao, str } from "@/lib/http";
import { getUserAuth, setUserPassword } from "@/lib/stores/users";

export const dynamic = "force-dynamic";

/** Troca a própria senha. Derruba as outras sessões e re-emite o cookie desta. */
export const PATCH = somenteSessao(async (req: NextRequest, actor) => {
  const u = await getUserAuth(actor.userId!);
  if (!u) return jsonError("Não autenticado.", 401);
  const b = await readJson<{ currentPassword?: string; newPassword?: string }>(req);
  if (!verifyPassword(str(b.currentPassword), u.passwordHash)) return jsonError("Senha atual incorreta.", 401);
  const sv = await setUserPassword(u.id, str(b.newPassword), { mustChange: false, bumpSession: true });
  const res = json({ ok: true });
  res.cookies.set(
    SESSION_COOKIE,
    createSessionValue({ uid: u.id, sv, imp: actor.impersonating?.clientId ?? null }),
    sessionCookieOptions(requestIsSecure(req))
  );
  return res;
});
