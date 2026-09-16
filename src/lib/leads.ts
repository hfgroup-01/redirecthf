/**
 * Identificador do lead na URL: `https://host/<codigo>.<lead>` ou `?l=<lead>`.
 * Telefones/CPFs viram só dígitos (para "+55 (11) 99999-0000", "5511999990000"
 * e "123.456.789-09" baterem); ids alfanuméricos ficam como vieram (com
 * maiúsculas: "Greqq304FUfc" é diferente de "greqq304fufc" no site do cliente).
 */

export function normalizarLead(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const digitos = s.replace(/[\s()+\-.]/g, "");
  if (/^\d{6,20}$/.test(digitos)) return digitos;
  return s.slice(0, 120);
}

/** "abc123.jn0V72C34UZt" -> { code: "abc123", lead: "jn0V72C34UZt" }; sem ponto -> lead null. */
export function separarCodigoELead(segmento: string): { code: string; lead: string | null } {
  const i = segmento.indexOf(".");
  if (i <= 0) return { code: segmento, lead: null };
  let lead = segmento.slice(i + 1);
  try {
    lead = decodeURIComponent(lead);
  } catch {
    /* mantém como veio */
  }
  return { code: segmento.slice(0, i), lead: lead ? normalizarLead(lead) : null };
}

/** Valor da variável {{1}} do template para um lead. */
export function variavelTemplate(code: string, lead: string): string {
  return `${code}.${lead}`;
}

/**
 * Id opaco do lead, gerado pelo HF ao importar a planilha: nada de telefone na
 * URL. Alfabeto sem caracteres ambíguos; 12 caracteres = colisão desprezível
 * (31^12 ≈ 8e17) e ainda curto o bastante para caber no botão do template.
 */
const ALFABETO_ID = "abcdefghjkmnpqrstuvwxyz23456789";

export function gerarLeadId(tamanho = 12): string {
  const bytes = new Uint8Array(tamanho);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < tamanho; i++) out += ALFABETO_ID[bytes[i] % ALFABETO_ID.length];
  return out;
}

/** Regex nova a cada uso: `g` guarda estado (lastIndex) e vazaria entre chamadas. */
const marcador = () => /\{\{?lead\}?\}|%7B%7B?lead%7D?%7D/gi;

/** A URL de destino tem o marcador {lead}? */
export function temMarcadorLead(url: string | null | undefined): boolean {
  return Boolean(url) && marcador().test(url as string);
}

/**
 * Encaixa o lead na URL de destino: "https://site.com/order/{lead}" +
 * "jn0V72C34UZt" -> "https://site.com/order/jn0V72C34UZt". Sem lead, o marcador
 * some (o site do cliente mostra "pedido não localizado", que é o esperado).
 */
export function aplicarLead(url: string, lead: string | null): string {
  return url.replace(marcador(), lead ? encodeURIComponent(lead) : "");
}
