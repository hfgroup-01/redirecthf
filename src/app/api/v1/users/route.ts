import type { NextRequest } from "next/server";
import { randomPassword } from "@/lib/crypto";
import { bool, json, readJson, somenteAdmin, str } from "@/lib/http";
import { createUser, listUsers } from "@/lib/stores/users";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET ?clientId=&role= — usuários (só admin). */
export const GET = somenteAdmin(async (req: NextRequest) => {
  const p = req.nextUrl.searchParams;
  const role = p.get("role");
  return json({ users: await listUsers({ clientId: p.get("clientId") ?? undefined, role: role === "admin" || role === "client" ? role : undefined }) });
});

interface Body {
  email?: string;
  name?: string;
  role?: Role;
  clientId?: string | null;
  /** Sem senha: o HF gera uma temporária e devolve UMA vez em `tempPassword`. */
  password?: string;
  mustChangePassword?: boolean;
}

export const POST = somenteAdmin(async (req: NextRequest) => {
  const b = await readJson<Body>(req);
  const temp = str(b.password) ? null : randomPassword(12);
  const user = await createUser({
    email: str(b.email),
    name: str(b.name) || null,
    role: b.role === "admin" ? "admin" : "client",
    clientId: str(b.clientId) || null,
    password: str(b.password) || temp!,
    mustChangePassword: temp ? true : bool(b.mustChangePassword, false),
  });
  return json({ user, tempPassword: temp }, 201);
});
