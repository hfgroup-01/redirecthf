/**
 * Camada de banco do HF — API única, dois drivers:
 *
 *   - Postgres/Supabase quando DATABASE_URL está definido (produção)
 *   - SQLite local (data/hf.db) caso contrário (padrão, zero configuração)
 *
 * Toda a API é assíncrona. Os stores só conhecem este módulo.
 * SQL é escrito uma vez, no dialeto comum; o que difere passa por
 * `likeOp()` e `diaExpr()`.
 */
import { REQUIRED_TABLES } from "@/lib/db/schema";

export type Valor = string | number | boolean | null;

export interface Executor {
  todos<T>(sql: string, ...params: Valor[]): Promise<T[]>;
  um<T>(sql: string, ...params: Valor[]): Promise<T | null>;
  rodar(sql: string, ...params: Valor[]): Promise<{ changes: number }>;
  escalar(sql: string, ...params: Valor[]): Promise<number>;
  insertMany(tabela: string, colunas: string[], linhas: Valor[][]): Promise<void>;
}

export type Dialeto = "sqlite" | "pg";

export const dialect: Dialeto = process.env.DATABASE_URL?.trim() ? "pg" : "sqlite";
export const usandoSupabase = dialect === "pg";

/** Operador LIKE sem diferenciar maiúsculas (SQLite já é assim; PG precisa de ILIKE). */
export const likeOp = () => (dialect === "pg" ? "ILIKE" : "LIKE");

/** Expressão YYYY-MM-DD (UTC) para agrupar por dia. */
export const diaExpr = (col: string) =>
  dialect === "pg" ? `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD')` : `substr(${col}, 1, 10)`;

export const agora = () => new Date().toISOString();

// Carregamento preguiçoso do driver: o módulo do outro driver nem é importado.
async function exec(): Promise<Executor> {
  if (dialect === "pg") return (await import("@/lib/db/pg")).pgExecutor;
  return (await import("@/lib/db/sqlite")).sqliteExecutor;
}

export async function todos<T>(sql: string, ...params: Valor[]): Promise<T[]> {
  return (await exec()).todos<T>(sql, ...params);
}
export async function um<T>(sql: string, ...params: Valor[]): Promise<T | null> {
  return (await exec()).um<T>(sql, ...params);
}
export async function rodar(sql: string, ...params: Valor[]): Promise<{ changes: number }> {
  return (await exec()).rodar(sql, ...params);
}
export async function escalar(sql: string, ...params: Valor[]): Promise<number> {
  return (await exec()).escalar(sql, ...params);
}
export async function insertMany(tabela: string, colunas: string[], linhas: Valor[][]): Promise<void> {
  return (await exec()).insertMany(tabela, colunas, linhas);
}

export async function transacao<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
  if (dialect === "pg") return (await import("@/lib/db/pg")).pgTransacao(fn);
  return (await import("@/lib/db/sqlite")).sqliteTransacao(fn);
}

export function translateDbError(error: unknown): string {
  const m = error instanceof Error ? error.message : String(error);
  // SQLite e Postgres dizem a mesma coisa com palavras diferentes.
  if (/links\.domain_id, links\.code|links_domain_code_key/i.test(m)) return "Já existe um link com esse código neste domínio.";
  if (/users\.email|users_email_key/i.test(m)) return "Já existe um usuário com esse e-mail.";
  if (/lead_targets\.link_id, lead_targets\.lead_key|lead_targets_link_lead_key/i.test(m)) return "Esse lead já tem destino neste link.";
  if (/wildcards\.base_hostname|wildcards_base_hostname_key/i.test(m)) return "Essa zona curinga já está cadastrada.";
  if (/links\.code|links_code_key/i.test(m)) return "Já existe um link com esse código.";
  if (/clients\.slug|clients_slug_key/i.test(m)) return "Já existe um cliente com esse slug.";
  if (/domains\.hostname|domains_hostname_key/i.test(m)) return "Esse domínio já está cadastrado.";
  if (/UNIQUE constraint failed|duplicate key/i.test(m)) return "Registro duplicado.";
  if (/FOREIGN KEY constraint failed|violates foreign key/i.test(m)) return "Referência inválida (cliente ou domínio não existe).";
  if (/CHECK constraint failed|violates check constraint/i.test(m)) return "Valor inválido para um campo de lista fixa.";
  if (/database is locked|busy/i.test(m)) return "Banco ocupado por outro processo. Tente de novo.";
  if (/relation ".*" does not exist/i.test(m)) return "Tabela não existe no Supabase: rode supabase/schema.sql no SQL Editor.";
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout|password authentication failed|SSL/i.test(m)) {
    return `Não consegui conectar ao banco (${m}). Confira DATABASE_URL.`;
  }
  return m;
}

export interface DbHealth {
  ok: boolean;
  driver: Dialeto;
  caminho: string;
  versao: number;
  contagens: Record<string, number>;
  erro: string | null;
}

export async function checkDatabase(): Promise<DbHealth> {
  if (dialect === "pg") {
    const base: DbHealth = { ok: false, driver: "pg", caminho: descreverUrl(process.env.DATABASE_URL ?? ""), versao: 0, contagens: {}, erro: null };
    try {
      const { pgTabelasExistentes } = await import("@/lib/db/pg");
      const existentes = await pgTabelasExistentes();
      const faltando = REQUIRED_TABLES.filter((t) => !existentes.has(t));
      if (faltando.length) {
        return { ...base, erro: `Faltam tabelas no Supabase (${faltando.join(", ")}): rode supabase/schema.sql no SQL Editor.` };
      }
      const [ns, v] = await Promise.all([
        Promise.all(REQUIRED_TABLES.map((t) => escalar(`SELECT COUNT(*) FROM ${t}`))),
        um<{ value: string }>("SELECT value FROM settings WHERE key = 'schema_version'"),
      ]);
      const contagens: Record<string, number> = {};
      REQUIRED_TABLES.forEach((t, i) => (contagens[t] = ns[i]));
      return { ...base, ok: true, versao: v ? Number(JSON.parse(v.value)) : 0, contagens };
    } catch (err) {
      return { ...base, erro: translateDbError(err) };
    }
  }
  const { sqliteHealth } = await import("@/lib/db/sqlite");
  return sqliteHealth();
}

function descreverUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? ":" + u.port : ""}${u.pathname}`;
  } catch {
    return "DATABASE_URL";
  }
}
