import { NextResponse, type NextRequest } from "next/server";
import { indiceColuna, parseCsv, sugerirColunas, toCsv } from "@/lib/csv";
import { badRequest, json, notFound, protegido, str } from "@/lib/http";
import { normalizarLead, temMarcadorLead, variavelTemplate } from "@/lib/leads";
import { acharLink } from "@/lib/stores/acharLink";
import { criarTargetsComId, upsertTargets, type UpsertResumo } from "@/lib/stores/targets";

export const dynamic = "force-dynamic";
/** Importações grandes (100k+ linhas) levam alguns segundos. */
export const maxDuration = 300;

const MAX_BYTES = 40 * 1024 * 1024;
const MAX_LINHAS = 250_000;

/**
 * POST multipart com o CSV da lista de leads. Devolve a MESMA planilha com as
 * colunas hf_id, hf_var (valor de {{1}}) e hf_url.
 *
 * Campos:
 *   file        CSV
 *   modo        "gerar" (padrão) | "existente"
 *   urlColumn   coluna com o link de destino de cada lead
 *   refColumn   (modo gerar, opcional) telefone/nome só para identificar no painel
 *   leadColumn  (modo existente) coluna cujo valor vira o id na URL
 *   semUrl=1    (modo existente) planilha sem coluna de link: o destino do link
 *               usa {lead} e nada é gravado
 *
 * modo "gerar": o HF cria um id opaco por linha (nada de telefone na URL) e
 * grava id -> destino. É o fluxo normal: sobe a lista, recebe os ids prontos.
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
  const modo = str(form?.get("modo")) === "existente" ? "existente" : "gerar";
  const pedidoUrl = str(form?.get("urlColumn"));
  const pedidoLead = str(form?.get("leadColumn"));
  const pedidoRef = str(form?.get("refColumn"));
  const semUrl = modo === "existente" && (str(form?.get("semUrl")) === "1" || (!pedidoUrl && sug.url < 0));

  const coluna = (pedido: string, sugerido: number, nome: string): number => {
    const i = pedido ? indiceColuna(header, pedido) : sugerido;
    if (pedido && i < 0) throw badRequest(`Coluna ${nome} "${pedido}" não existe no arquivo.`);
    return i;
  };
  const iUrl = semUrl ? -1 : coluna(pedidoUrl, sug.url, "do link");
  const iLead = modo === "existente" ? coluna(pedidoLead, sug.lead, "do lead") : -1;
  const iRef = modo === "gerar" && pedidoRef ? coluna(pedidoRef, -1, "de referência") : -1;

  const avisos: string[] = [];
  let resumo: UpsertResumo;
  let ids: (string | null)[];

  if (modo === "gerar") {
    if (iUrl < 0) throw badRequest("Escolha a coluna com o link de destino de cada lead.");
    const r = await criarTargetsComId(
      link.id,
      dados.map((linha) => ({ url: linha[iUrl] ?? "", ref: iRef >= 0 ? (linha[iRef] ?? null) : null }))
    );
    ids = r.ids;
    resumo = r.resumo;
  } else if (iUrl >= 0) {
    if (iLead < 0) throw badRequest("Não identifiquei a coluna do lead: escolha-a no formulário.");
    if (iUrl === iLead) throw badRequest("A coluna do lead e a do link precisam ser diferentes.");
    resumo = await upsertTargets(
      link.id,
      dados.map((linha) => ({ lead: linha[iLead] ?? "", url: linha[iUrl] ?? "" }))
    );
    ids = dados.map((linha) => normalizarLead(linha[iLead]) || null);
  } else {
    // Planilha sem coluna de link: o destino do link usa {lead}; nada é gravado.
    if (iLead < 0) throw badRequest("Não identifiquei a coluna do lead: escolha-a no formulário.");
    ids = dados.map((linha) => normalizarLead(linha[iLead]) || null);
    const comLead = ids.filter(Boolean).length;
    resumo = { recebidos: dados.length, gravados: comLead, semLead: dados.length - comLead, urlInvalida: 0, duplicadosNoArquivo: 0, exemplosErro: [] };
    if (link.mode === "redirect" && !temMarcadorLead(link.destinationUrl)) {
      avisos.push("A URL de destino do link não tem {lead}: todos os leads vão para a mesma URL. Para direcionar cada um, ponha {lead} na URL de destino do link.");
    }
  }

  const colunas = {
    url: iUrl >= 0 ? header[iUrl] : null,
    lead: iLead >= 0 ? header[iLead] : null,
    ref: iRef >= 0 ? header[iRef] : null,
  };

  if (req.nextUrl.searchParams.get("retorno") === "csv") {
    const host = link.domainHostname;
    const saida: unknown[][] = [[...header, "hf_id", "hf_var", "hf_url"]];
    dados.forEach((linha, i) => {
      const leadId = ids[i];
      const v = leadId ? variavelTemplate(link.code, leadId) : "";
      saida.push([...linha, leadId ?? "", v, v && host ? `https://${host}/${v}` : ""]);
    });
    return new NextResponse(toCsv(saida, csv.delimiter), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${link.code}-hf.csv"`,
        "x-hf-resumo": encodeURIComponent(JSON.stringify({ resumo, colunas, avisos, modo })),
        "cache-control": "no-store",
      },
    });
  }
  return json({ ok: true, modo, resumo, colunas, avisos });
});
