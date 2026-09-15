import crypto from "node:crypto";

/** Alfabeto sem caracteres ambíguos (0/O, 1/l/I): o código aparece em template. */
const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";

/** Caminhos que o servidor usa e que NUNCA podem virar código de link. */
export const CODIGOS_RESERVADOS = new Set([
  "admin",
  "api",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "privacidade",
  "opt-out",
  "sair",
  "termos",
  "hf",
  "__hf",
  "static",
  "assets",
  "public",
  "login",
  "logout",
  "health",
  "conta",
  "senha",
  "setup",
  "usuarios",
  "me",
]);

export function gerarCodigo(tamanho = 6): string {
  const bytes = crypto.randomBytes(tamanho);
  let out = "";
  for (let i = 0; i < tamanho; i++) out += ALFABETO[bytes[i] % ALFABETO.length];
  return out;
}

export const REGEX_CODIGO = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export function normalizarCodigo(entrada: string): string {
  return entrada.trim().toLowerCase();
}

export function validarCodigo(codigo: string): string | null {
  if (!REGEX_CODIGO.test(codigo)) {
    return "Código inválido: use 1 a 40 caracteres (a-z, 0-9, hífen no meio).";
  }
  if (CODIGOS_RESERVADOS.has(codigo)) return `"${codigo}" é um caminho reservado do sistema.`;
  return null;
}

export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
