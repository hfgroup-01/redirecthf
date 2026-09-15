import { diaExpr, escalar, rodar, todos, type Valor } from "@/lib/db";
import { escopado, type Scope } from "@/lib/scope";
import type { Click, Paginado } from "@/lib/types";

interface ClickRow {
  id: number;
  link_id: string;
  ts: string;
  host: string | null;
  country: string | null;
  ua: string | null;
  referer: string | null;
  query: string | null;
  lead?: string | null;
  outcome: string;
}

const rowToClick = (r: ClickRow): Click => ({
  id: Number(r.id),
  linkId: r.link_id,
  ts: r.ts,
  host: r.host,
  country: r.country,
  ua: r.ua,
  referer: r.referer,
  query: r.query,
  lead: r.lead ?? null,
  outcome: r.outcome,
});

/** Cliques de um link (a rota confere o escopo do link antes). */
export async function listClicks(linkId: string, page = 1, pageSize = 50): Promise<Paginado<Click>> {
  const total = await escalar("SELECT COUNT(*) FROM clicks WHERE link_id = ?", linkId);
  const items = (
    await todos<ClickRow>("SELECT * FROM clicks WHERE link_id = ? ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?", linkId, pageSize, (page - 1) * pageSize)
  ).map(rowToClick);
  return { items, total, page, pageSize };
}

const isoDiasAtras = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();
const inicioDeHoje = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export interface SerieDia {
  dia: string; // YYYY-MM-DD
  cliques: number;
}

/** Cliques por dia nos últimos N dias (para o link, o cliente ou geral). */
export async function serieDiaria(dias = 14, linkId?: string, clientId?: string): Promise<SerieDia[]> {
  const desde = isoDiasAtras(dias);
  const where = ["k.ts >= ?"];
  const vals: Valor[] = [desde];
  if (linkId) {
    where.push("k.link_id = ?");
    vals.push(linkId);
  }
  if (clientId) {
    where.push("k.link_id IN (SELECT id FROM links WHERE client_id = ?)");
    vals.push(clientId);
  }
  const dia = diaExpr("k.ts");
  const rows = await todos<{ dia: string; n: number }>(
    `SELECT ${dia} AS dia, COUNT(*) AS n FROM clicks k WHERE ${where.join(" AND ")} GROUP BY ${dia} ORDER BY dia ASC`,
    ...vals
  );
  const mapa = new Map(rows.map((r) => [r.dia, Number(r.n)]));
  const out: SerieDia[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    out.push({ dia: d, cliques: mapa.get(d) ?? 0 });
  }
  return out;
}

export interface Overview {
  clicksToday: number;
  clicks7d: number;
  clicks30d: number;
  clicksTotal: number;
  linksTotal: number;
  linksActive: number;
  clientsTotal: number;
  domainsTotal: number;
  domainsActive: number;
  topLinks: { id: string; code: string; label: string | null; clientName: string | null; domainHostname: string | null; cliques: number }[];
  recentClicks: (Click & { code: string; clientName: string | null })[];
  serie: SerieDia[];
}

export async function overview(scope: Scope): Promise<Overview> {
  const cid = escopado(scope) ? scope.clientId : null;
  const extraL = cid ? "AND l.client_id = ?" : "";
  const extraK = cid ? "AND link_id IN (SELECT id FROM links WHERE client_id = ?)" : "";
  const vcid: Valor[] = cid ? [cid] : [];

  // Tudo em paralelo: com Supabase cada ida ao banco custa ~100ms; em série o dashboard passava de 1s.
  const [topRows, recentRows, clicksToday, clicks7d, clicks30d, clicksTotal, linksTotal, linksActive, clientsTotal, domainsTotal, domainsActive, serie] =
    await Promise.all([
      todos<{ id: string; code: string; label: string | null; client_name: string | null; domain_hostname: string | null; n: number }>(
        `SELECT l.id, l.code, l.label, c.name AS client_name, d.hostname AS domain_hostname, COUNT(k.id) AS n
         FROM clicks k JOIN links l ON l.id = k.link_id
         LEFT JOIN clients c ON c.id = l.client_id
         LEFT JOIN domains d ON d.id = l.domain_id
         WHERE k.ts >= ? ${extraL} GROUP BY l.id, l.code, l.label, c.name, d.hostname ORDER BY n DESC LIMIT 8`,
        isoDiasAtras(7),
        ...vcid
      ),
      todos<ClickRow & { code: string; client_name: string | null }>(
        `SELECT k.*, l.code, c.name AS client_name
         FROM clicks k JOIN links l ON l.id = k.link_id LEFT JOIN clients c ON c.id = l.client_id
         WHERE 1 = 1 ${extraL}
         ORDER BY k.ts DESC, k.id DESC LIMIT 15`,
        ...vcid
      ),
      escalar(`SELECT COUNT(*) FROM clicks WHERE ts >= ? ${extraK}`, inicioDeHoje(), ...vcid),
      escalar(`SELECT COUNT(*) FROM clicks WHERE ts >= ? ${extraK}`, isoDiasAtras(7), ...vcid),
      escalar(`SELECT COUNT(*) FROM clicks WHERE ts >= ? ${extraK}`, isoDiasAtras(30), ...vcid),
      escalar(`SELECT COALESCE(SUM(clicks_count), 0) FROM links WHERE 1 = 1 ${cid ? "AND client_id = ?" : ""}`, ...vcid),
      escalar(`SELECT COUNT(*) FROM links WHERE 1 = 1 ${cid ? "AND client_id = ?" : ""}`, ...vcid),
      escalar(`SELECT COUNT(*) FROM links WHERE active = ? ${cid ? "AND client_id = ?" : ""}`, true, ...vcid),
      cid ? Promise.resolve(1) : escalar("SELECT COUNT(*) FROM clients"),
      escalar(`SELECT COUNT(*) FROM domains WHERE 1 = 1 ${cid ? "AND client_id = ?" : ""}`, ...vcid),
      escalar(`SELECT COUNT(*) FROM domains WHERE status = 'active' AND active = ? ${cid ? "AND client_id = ?" : ""}`, true, ...vcid),
      serieDiaria(14, undefined, cid ?? undefined),
    ]);

  return {
    clicksToday,
    clicks7d,
    clicks30d,
    clicksTotal,
    linksTotal,
    linksActive,
    clientsTotal,
    domainsTotal,
    domainsActive,
    topLinks: topRows.map((r) => ({ id: r.id, code: r.code, label: r.label, clientName: r.client_name, domainHostname: r.domain_hostname, cliques: Number(r.n) })),
    recentClicks: recentRows.map((r) => ({ ...rowToClick(r), code: r.code, clientName: r.client_name })),
    serie,
  };
}

/** Apaga cliques mais antigos que N dias (os contadores dos links ficam). */
export async function pruneClicks(dias: number): Promise<number> {
  return (await rodar("DELETE FROM clicks WHERE ts < ?", isoDiasAtras(dias))).changes;
}
