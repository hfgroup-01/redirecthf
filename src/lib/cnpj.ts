/**
 * Consulta de CNPJ (BrasilAPI, com fallback na publica.cnpj.ws) e montagem
 * da página white no "padrão de agendamento" a partir dos dados públicos da
 * Receita. Sem chave de API.
 */
import { PAGE_DEFAULTS } from "@/lib/settings";
import type { PageConfig } from "@/lib/types";

export class CnpjError extends Error {
  constructor(
    message: string,
    public readonly kind: "invalid" | "not_found" | "upstream"
  ) {
    super(message);
    this.name = "CnpjError";
  }
}

export interface CnpjResumo {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacao: string;
  abertura: string;
  porte: string;
  cnae: string;
  municipio: string;
  uf: string;
  telefone: string;
  email: string;
}

interface Bruto {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  data_inicio_atividade: string;
  porte: string;
  codigo_porte: number | null;
  opcao_pelo_mei: boolean;
  descricao_situacao_cadastral: string;
  cnae_fiscal_descricao: string;
  logradouro: string;
  descricao_tipo_de_logradouro?: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  email?: string | null;
  ddd_telefone_1?: string | null;
}

const CONECTORES = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o"]);
const SIGLAS = new Set(["LTDA", "MEI", "EPP", "ME", "S/A", "SA", "EIRELI", "SS"]);

export function titleCasePt(s: string): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => {
      if (!w) return w;
      if (SIGLAS.has(w.toUpperCase())) return w.toUpperCase();
      if (i > 0 && CONECTORES.has(w)) return w;
      return w[0].toUpperCase() + w.slice(1);
    })
    .join(" ");
}

export const digitosCnpj = (s: string) => (s ?? "").replace(/\D/g, "");

