import { agora, escalar, likeOp, rodar, todos, transacao, um, type Executor, type Valor } from "@/lib/db";
import type { Actor } from "@/lib/auth";
import { newId } from "@/lib/crypto";
import { gerarCodigo, normalizarCodigo, validarCodigo } from "@/lib/codes";
import { badRequest, notFound } from "@/lib/errors";
import { invalidateLinkCache } from "@/lib/resolve";
import { ADMIN_SCOPE, escopado, type Scope } from "@/lib/scope";
import type { Link, LinkEvent, LinkMode, Paginado } from "@/lib/types";

interface LinkRow {
  id: string;
  code: string;
  client_id: string | null;
  domain_id: string | null;
  label: string | null;
  destination_url: string | null;
  mode: LinkMode;
  append_query: number | boolean;
  page_title: string | null;
  page_body: string | null;
  active: number | boolean;
  clicks_count: number;
  last_click_at: string | null;
  created_at: string;
  updated_at: string;
  client_name: string | null;
  client_slug: string | null;
  domain_hostname: string | null;
}

function rowToLink(r: LinkRow): Link {
  const host = r.domain_hostname;
  return {
    id: r.id,
    code: r.code,
    clientId: r.client_id,
    domainId: r.domain_id,
    label: r.label,
    destinationUrl: r.destination_url,
    mode: r.mode,
    appendQuery: Boolean(r.append_query),
    pageTitle: r.page_title,
    pageBody: r.page_body,
    active: Boolean(r.active),
    clicksCount: Number(r.clicks_count ?? 0),
    lastClickAt: r.last_click_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    clientName: r.client_name,
    clientSlug: r.client_slug,
    domainHostname: host,
    url: host ? `https://${host}/${r.code}` : null,
  };
}

const SELECT = `
  SELECT l.*,
    c.name AS client_name,
    c.slug AS client_slug,
    d.hostname AS domain_hostname
  FROM links l
  LEFT JOIN clients c ON c.id = l.client_id
  LEFT JOIN domains d ON d.id = l.domain_id`;

export interface ListLinksFilter {
  clientId?: string;
  domainId?: string;
  q?: string;
  active?: boolean;
  mode?: LinkMode;
  page?: number;
  pageSize?: number;
}

export async function listLinks(f: ListLinksFilter, scope: Scope): Promise<Paginado<Link>> {
  const where: string[] = [];
  const vals: Valor[] = [];
  const clientId = escopado(scope) ? scope.clientId : f.clientId;
  if (clientId) {
    where.push("l.client_id = ?");
    vals.push(clientId);
  }
  if (f.domainId) {
    where.push("l.domain_id = ?");
    vals.push(f.domainId);
  }
  if (f.active !== undefined) {
    where.push("l.active = ?");
    vals.push(f.active);
  }
  if (f.mode) {
    where.push("l.mode = ?");
    vals.push(f.mode);
  }
  if (f.q?.trim()) {
    const L = likeOp();
    where.push(`(l.code ${L} ? OR l.label ${L} ? OR l.destination_url ${L} ? OR c.name ${L} ? OR d.hostname ${L} ?)`);
    const like = `%${f.q.trim()}%`;
    vals.push(like, like, like, like, like);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 50));
  const total = await escalar(
    `SELECT COUNT(*) FROM links l LEFT JOIN clients c ON c.id = l.client_id LEFT JOIN domains d ON d.id = l.domain_id ${w}`,
    ...vals
  );
  const items = (
    await todos<LinkRow>(`${SELECT} ${w} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`, ...vals, pageSize, (page - 1) * pageSize)
  ).map(rowToLink);
  return { items, total, page, pageSize };
}

export async function getLink(id: string, scope: Scope): Promise<Link | null> {
  const r = escopado(scope)
    ? await um<LinkRow>(`${SELECT} WHERE l.id = ? AND l.client_id = ?`, id, scope.clientId)
    : await um<LinkRow>(`${SELECT} WHERE l.id = ?`, id);
  return r ? rowToLink(r) : null;
}

