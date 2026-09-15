import { agora, escalar, rodar, todos, type Valor } from "@/lib/db";
import { escopado, type Scope } from "@/lib/scope";
import type { OptOut, Paginado } from "@/lib/types";

interface Row {
  id: number;
  ts: string;
  host: string | null;
  code: string | null;
  lead: string | null;
  contact: string | null;
  ua: string | null;
}

const rowToOptOut = (r: Row): OptOut => ({
  id: Number(r.id),
  ts: r.ts,
  host: r.host,
  code: r.code,
  lead: r.lead,
  contact: r.contact,
  ua: r.ua,
});

export async function insertOptOut(o: {
  host: string | null;
  code: string | null;
  lead: string | null;
  contact: string | null;
  ua: string | null;
  ipHash: string | null;
}): Promise<void> {
  await rodar(
    "INSERT INTO optouts (ts, host, code, lead, contact, ua, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
    agora(),
    o.host,
    o.code,
    o.lead,
    o.contact,
    o.ua,
    o.ipHash
  );
}

/** Opt-outs pertencem ao dono do host onde foram feitos. */
function filtro(scope: Scope): { w: string; vals: Valor[] } {
  if (!escopado(scope)) return { w: "", vals: [] };
  return { w: "WHERE host IN (SELECT hostname FROM domains WHERE client_id = ?)", vals: [scope.clientId] };
}

export async function listOptOuts(scope: Scope, page = 1, pageSize = 50): Promise<Paginado<OptOut>> {
  const { w, vals } = filtro(scope);
  const total = await escalar(`SELECT COUNT(*) FROM optouts ${w}`, ...vals);
  const items = (
    await todos<Row>(`SELECT * FROM optouts ${w} ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?`, ...vals, pageSize, (page - 1) * pageSize)
  ).map(rowToOptOut);
  return { items, total, page, pageSize };
}

export async function allOptOuts(scope: Scope, limit = 20_000): Promise<OptOut[]> {
  const { w, vals } = filtro(scope);
  return (await todos<Row>(`SELECT * FROM optouts ${w} ORDER BY ts DESC, id DESC LIMIT ?`, ...vals, limit)).map(rowToOptOut);
}

/** Devolve false quando o registro não existe ou não é do escopo. */
export async function deleteOptOut(id: number, scope: Scope): Promise<boolean> {
  if (!escopado(scope)) return (await rodar("DELETE FROM optouts WHERE id = ?", id)).changes > 0;
  return (
    (await rodar("DELETE FROM optouts WHERE id = ? AND host IN (SELECT hostname FROM domains WHERE client_id = ?)", id, scope.clientId)).changes > 0
  );
}
