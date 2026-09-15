import { NextResponse, type NextRequest } from "next/server";
import { createSessionValue, isSetupDone, marcarSetupFeito, requestIsSecure, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { jsonError, publico, readJson, str } from "@/lib/http";
import { checkLegacyAdminPassword, clearLegacyAdminPassword, getApiKey, getInstanceId, legacyAdminPasswordExists } from "@/lib/settings";
import { createUser, getUserAuth } from "@/lib/stores/users";

export const dynamic = "force-dynamic";

/**
 * Primeiro acesso: cria o primeiro administrador (só enquanto não há usuários).
 * Se existe a senha antiga (v2) ou HF_ADMIN_PASSWORD no ambiente, exige uma
 * delas como prova, para ninguém "tomar" o admin na janela pós-atualização.
 */
export const POST = publico(async (req: NextRequest) => {
  if (await isSetupDone()) return jsonError("O primeiro usuário já foi criado. Use o login.", 409);
  const b = await readJson<{ email?: string; name?: string; password?: string; currentAdminPassword?: string }>(req);
  if (await legacyAdminPasswordExists()) {
    if (!(await checkLegacyAdminPassword(str(b.currentAdminPassword)))) {
      return jsonError("Confirme com a senha antiga do admin (ou o HF_ADMIN_PASSWORD do .env).", 401);
    }
  }
  const user = await createUser({ email: str(b.email), name: str(b.name) || null, role: "admin", password: str(b.password), mustChangePassword: false });
  await clearLegacyAdminPassword();
  marcarSetupFeito();
  await getApiKey();
  await getInstanceId();
  const auth = await getUserAuth(user.id);
  const res = NextResponse.json({ ok: true, user });
  res.cookies.set(SESSION_COOKIE, createSessionValue({ uid: user.id, sv: auth?.sessionVersion ?? 1 }), sessionCookieOptions(requestIsSecure(req)));
  return res;
});
