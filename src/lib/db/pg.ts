/**
 * Driver Postgres (Supabase) — usado quando DATABASE_URL está definido.
 *
 * Mesma API do driver SQLite (todos/um/rodar/escalar/transacao), mas:
 *  - placeholders "?" viram $1..$n automaticamente;
 *  - timestamptz volta como string ISO e bigint como number (o resto do app
 *    já trabalha assim);
 *  - jsonb volta como objeto.
 */
import { Pool, types, type PoolClient } from "pg";
import type { Executor, Valor } from "@/lib/db/index";

// 1184 timestamptz, 1114 timestamp -> ISO string; 20 int8, 1700 numeric -> number
types.setTypeParser(1184, (v) => new Date(v).toISOString());
types.setTypeParser(1114, (v) => new Date(v + "Z").toISOString());
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => Number(v));

const g = globalThis as unknown as { __hfPool?: Pool };

export function getPool(): Pool {
  if (g.__hfPool) return g.__hfPool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL não definido.");
  const local = /localhost|127\.0\.0\.1/.test(url);
  g.__hfPool = new Pool({
    connectionString: url,
    ssl: local ? undefined : { rejectUnauthorized: false },
    max: Number(process.env.HF_PG_POOL ?? 6),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });
  g.__hfPool.on("error", (err) => console.error("[hf] pool pg:", err.message));
  return g.__hfPool;
}

/** "?" -> $1, $2… (nenhum SQL do HF usa "?" dentro de literal). */
export function placeholders(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

function executorSobre(q: Queryable): Executor {
  return {
    async todos<T>(sql: string, ...params: Valor[]) {
      const r = await q.query(placeholders(sql), params);
      return r.rows as T[];
    },
    async um<T>(sql: string, ...params: Valor[]) {
      const r = await q.query(placeholders(sql), params);
      return (r.rows[0] as T | undefined) ?? null;
    },
    async rodar(sql: string, ...params: Valor[]) {
      const r = await q.query(placeholders(sql), params);
      return { changes: Number(r.rowCount ?? 0) };
    },
    async escalar(sql: string, ...params: Valor[]) {
      const r = await q.query(placeholders(sql), params);
      const linha = r.rows[0];
      if (!linha) return 0;
      return Number(Object.values(linha)[0] ?? 0);
    },
    async insertMany(tabela: string, colunas: string[], linhas: Valor[][]) {
      if (!linhas.length) return;
      const LOTE = 200;
      for (let i = 0; i < linhas.length; i += LOTE) {
        const parte = linhas.slice(i, i + LOTE);
        const values: Valor[] = [];
        const grupos = parte.map((l) => {
          const ph = l.map((v) => {
            values.push(v);
            return `$${values.length}`;
          });
          return `(${ph.join(", ")})`;
        });
        await q.query(`INSERT INTO ${tabela} (${colunas.join(", ")}) VALUES ${grupos.join(", ")}`, values);
      }
    },
  };
}

export const pgExecutor: Executor = executorSobre({
  query: (text, values) => getPool().query(text, values),
});

export async function pgTransacao<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
  const client: PoolClient = await getPool().connect();
  try {
    await client.query("BEGIN");
    const r = await fn(executorSobre(client));
    await client.query("COMMIT");
    return r;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* já caiu */
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function pgTabelasExistentes(): Promise<Set<string>> {
  const r = await getPool().query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
  );
  return new Set(r.rows.map((x) => String(x.table_name)));
}

export async function fecharPool(): Promise<void> {
  await g.__hfPool?.end();
  g.__hfPool = undefined;
}
