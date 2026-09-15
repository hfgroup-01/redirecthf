import { NextResponse, type NextRequest } from "next/server";
import { authenticateRequest, type Actor } from "@/lib/auth";
import { translateDbError } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { isPanelHost } from "@/lib/hosts";

export { HttpError, badRequest, conflict, forbidden, notFound } from "@/lib/errors";

/** A API só responde no host do painel (localhost ou HF_ADMIN_HOST/setting). */
export async function foraDoPainel(req: NextRequest): Promise<boolean> {
  return !(await isPanelHost(req.headers.get("host")));
}

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

export async function readJson<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Corpo da requisição inválido (esperado JSON).");
  }
}

type Ctx<P> = { params: Promise<P> };
type Handler<P> = (req: NextRequest, actor: Actor, params: P) => Promise<NextResponse> | NextResponse;

/** Envolve rotas protegidas: host do painel, autentica, captura erros e responde JSON. */
export function protegido<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: NextRequest, ctx?: Ctx<P>): Promise<NextResponse> => {
    try {
      if (await foraDoPainel(req)) return jsonError("Não encontrado.", 404);
      const actor = await authenticateRequest(req);
      if (!actor) return jsonError("Não autenticado.", 401);
      const params = ctx ? await ctx.params : ({} as P);
      return await handler(req, actor, params);
    } catch (err) {
      return tratarErro(err);
    }
  };
}

/** Só administrador (sessão de admin ou chave de API). Cliente recebe 403. */
export function somenteAdmin<P = Record<string, never>>(handler: Handler<P>) {
  return protegido<P>(async (req, actor, params) => {
    if (actor.role !== "admin") return jsonError("Só o administrador pode fazer isso.", 403);
    return handler(req, actor, params);
  });
}

/** Só sessão de usuário (chave de API não serve: trocar senha, impersonar…). */
export function somenteSessao<P = Record<string, never>>(handler: Handler<P>) {
  return protegido<P>(async (req, actor, params) => {
    if (actor.kind !== "user") return jsonError("Essa ação exige login no painel (não a chave de API).", 403);
    return handler(req, actor, params);
  });
}

/** Rotas públicas (login/setup): sem auth, mesmo tratamento de erro. */
export function publico<P = Record<string, never>>(
  handler: (req: NextRequest, params: P) => Promise<NextResponse> | NextResponse
) {
  return async (req: NextRequest, ctx?: Ctx<P>): Promise<NextResponse> => {
    try {
      if (await foraDoPainel(req)) return jsonError("Não encontrado.", 404);
      const params = ctx ? await ctx.params : ({} as P);
      return await handler(req, params);
    } catch (err) {
      return tratarErro(err);
    }
  };
}

export function tratarErro(err: unknown): NextResponse {
  if (err instanceof HttpError) return jsonError(err.message, err.status);
  const msg = translateDbError(err);
  const bruto = err instanceof Error ? err.message : String(err);
  // Violação de unicidade/FK/CHECK é erro do pedido (409), não do servidor.
  if (/UNIQUE constraint failed|duplicate key|FOREIGN KEY constraint failed|violates foreign key|CHECK constraint failed|violates check constraint/i.test(bruto)) {
    return jsonError(msg, 409);
  }
  console.error("[hf] erro na rota:", err);
  return jsonError(msg, 500);
}

export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function bool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === 1 || v === "1" || v === "true") return true;
  if (v === 0 || v === "0" || v === "false") return false;
  return fallback;
}

export function validarUrl(url: string, campo = "URL"): string {
  const u = url.trim();
  if (!u) return "";
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    throw new HttpError(400, `${campo} inválida: "${u}".`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HttpError(400, `${campo} precisa começar com http:// ou https://.`);
  }
  // O parser codifica "{lead}" no caminho como %7Blead%7D; devolve o marcador legível.
  return parsed.toString().replace(/%7B/gi, "{").replace(/%7D/gi, "}");
}

export function validarHostname(h: string): string {
  const host = h
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(host)) {
    throw new HttpError(400, `Domínio inválido: "${h}". Use algo como go.suaempresa.com.br`);
  }
  return host;
}

/** Um rótulo de subdomínio (o "nomedabm" em nomedabm.lumix10.cfd). */
export function validarLabel(l: string): string {
  const label = l.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
    throw new HttpError(400, `Subdomínio inválido: "${l}". Use letras, números e hífen (ex.: minhaempresa).`);
  }
  return label;
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "0.0.0.0"
  );
}
