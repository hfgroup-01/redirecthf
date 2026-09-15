import { NextResponse, type NextRequest } from "next/server";
import { indiceColuna, parseCsv, sugerirColunas, toCsv } from "@/lib/csv";
import { badRequest, json, notFound, protegido, str } from "@/lib/http";
import { normalizarLead, temMarcadorLead, variavelTemplate } from "@/lib/leads";
import { acharLink } from "@/lib/stores/acharLink";
import { upsertTargets } from "@/lib/stores/targets";

export const dynamic = "force-dynamic";
/** Importações grandes (100k+ linhas) levam alguns segundos. */
export const maxDuration = 300;

const MAX_BYTES = 40 * 1024 * 1024;
const MAX_LINHAS = 250_000;

/**
 * POST multipart: file (CSV), leadColumn?, urlColumn? (nome ou índice; vazio = automático).
 *
 * Dois modos:
 *  - com coluna de URL: cada lead ganha a própria URL (grava em lead_targets);
 *  - sem coluna de URL ("marcador"): não grava nada — só gera as colunas hf_var
 *    e hf_url. Serve quando a URL de destino do link usa {lead} (a substituição
 *    acontece no clique) ou quando todos vão para a mesma URL.
 *
 * ?retorno=csv devolve o MESMO CSV com hf_var e hf_url e o resumo no header
 * x-hf-resumo; sem retorno, devolve JSON com o resumo.
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
  const semUrl = str(form?.get("semUrl")) === "1" || (!pedidoUrl && sug.url < 0);

  const iLead = pedidoLead ? indiceColuna(header, pedidoLead) : sug.lead;
  if (pedidoLead && iLead < 0) throw badRequest(`Coluna do lead "${pedidoLead}" não existe no arquivo.`);
  if (iLead < 0) throw badRequest("Não identifiquei a coluna do lead (telefone/id): escolha-a no formulário.");

  const iUrl = semUrl ? -1 : pedidoUrl ? indiceColuna(header, pedidoUrl) : sug.url;
  if (!semUrl && pedidoUrl && iUrl < 0) throw badRequest(`Coluna da URL "${pedidoUrl}" não existe no arquivo.`);
  if (!semUrl && iUrl < 0) throw badRequest("Não achei a coluna da URL. Se a URL é a mesma para todos, marque a opção de gerar sem coluna de URL.");
  if (iUrl >= 0 && iUrl === iLead) throw badRequest("A coluna do lead e a da URL precisam ser diferentes.");

  const avisos: string[] = [];
  let resumo: Awaited<ReturnType<typeof upsertTargets>> | { recebidos: number; gravados: number; semLead: number; urlInvalida: number; duplicadosNoArquivo: number; exemplosErro: string[] };
  const colunas = { lead: header[iLead], url: iUrl >= 0 ? header[iUrl] : null };

  if (iUrl >= 0) {
    resumo = await upsertTargets(
      link.id,
      dados.map((r) => ({ lead: r[iLead] ?? "", url: r[iUrl] ?? "" }))
    );
  } else {
    // Modo marcador: nada é gravado; só contamos os leads válidos.
    let comLead = 0;
    let semLead = 0;
    for (const r of dados) (normalizarLead(r[iLead]) ? comLead++ : semLead++);
    resumo = { recebidos: dados.length, gravados: comLead, semLead, urlInvalida: 0, duplicadosNoArquivo: 0, exemplosErro: [] };
    if (link.mode === "redirect" && !temMarcadorLead(link.destinationUrl)) {
      avisos.push("A URL de destino do link não tem {lead}: todos os leads vão para a mesma URL. Para direcionar cada um, ponha {lead} na URL de destino do link.");
    }
  }

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
        "x-hf-resumo": encodeURIComponent(JSON.stringify({ resumo, colunas, avisos })),
        "cache-control": "no-store",
      },
    });
  }
  return json({ ok: true, resumo, colunas, avisos });
});
