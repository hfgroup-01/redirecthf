/**
 * Destinos por lead: para um link (código) cada lead pode ter a própria URL.
 * Importação em lotes (CSV/API), upsert por (link_id, lead_key).
 */
import { agora, escalar, likeOp, rodar, todos, transacao, um, type Valor } from "@/lib/db";
import { normalizarLead } from "@/lib/leads";
import { invalidateLinkCache } from "@/lib/resolve";
import type { LeadTarget, Paginado } from "@/lib/types";

interface Row {
  id: number;
  link_id: string;
  lead_key: string;
  destination_url: string;
  clicks_count: number;
  last_click_at: string | null;
  created_at: string;
  updated_at: string;
}

const rowToTarget = (r: Row): LeadTarget => ({
  id: Number(r.id),
  linkId: r.link_id,
  lead: r.lead_key,
  destinationUrl: r.destination_url,
  clicksCount: Number(r.clicks_count ?? 0),
  lastClickAt: r.last_click_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Hot path: URL do lead neste link (null = usa o destino padrão do link). */
export async function getTargetUrl(linkId: string, lead: string): Promise<string | null> {
  const r = await um<{ destination_url: string }>("SELECT destination_url FROM lead_targets WHERE link_id = ? AND lead_key = ?", linkId, lead);
  return r?.destination_url ?? null;
}

export async function countTargets(linkId: string): Promise<number> {
  return escalar("SELECT COUNT(*) FROM lead_targets WHERE link_id = ?", linkId);
}

export async function listTargets(linkId: string, page = 1, pageSize = 50, q?: string): Promise<Paginado<LeadTarget>> {
  const where = ["link_id = ?"];
  const vals: Valor[] = [linkId];
  if (q?.trim()) {
    const L = likeOp();
    where.push(`(lead_key ${L} ? OR destination_url ${L} ?)`);
    const like = `%${q.trim()}%`;
    vals.push(like, like);
  }
  const w = `WHERE ${where.join(" AND ")}`;
  const total = await escalar(`SELECT COUNT(*) FROM lead_targets ${w}`, ...vals);
  const items = (await todos<Row>(`SELECT * FROM lead_targets ${w} ORDER BY id ASC LIMIT ? OFFSET ?`, ...vals, pageSize, (page - 1) * pageSize)).map(rowToTarget);
  return { items, total, page, pageSize };
}

/** Todos os destinos de um link (export). 200k linhas ~ 30 MB de CSV, ainda aceitável. */
export async function allTargets(linkId: string, limit = 250_000): Promise<LeadTarget[]> {
  return (await todos<Row>("SELECT * FROM lead_targets WHERE link_id = ? ORDER BY id ASC LIMIT ?", linkId, limit)).map(rowToTarget);
}

export interface TargetInput {
  lead: string;
  url: string;
}

export interface UpsertResumo {
  recebidos: number;
  gravados: number;
  semLead: number;
  urlInvalida: number;
  duplicadosNoArquivo: number;
  exemplosErro: string[];
}

function urlValida(u: string): string | null {
  const s = u.trim();
  if (!s) return null;
  try {
    const p = new URL(s);
    if (p.protocol !== "http:" && p.protocol !== "https:") return null;
    return p.toString();
  } catch {
    return null;
  }
}

/**
 * Upsert em lotes de 1000 (cada lote = 1 ida ao banco; 100 mil leads = 100 idas).
 * Repetir o mesmo lead no arquivo mantém a última URL. Devolve o resumo.
 */
export async function upsertTargets(linkId: string, entradas: TargetInput[]): Promise<UpsertResumo> {
  const resumo: UpsertResumo = { recebidos: entradas.length, gravados: 0, semLead: 0, urlInvalida: 0, duplicadosNoArquivo: 0, exemplosErro: [] };
  const mapa = new Map<string, string>();
  for (const e of entradas) {
    const lead = normalizarLead(e.lead);
    if (!lead) {
      resumo.semLead++;
      continue;
    }
    const url = urlValida(e.url ?? "");
    if (!url) {
      resumo.urlInvalida++;
      if (resumo.exemplosErro.length < 5) resumo.exemplosErro.push(`${lead}: URL inválida "${String(e.url ?? "").slice(0, 60)}"`);
      continue;
    }
    if (mapa.has(lead)) resumo.duplicadosNoArquivo++;
    mapa.set(lead, url);
  }
  const linhas = [...mapa.entries()];
  const ts = agora();
  const LOTE = 1000;
  for (let i = 0; i < linhas.length; i += LOTE) {
    const parte = linhas.slice(i, i + LOTE);
    const vals: Valor[] = [];
    const grupos = parte.map(([lead, url]) => {
      vals.push(linkId, lead, url, ts, ts);
      return "(?, ?, ?, ?, ?)";
    });
    await transacao(async (tx) => {
      await tx.rodar(
        `INSERT INTO lead_targets (link_id, lead_key, destination_url, created_at, updated_at) VALUES ${grupos.join(", ")}
         ON CONFLICT (link_id, lead_key) DO UPDATE SET destination_url = excluded.destination_url, updated_at = excluded.updated_at`,
        ...vals
      );
    });
    resumo.gravados += parte.length;
  }
  invalidateLinkCache();
  return resumo;
}

/** Apaga todos os destinos do link (ou só o de um lead). Devolve quantos saíram. */
export async function deleteTargets(linkId: string, lead?: string): Promise<number> {
  const r = lead
    ? await rodar("DELETE FROM lead_targets WHERE link_id = ? AND lead_key = ?", linkId, normalizarLead(lead))
    : await rodar("DELETE FROM lead_targets WHERE link_id = ?", linkId);
  invalidateLinkCache();
  return r.changes;
}
