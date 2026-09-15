import type { NextRequest } from "next/server";
import { bool, json, readJson, somenteAdmin, str, validarHostname } from "@/lib/http";
import { createWildcard, listWildcards } from "@/lib/stores/wildcards";
import { provisionWildcard } from "@/lib/wildcardSetup";

export const dynamic = "force-dynamic";

export const GET = somenteAdmin(async () => json({ wildcards: await listWildcards() }));

interface Body {
  /** Raiz da zona na Cloudflare (ex.: lumix10.cfd). */
  base?: string;
  apiToken?: string;
  /** default true: cria o registro `*` já. */
  provision?: boolean;
  /** true = substitui um `*` existente que aponte para outro lugar. */
  confirmReplace?: boolean;
}

/** Responde 201 com `needsConfirm: true` (sem mexer no DNS) quando já existe um `*` divergente. */
export const POST = somenteAdmin(async (req: NextRequest) => {
  const b = await readJson<Body>(req);
  const base = validarHostname(str(b.base));
  const wildcard = await createWildcard({ baseHostname: base, apiToken: str(b.apiToken) || null });
  if (!bool(b.provision, true)) return json({ wildcard, steps: [] }, 201);
  const r = await provisionWildcard(wildcard.id, { confirmReplace: bool(b.confirmReplace, false) });
  return json(r, 201);
});
