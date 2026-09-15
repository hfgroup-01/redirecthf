import { NextResponse, type NextRequest } from "next/server";
import { indiceColuna, parseCsv, sugerirColunas, toCsv } from "@/lib/csv";
import { badRequest, json, notFound, protegido, str } from "@/lib/http";
import { normalizarLead, variavelTemplate } from "@/lib/leads";
import { acharLink } from "@/lib/stores/acharLink";
import { upsertTargets } from "@/lib/stores/targets";

export const dynamic = "force-dynamic";
/** Importações grandes (100k+ linhas) levam alguns segundos. */
export const maxDuration = 300;

const MAX_BYTES = 40 * 1024 * 1024;
const MAX_LINHAS = 250_000;

/**
 * POST multipart: file (CSV), leadColumn?, urlColumn? (nome ou índice; vazio = automático).
 * ?retorno=csv devolve o MESMO CSV com as colunas hf_var e hf_url (para o disparador),
 * com o resumo no header x-hf-resumo. Sem retorno, devolve JSON com o resumo.
 */
export const POST = protegido<{ id: string }>(async (req: NextRequest, actor, { id }) => {
  const link = await acharLink(id, actor, req);
  if (!link) throw notFound("Link não encontrado.");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Envie o arquivo CSV no campo file.");
  if (file.size > MAX_BYTES) throw badRequest("Arquivo acima de 40 MB. Divida em partes.");

  const csv = parseCsv(await file.text());
  if (csv.rows.length < 2) throw badRequest("CSV vazio ou só com o cabeçalho.");
  const header = csv.header;
  const dados = csv.rows.slice(1);
  if (dados.length > MAX_LINHAS) throw badRequest(`Máximo de ${MAX_LINHAS.toLocaleString("pt-BR")} linhas por arquivo. Divida em partes.`);

  const sug = sugerirColunas(header, dados.slice(0, 20));
  const pedidoLead = str(form?.get("leadColumn"));
  const pedidoUrl = str(form?.get("urlColumn"));
  const iLead = pedidoLead ? indiceColuna(header, pedidoLead) : sug.lead;
  const iUrl = pedidoUrl ? indiceColuna(header, pedidoUrl) : sug.url;
  if (pedidoLead && iLead < 0) throw badRequest(`Coluna do lead "${pedidoLead}" não existe no arquivo.`);
  if (pedidoUrl && iUrl < 0) throw badRequest(`Coluna da URL "${pedidoUrl}" não existe no arquivo.`);
  if (iLead < 0 || iUrl < 0) throw badRequest("Não identifiquei as colunas do lead e da URL: escolha-as no formulário.");
  if (iLead === iUrl) throw badRequest("A coluna do lead e a da URL precisam ser diferentes.");

  const resumo = await upsertTargets(
    link.id,
    dados.map((r) => ({ lead: r[iLead] ?? "", url: r[iUrl] ?? "" }))
  );
  const colunas = { lead: header[iLead], url: header[iUrl] };

  if (req.nextUrl.searchParams.get("retorno") === "csv") {
    const host = link.domainHostname;
    const saida: unknown[][] = [[...header, "hf_var", "hf_url"]];
    for (const r of dados) {
      const lead = normalizarLead(r[iLead]);
      const v = lead ? variavelTemplate(link.code, lead) : "";
      saida.push([...r, v, v && host ? `https://${host}/${v}` : ""]);
    }
    return new NextResponse(toCsv(saida, csv.delimiter), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${link.code}-hf.csv"`,
        "x-hf-resumo": encodeURIComponent(JSON.stringify({ resumo, colunas })),
        "cache-control": "no-store",
      },
    });
  }
  return json({ ok: true, resumo, colunas });
});