/** Acha por código. Como o código é único só por domínio, pede host/domínio quando há mais de um. */
export async function findLinkByCode(
  code: string,
  scope: Scope,
  opts: { domainId?: string | null; host?: string | null } = {}
): Promise<Link | null> {
  const where = ["l.code = ?"];
  const vals: Valor[] = [normalizarCodigo(code)];
  if (opts.domainId) {
    where.push("l.domain_id = ?");
    vals.push(opts.domainId);
  }
  if (opts.host) {
    where.push("d.hostname = ?");
    vals.push(opts.host.trim().toLowerCase());
  }
  if (escopado(scope)) {
    where.push("l.client_id = ?");
    vals.push(scope.clientId);
  }
  const rows = await todos<LinkRow>(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY l.created_at DESC LIMIT 2`, ...vals);
  if (rows.length > 1) {
    throw badRequest(`O código "${code}" existe em mais de um domínio: informe ?host=<dominio> ou ?domainId=.`);
  }
  return rows[0] ? rowToLink(rows[0]) : null;
}

export interface LinkInput {
  clientId?: string | null;
  domainId?: string | null;
  code?: string;
  label?: string | null;
  destinationUrl?: string | null;
  mode?: LinkMode;
  appendQuery?: boolean;
  pageTitle?: string | null;
  pageBody?: string | null;
  active?: boolean;
}

async function codigoLivre(domainId: string): Promise<string> {
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    const c = gerarCodigo(tentativa < 5 ? 6 : 8);
    if (!(await um("SELECT 1 FROM links WHERE domain_id = ? AND code = ?", domainId, c))) return c;
  }
  throw new Error("Não consegui gerar um código livre. Tente de novo.");
}

/** Domínio precisa existir e ter o mesmo dono do link (ou ambos sem dono). */
async function conferirDominio(domainId: string, clientId: string | null): Promise<void> {
  const d = await um<{ id: string; client_id: string | null }>("SELECT id, client_id FROM domains WHERE id = ?", domainId);
  if (!d) throw badRequest("Domínio não encontrado.");
  if ((d.client_id ?? null) !== (clientId ?? null)) {
    throw badRequest(
      clientId
        ? "Esse domínio não pertence a esse cliente. Atribua o domínio ao cliente primeiro."
        : "Esse domínio pertence a um cliente: escolha esse cliente como dono do link."
    );
  }
}

export async function createLink(input: LinkInput, actor: Actor): Promise<Link> {
  const domainId = input.domainId || null;
  if (!domainId) throw badRequest("Informe o domínio do link.");
  const clientId = input.clientId || null;
  await conferirDominio(domainId, clientId);
  let code: string;
  if (input.code?.trim()) {
    code = normalizarCodigo(input.code);
    const erro = validarCodigo(code);
    if (erro) throw badRequest(erro);
  } else {
    code = await codigoLivre(domainId);
  }
  const mode: LinkMode = input.mode === "page" ? "page" : "redirect";
  if (mode === "redirect" && !input.destinationUrl?.trim()) {
    throw badRequest("Informe a URL de destino (ou use o modo página).");
  }
  const id = newId("lnk");
  const ts = agora();
  await transacao(async (tx) => {
    await tx.rodar(
      `INSERT INTO links (id, code, client_id, domain_id, label, destination_url, mode, append_query, page_title, page_body, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      code,
      clientId,
      domainId,
      input.label?.trim() || null,
      input.destinationUrl?.trim() || null,
      mode,
      input.appendQuery !== false,
      input.pageTitle?.trim() || null,
      input.pageBody?.trim() || null,
      input.active !== false,
      ts,
      ts
    );
    await registrarEvento(tx, id, actor, "created", { code, mode, destinationUrl: input.destinationUrl ?? null });
  });
  invalidateLinkCache(domainId, code);
  return (await getLink(id, ADMIN_SCOPE))!;
}