export function formatarCnpj(d: string): string {
  const c = digitosCnpj(d).padStart(14, "0");
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export function cnpjValido(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (base: string, pesos: number[]) => {
    const soma = base.split("").reduce((acc, ch, i) => acc + Number(ch) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(d.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d.endsWith(`${d1}${d2}`);
}

function formatarTelefone(t: string | null | undefined): string {
  const d = (t ?? "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return "";
}

function formatarData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso ?? "";
}

function porteTexto(b: Bruto): string {
  if (b.opcao_pelo_mei) return "microempreendedor individual";
  switch (b.codigo_porte) {
    case 1:
      return "microempresa";
    case 3:
      return "empresa de pequeno porte";
    default:
      return "empresa";
  }
}

async function buscarBrasilApi(d: string): Promise<Bruto> {
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`, {
    headers: { Accept: "application/json", "User-Agent": "hf-redirect/0.1" },
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 404) throw new CnpjError("CNPJ não encontrado na Receita Federal.", "not_found");
  if (!res.ok) throw new CnpjError(`BrasilAPI respondeu ${res.status}.`, "upstream");
  return (await res.json()) as Bruto;
}

/** Fallback: publica.cnpj.ws (formato diferente, convertido para o da BrasilAPI). */
async function buscarCnpjWs(d: string): Promise<Bruto> {
  const res = await fetch(`https://publica.cnpj.ws/cnpj/${d}`, {
    headers: { Accept: "application/json", "User-Agent": "hf-redirect/0.1" },
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 404) throw new CnpjError("CNPJ não encontrado na Receita Federal.", "not_found");
  if (!res.ok) throw new CnpjError(`publica.cnpj.ws respondeu ${res.status}.`, "upstream");
  const j = (await res.json()) as {
    razao_social: string;
    porte?: { id?: string; descricao?: string };
    estabelecimento: {
      cnpj: string;
      nome_fantasia: string | null;
      data_inicio_atividade: string;
      situacao_cadastral: string;
      tipo_logradouro: string;
      logradouro: string;
      numero: string;
      complemento: string | null;
      bairro: string;
      cep: string;
      ddd1: string | null;
      telefone1: string | null;
      email: string | null;
      atividade_principal: { descricao: string };
      cidade: { nome: string };
      estado: { sigla: string };
    };
    simples?: { mei?: string };
  };
  const e = j.estabelecimento;
  return {
    cnpj: e.cnpj,
    razao_social: j.razao_social,
    nome_fantasia: e.nome_fantasia ?? "",
    data_inicio_atividade: e.data_inicio_atividade,
    porte: j.porte?.descricao ?? "",
    codigo_porte: j.porte?.id ? Number(j.porte.id) : null,
    opcao_pelo_mei: j.simples?.mei === "Sim",
    descricao_situacao_cadastral: e.situacao_cadastral,
    cnae_fiscal_descricao: e.atividade_principal?.descricao ?? "",
    logradouro: e.logradouro,
    descricao_tipo_de_logradouro: e.tipo_logradouro,
    numero: e.numero,
    complemento: e.complemento ?? "",
    bairro: e.bairro,
    municipio: e.cidade?.nome ?? "",
    uf: e.estado?.sigla ?? "",
    cep: e.cep,
    email: e.email,
    ddd_telefone_1: e.ddd1 && e.telefone1 ? `${e.ddd1}${e.telefone1}` : null,
  };
}

export async function consultarCnpj(entrada: string): Promise<{ pageConfig: PageConfig; resumo: CnpjResumo }> {
  const d = digitosCnpj(entrada);
  if (!cnpjValido(d)) throw new CnpjError("CNPJ inválido: confira os 14 dígitos.", "invalid");

  let b: Bruto;
  try {
    b = await buscarBrasilApi(d);
  } catch (e) {
    if (e instanceof CnpjError && e.kind === "not_found") throw e;
    b = await buscarCnpjWs(d);
  }

  const razao = titleCasePt(b.razao_social);
  const fantasia = titleCasePt(b.nome_fantasia ?? "");
  const nome = fantasia || razao;
  const municipio = titleCasePt(b.municipio ?? "");
  const uf = (b.uf ?? "").toUpperCase();
  const tipoLog = b.descricao_tipo_de_logradouro ? titleCasePt(b.descricao_tipo_de_logradouro) + " " : "";
  const logradouro = titleCasePt(b.logradouro ?? "");
  const enderecoPartes = [
    `${tipoLog}${logradouro}${b.numero ? `, ${b.numero}` : ""}${b.complemento ? ` - ${titleCasePt(b.complemento)}` : ""}`,
    titleCasePt(b.bairro ?? ""),
    `${municipio} - ${uf}`,
    b.cep ? `CEP ${b.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : "",
  ].filter((p) => p && p.trim() && p.trim() !== "-");
  const atividade = (b.cnae_fiscal_descricao ?? "").toLowerCase();
  const abertura = formatarData(b.data_inicio_atividade);

  const pageConfig: PageConfig = {
    companyName: nome,
    headline: PAGE_DEFAULTS.headline,
    subheadline: `Recebemos a confirmação do seu agendamento com a ${nome}. Nossa equipe entrará em contato pelo WhatsApp com os detalhes finais da reunião.`,
    steps: PAGE_DEFAULTS.steps,
    aboutTitle: `Sobre a ${nome}`,
    aboutText:
      `${razao}${fantasia && fantasia !== razao ? ` (${fantasia})` : ""} é uma ${porteTexto(b)} sediada em ${municipio}/${uf}` +
      `${abertura ? `, em atividade desde ${abertura}` : ""}${atividade ? `, com atuação em ${atividade}` : ""}.\n\n` +
      "Trabalhamos com agendamento prévio e comunicação clara em todas as etapas, respeitando o seu tempo. " +
      "Todo contato feito por este canal é referente a uma reunião solicitada ou confirmada por você.",
    phone: formatarTelefone(b.ddd_telefone_1),
    email: (b.email ?? "").toLowerCase(),
    address: enderecoPartes.join(", "),
    cnpj: formatarCnpj(d),
    footerNote: PAGE_DEFAULTS.footerNote,
  };

  const resumo: CnpjResumo = {
    cnpj: formatarCnpj(d),
    razaoSocial: razao,
    nomeFantasia: fantasia,
    situacao: titleCasePt(b.descricao_situacao_cadastral ?? ""),
    abertura,
    porte: porteTexto(b),
    cnae: b.cnae_fiscal_descricao ?? "",
    municipio,
    uf,
    telefone: pageConfig.phone ?? "",
    email: pageConfig.email ?? "",
  };

  return { pageConfig, resumo };
}
