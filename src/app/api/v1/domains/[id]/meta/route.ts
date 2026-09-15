import { escopo } from "@/lib/auth";
import { json, notFound, protegido } from "@/lib/http";
import { getDomain } from "@/lib/stores/domains";
import { fbCodes } from "@/lib/whitePage";

export const dynamic = "force-dynamic";

/**
 * Confere, pela internet, se a raiz do domínio já entrega a meta tag
 * facebook-domain-verification com o(s) código(s) salvos. É o que o
 * Business Manager vai ler quando você clicar em "Verificar domínio".
 */
export const POST = protegido<{ id: string }>(async (_req, actor, { id }) => {
  const domain = await getDomain(id, escopo(actor));
  if (!domain) throw notFound("Domínio não encontrado.");
  const esperados = fbCodes(domain.fbCode);
  if (!esperados.length) return json({ ok: false, status: null, encontrados: [], faltando: [], detail: "Nenhum código salvo neste domínio." });

  let status: number | null = null;
  let htmlTexto = "";
  try {
    const res = await fetch(`https://${domain.hostname}/?t=${Date.now()}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { "cache-control": "no-cache", "user-agent": "facebookexternalhit/1.1 (+hf-check)" },
    });
    status = res.status;
    htmlTexto = await res.text();
  } catch (e) {
    return json({ ok: false, status, encontrados: [], faltando: esperados, detail: `Sem resposta: ${(e as Error).message}` });
  }

  const presentes = new Set<string>();
  const re = /<meta\s+name=["']facebook-domain-verification["']\s+content=["']([^"']+)["']/gi;
  for (const m of htmlTexto.matchAll(re)) presentes.add(m[1]);
  const encontrados = esperados.filter((c) => presentes.has(c));
  const faltando = esperados.filter((c) => !presentes.has(c));
  const ok = status === 200 && faltando.length === 0;
  return json({
    ok,
    status,
    encontrados,
    faltando,
    detail: ok
      ? "A meta tag está no ar. Pode clicar em Verificar no Business Manager."
      : status !== 200
        ? `A raiz do domínio respondeu HTTP ${status} (esperado 200).`
        : `A página respondeu, mas sem o(s) código(s): ${faltando.join(", ")}.`,
  });
});
