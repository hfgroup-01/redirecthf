import type { NextRequest } from "next/server";
import { CnpjError, consultarCnpj } from "@/lib/cnpj";
import { badRequest, json, jsonError, protegido, readJson, str } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Consulta a Receita e devolve a página white já montada no padrão de agendamento. */
export const POST = protegido(async (req: NextRequest) => {
  const b = await readJson<{ cnpj?: string }>(req);
  const cnpj = str(b.cnpj);
  if (!cnpj) throw badRequest("Informe o CNPJ.");
  try {
    const r = await consultarCnpj(cnpj);
    return json(r);
  } catch (e) {
    if (e instanceof CnpjError) return jsonError(e.message, e.kind === "upstream" ? 502 : 400);
    throw e;
  }
});