export async function updateLink(id: string, patch: LinkInput, actor: Actor, scope: Scope): Promise<Link> {
  const antes = await getLink(id, scope);
  if (!antes) throw notFound("Link não encontrado.");

  const sets: string[] = [];
  const vals: Valor[] = [];
  const add = (col: string, v: Valor) => {
    sets.push(`${col} = ?`);
    vals.push(v);
  };
  const diff: Record<string, { de: unknown; para: unknown }> = {};

  let codeFinal = antes.code;
  if (patch.code !== undefined && normalizarCodigo(patch.code) !== antes.code) {
    const code = normalizarCodigo(patch.code);
    const erro = validarCodigo(code);
    if (erro) throw badRequest(erro);
    add("code", code);
    diff.code = { de: antes.code, para: code };
    codeFinal = code;
  }
  // Cliente só muda por decisão do admin; no escopo de cliente o dono é fixo.
  const clientFinal = escopado(scope) ? antes.clientId : patch.clientId !== undefined ? patch.clientId || null : antes.clientId;
  const domainFinal = patch.domainId !== undefined ? patch.domainId || null : antes.domainId;
  if (!domainFinal) throw badRequest("Informe o domínio do link.");
  if (domainFinal !== antes.domainId || clientFinal !== antes.clientId) await conferirDominio(domainFinal, clientFinal);
  if (clientFinal !== antes.clientId) {
    add("client_id", clientFinal);
    diff.clientId = { de: antes.clientId, para: clientFinal };
  }
  if (domainFinal !== antes.domainId) {
    add("domain_id", domainFinal);
    diff.domainId = { de: antes.domainId, para: domainFinal };
  }
  if (patch.label !== undefined) add("label", patch.label?.trim() || null);
  if (patch.destinationUrl !== undefined && (patch.destinationUrl?.trim() || null) !== antes.destinationUrl) {
    add("destination_url", patch.destinationUrl?.trim() || null);
    diff.destinationUrl = { de: antes.destinationUrl, para: patch.destinationUrl?.trim() || null };
  }
  if (patch.mode !== undefined && patch.mode !== antes.mode) {
    add("mode", patch.mode === "page" ? "page" : "redirect");
    diff.mode = { de: antes.mode, para: patch.mode };
  }
  if (patch.appendQuery !== undefined) add("append_query", patch.appendQuery);
  if (patch.pageTitle !== undefined) add("page_title", patch.pageTitle?.trim() || null);
  if (patch.pageBody !== undefined) add("page_body", patch.pageBody?.trim() || null);
  if (patch.active !== undefined && patch.active !== antes.active) {
    add("active", patch.active);
    diff.active = { de: antes.active, para: patch.active };
  }

  const modeFinal = (diff.mode?.para as LinkMode | undefined) ?? antes.mode;
  const destFinal = diff.destinationUrl ? (diff.destinationUrl.para as string | null) : antes.destinationUrl;
  if (modeFinal === "redirect" && !destFinal) {
    throw badRequest("Um link em modo redirect precisa de URL de destino.");
  }

  add("updated_at", agora());
  vals.push(id);
  await transacao(async (tx) => {
    await tx.rodar(`UPDATE links SET ${sets.join(", ")} WHERE id = ?`, ...vals);
    if (Object.keys(diff).length) await registrarEvento(tx, id, actor, "updated", diff);
  });
  invalidateLinkCache(antes.domainId, antes.code);
  invalidateLinkCache(domainFinal, codeFinal);
  return (await getLink(id, ADMIN_SCOPE))!;
}

export async function deleteLink(id: string, scope: Scope): Promise<boolean> {
  const l = await getLink(id, scope);
  if (!l) return false;
  await rodar("DELETE FROM links WHERE id = ?", id);
  invalidateLinkCache(l.domainId, l.code);
  return true;
}

export interface BulkPatch {
  destinationUrl?: string;
  mode?: LinkMode;
  active?: boolean;
  domainId?: string | null;
}

/** Atualiza vários links (por ids ou por cliente), só os do escopo. Retorna quantos mudaram. */
export async function bulkUpdateLinks(
  alvo: { ids?: string[]; clientId?: string },
  patch: BulkPatch,
  actor: Actor,
  scope: Scope
): Promise<number> {
  if (escopado(scope) && alvo.clientId && alvo.clientId !== scope.clientId) throw notFound("Cliente não encontrado.");
  let ids: string[] = [];
  if (alvo.ids?.length) {
    ids = alvo.ids;
  } else if (alvo.clientId) {
    ids = (await todos<{ id: string }>("SELECT id FROM links WHERE client_id = ?", alvo.clientId)).map((r) => r.id);
  }
  let n = 0;
  for (const id of ids) {
    if (!(await getLink(id, scope))) continue;
    await updateLink(id, patch, actor, scope);
    n++;
  }
  return n;
}

export async function registrarEvento(tx: Executor, linkId: string, actor: Actor, action: string, detail: unknown): Promise<void> {
  await tx.rodar(
    "INSERT INTO link_events (link_id, ts, actor, user_id, action, detail) VALUES (?, ?, ?, ?, ?, ?)",
    linkId,
    agora(),
    actor.label,
    actor.userId,
    action,
    detail === undefined ? null : JSON.stringify(detail)
  );
}

export async function listEvents(linkId: string, limit = 50): Promise<LinkEvent[]> {
  return (
    await todos<{ id: number; link_id: string; ts: string; actor: string; user_id: string | null; action: string; detail: string | null }>(
      "SELECT * FROM link_events WHERE link_id = ? ORDER BY ts DESC, id DESC LIMIT ?",
      linkId,
      limit
    )
  ).map((r) => ({ id: Number(r.id), linkId: r.link_id, ts: r.ts, actor: r.actor, userId: r.user_id ?? null, action: r.action, detail: r.detail }));
}
