/**
 * CSV sem dependências: lê o que Excel/Sheets/n8n exportam (vírgula, ponto e
 * vírgula ou tab; aspas com "" escapado; CRLF; BOM) e escreve no mesmo padrão.
 */

export interface CsvLido {
  header: string[];
  rows: string[][];
  delimiter: string;
}

export function detectarDelimitador(primeiraLinha: string): string {
  const cands = [",", ";", "\t", "|"];
  let melhor = ",";
  let max = -1;
  for (const d of cands) {
    const n = primeiraLinha.split(d).length - 1;
    if (n > max) {
      max = n;
      melhor = d;
    }
  }
  return melhor;
}

/** Só a primeira linha (cabeçalho), para o navegador montar os selects. */
export function lerCabecalho(texto: string): { header: string[]; delimiter: string } {
  const t = texto.replace(/^﻿/, "");
  const fim = t.search(/\r?\n/);
  const linha = fim === -1 ? t : t.slice(0, fim);
  const delimiter = detectarDelimitador(linha);
  const { rows } = parseCsv(linha, { delimiter, max: 1 });
  return { header: rows[0] ?? [], delimiter };
}

export function parseCsv(texto: string, opts: { delimiter?: string; max?: number } = {}): CsvLido {
  const t = texto.replace(/^﻿/, "");
  const fim = t.search(/\r?\n/);
  const delimiter = opts.delimiter ?? detectarDelimitador(fim === -1 ? t : t.slice(0, fim));
  const rows: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  const max = opts.max ?? Infinity;

  const fecharLinha = () => {
    linha.push(campo);
    campo = "";
    // ignora linhas totalmente vazias
    if (linha.some((c) => c.trim() !== "")) rows.push(linha);
    linha = [];
  };

  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += ch;
      continue;
    }
    if (ch === '"') {
      aspas = true;
    } else if (ch === delimiter) {
      linha.push(campo);
      campo = "";
    } else if (ch === "\n") {
      fecharLinha();
      if (rows.length >= max) return { header: rows[0] ?? [], rows, delimiter };
    } else if (ch === "\r") {
      // CRLF: o \n seguinte fecha a linha
    } else campo += ch;
  }
  if (campo !== "" || linha.length) fecharLinha();
  return { header: rows[0] ?? [], rows, delimiter };
}

function escapar(v: unknown, delimiter: string): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /["\r\n]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Gera CSV (CRLF, com BOM para o Excel abrir acentos certo). */
export function toCsv(rows: unknown[][], delimiter = ";"): string {
  return "﻿" + rows.map((r) => r.map((v) => escapar(v, delimiter)).join(delimiter)).join("\r\n") + "\r\n";
}

/** Acha o índice de uma coluna pelo nome (sem acento/caixa) ou por número. */
export function indiceColuna(header: string[], pedido: string | number | null | undefined): number {
  if (pedido === null || pedido === undefined || pedido === "") return -1;
  if (typeof pedido === "number") return pedido >= 0 && pedido < header.length ? pedido : -1;
  if (/^\d+$/.test(pedido)) {
    const n = Number(pedido);
    return n >= 0 && n < header.length ? n : -1;
  }
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase();
  const alvo = norm(pedido);
  return header.findIndex((h) => norm(h) === alvo);
}

/** Sugestões automáticas: coluna do lead (telefone/id) e coluna da URL. */
export function sugerirColunas(header: string[], amostra: string[][]): { lead: number; url: number } {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase();
  const hs = header.map(norm);
  let url = hs.findIndex((h) => /^(link|url|destino|destination|destination_url|link_destino)$/.test(h));
  if (url < 0) url = hs.findIndex((h) => /link|url|destino/.test(h));
  if (url < 0) {
    // coluna cujos valores parecem URL
    for (let c = 0; c < header.length; c++) {
      const vals = amostra.map((r) => r[c] ?? "").filter(Boolean);
      if (vals.length && vals.every((v) => /^https?:\/\//i.test(v.trim()))) {
        url = c;
        break;
      }
    }
  }
  let lead = hs.findIndex((h) => /^(telefone|phone|celular|whatsapp|numero|fone|wa|id|lead|lead_id|email|e-mail|cpf)$/.test(h));
  if (lead < 0) lead = hs.findIndex((h) => /telefone|phone|celular|whatsapp|numero|lead|id/.test(h));
  if (lead < 0) lead = header.findIndex((_, i) => i !== url);
  return { lead, url };
}
