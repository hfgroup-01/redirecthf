import type { NextRequest } from "next/server";
import { badRequest, bool, json, notFound, readJson, somenteAdmin, str } from "@/lib/http";
import { deleteUser, getUser, updateUser } from "@/lib/stores/users";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = somenteAdmin<{ id: string }>(async (_req, _actor, { id }) => {
  const user = await getUser(id);
  if (!user) throw notFound("Usuário não encontrado.");
  return json({ user });
});

interface Body {
  email?: string;
  name?: string | null;
  active?: boolean;
  clientId?: string | null;
  role?: Role;
}

export const PATCH = somenteAdmin<{ id: string }>(async (req: NextRequest, actor, { id }) => {
  const user = await getUser(id);
  if (!user) throw notFound("Usuário não encontrado.");
  const b = await readJson<Body>(req);
  if (actor.userId === id && ((b.active !== undefined && !bool(b.active, true)) || (b.role !== undefined && b.role !== "admin"))) {
    throw badRequest("Você não pode desativar nem rebaixar o próprio usuário.");
  }
  const patch: Parameters<typeof updateUser>[1] = {};
  if (b.email !== undefined) patch.email = str(b.email);
  if (b.name !== undefined) patch.name = str(b.name) || null;
  if (b.active !== undefined) patch.active = bool(b.active, user.active);
  if (b.clientId !== undefined) patch.clientId = str(b.clientId) || null;
  if (b.role !== undefined) patch.role = b.role === "admin" ? "admin" : "client";
  return json({ user: await updateUser(id, patch) });
});

export const DELETE = somenteAdmin<{ id: string }>(async (_req, actor, { id }) => {
  if (actor.userId === id) throw badRequest("Você não pode apagar o próprio usuário.");
  await deleteUser(id);
  return json({ ok: true });
});
