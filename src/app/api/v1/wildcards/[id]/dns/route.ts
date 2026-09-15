import type { NextRequest } from "next/server";
import { bool, json, readJson, somenteAdmin } from "@/lib/http";
import { provisionWildcard } from "@/lib/wildcardSetup";

export const dynamic = "force-dynamic";

/** (Re)cria o registro `*` na Cloudflare. Body: { confirmReplace?: boolean }. */
export const POST = somenteAdmin<{ id: string }>(async (req: NextRequest, _actor, { id }) => {
  const b = await readJson<{ confirmReplace?: boolean }>(req).catch(() => ({}) as { confirmReplace?: boolean });
  return json(await provisionWildcard(id, { confirmReplace: bool(b.confirmReplace, false) }));
});
