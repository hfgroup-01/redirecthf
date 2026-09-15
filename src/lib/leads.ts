/**
 * Identificador do lead na URL: `https://host/<codigo>.<lead>` ou `?l=<lead>`.
 * Telefones viram só dígitos (para "+55 (11) 99999-0000" e "5511999990000"
 * baterem); qualquer outro texto fica em minúsculas e sem espaços nas pontas.
 */

export function normalizarLead(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const digitos = s.replace(/[\s()+\-.]/g, "");
  if (/^\d{6,20}$/.test(digitos)) return digitos;
  return s.toLowerCase().slice(0, 120);
}

/** "abc123.5511999" -> { code: "abc123", lead: "5511999" }; sem ponto -> lead null. */
export function separarCodigoELead(segmento: string): { code: string; lead: string | null } {
  const i = segmento.indexOf(".");
  if (i <= 0) return { code: segmento, lead: null };
  const lead = segmento.slice(i + 1);
  return { code: segmento.slice(0, i), lead: lead ? normalizarLead(decodeURIComponent(lead)) : null };
}

/** Valor da variável {{1}} do template para um lead. */
export function variavelTemplate(code: string, lead: string): string {
  return `${code}.${lead}`;
}
