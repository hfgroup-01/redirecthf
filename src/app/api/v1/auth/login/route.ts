import { NextResponse, type NextRequest } from "next/server";
import { createSessionValue, isSetupDone, loginRateLimited, requestIsSecure, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { clientIp, jsonError, publico, readJson, str } from "@/lib/http";
import { getUserAuthByEmail, touchLogin } from "@/lib/stores/users";

export const dynamic = "force-dynamic";

// Hash de sacrifício: usuário inexistente custa o mesmo tempo que senha errada.
const DUMMY_HASH = hashPassword("hf-dummy-timing-password");

export const POST = publico(async (req: NextRequest) => {
  if (!(await isSetupDone())) return jsonError("Nenhum usuário ainda. Acesse /admin/setup.", 409);
  const body = await readJson<{ email?: string; password?: string }>(req);
  const email = str(body.email).toLowerCase();
  const senha = str(body.password);
  if (loginRateLimited(`ip:${clientIp(req)}`) || (email && loginRateLimited(`email:${email}`))) {
    return jsonError("Muitas tentativas. Aguarde 1 minuto.", 429);
  }
  const u = email ? await getUserAuthByEmail(email) : null;
  const ok = u ? verifyPassword(senha, u.passwordHash) : verifyPassword(senha, DUMMY_HASH) && false;
  if (!u || !senha || !ok) return jsonError("E-mail ou senha incorretos.", 401);
  if (!u.active) return jsonError("Usuário desativado. Fale com o administrador.", 403);
  if (u.role === "client" && !u.clientId) return jsonError("Usuário sem cliente vinculado. Fale com o administrador.", 403);

  await touchLogin(u.id);
  const res = NextResponse.json({ ok: true, role: u.role, mustChangePassword: u.mustChangePassword, email: u.email, name: u.name });
  res.cookies.set(SESSION_COOKIE, createSessionValue({ uid: u.id, sv: u.sessionVersion }), sessionCookieOptions(requestIsSecure(req)));
  return res;
});
