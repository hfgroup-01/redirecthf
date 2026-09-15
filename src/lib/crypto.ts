/**
 * Segredo da instância + criptografia dos tokens da Cloudflare + assinatura
 * de sessão. O segredo vem de HF_SECRET ou é gerado e gravado em
 * HF_DATA_DIR/.secret (perder o arquivo = tokens salvos ficam ilegíveis).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { HF_SECRET_PATH } from "@/lib/paths";

const g = globalThis as unknown as { __hfSecret?: string; __hfKey?: Buffer };

export function getSecret(): string {
  if (g.__hfSecret) return g.__hfSecret;
  const env = process.env.HF_SECRET?.trim();
  if (env && env.length >= 16) {
    g.__hfSecret = env;
    return env;
  }
  fs.mkdirSync(path.dirname(HF_SECRET_PATH), { recursive: true });
  if (fs.existsSync(HF_SECRET_PATH)) {
    const lido = fs.readFileSync(HF_SECRET_PATH, "utf-8").trim();
    if (lido.length >= 16) {
      g.__hfSecret = lido;
      return lido;
    }
  }
  const novo = crypto.randomBytes(32).toString("base64url");
  fs.writeFileSync(HF_SECRET_PATH, novo, { encoding: "utf-8", mode: 0o600 });
  g.__hfSecret = novo;
  return novo;
}

function getKey(): Buffer {
  if (g.__hfKey) return g.__hfKey;
  g.__hfKey = crypto.scryptSync(getSecret(), "hf-redirect-v1", 32);
  return g.__hfKey;
}

/** AES-256-GCM: "v1.<iv>.<tag>.<cipher>" em base64url. */
export function encrypt(texto: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(texto, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

export function decrypt(blob: string | null | undefined): string {
  if (!blob) return "";
  const [v, ivB, tagB, encB] = blob.split(".");
  if (v !== "v1" || !ivB || !tagB || !encB) throw new Error("Token criptografado em formato inválido.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encB, "base64url")), decipher.final()]).toString("utf-8");
}

export function hmac(data: string): string {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function hashPassword(senha: string): string {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(senha, salt, 64).toString("base64url");
  return `scrypt.${salt}.${hash}`;
}

export function verifyPassword(senha: string, stored: string): boolean {
  const [alg, salt, hash] = stored.split(".");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const calc = crypto.scryptSync(senha, salt, 64).toString("base64url");
  return safeEqual(calc, hash);
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256short(texto: string): string {
  return crypto.createHash("sha256").update(texto).digest("hex").slice(0, 24);
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url").replace(/[-_]/g, "x")}`;
}

/** Senha temporária legível (sem 0/O/1/l/I): o admin mostra uma vez ao cliente. */
export function randomPassword(tamanho = 12): string {
  const alf = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(tamanho);
  let out = "";
  for (let i = 0; i < tamanho; i++) out += alf[bytes[i] % alf.length];
  return out;
}
