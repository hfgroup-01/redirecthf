/**
 * Driver SQLite local via `node:sqlite` (embutido no Node 22.13+/24):
 * zero módulo nativo, zero credencial. Usado quando DATABASE_URL não existe.
 *
 * A conexão vive em globalThis para sobreviver ao HMR do Next em dev e ser
 * compartilhada por todas as rotas do mesmo processo. Migrações aplicadas na
 * abertura (PRAGMA user_version).
 */
import { DatabaseSync, type StatementSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { DbHealth, Executor, Valor } from "@/lib/db/index";
import { aplicarMigracoes, REQUIRED_TABLES } from "@/lib/db/schema";
import { HF_DB_PATH } from "@/lib/paths";

type ValorSqlite = string | number | null;

const g = globalThis as unknown as {
  __hfDb?: DatabaseSync;
  __hfStmts?: Map<string, StatementSync>;
};

export function getDb(): DatabaseSync {
  if (g.__hfDb) return g.__hfDb;

  fs.mkdirSync(path.dirname(HF_DB_PATH), { recursive: true });
  const conexao = new DatabaseSync(HF_DB_PATH);
  conexao.exec("PRAGMA journal_mode = WAL");
  conexao.exec("PRAGMA foreign_keys = ON");
  conexao.exec("PRAGMA busy_timeout = 5000");
  conexao.exec("PRAGMA synchronous = NORMAL");
  aplicarMigracoes(conexao);

  g.__hfDb = conexao;
  g.__hfStmts = new Map();
  return conexao;
}

/** Statements preparados ficam em cache: o hot path do redirect usa isto. */
function preparar(sql: string): StatementSync {
  const db = getDb();
  const cache = g.__hfStmts!;
  let stmt = cache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    cache.set(sql, stmt);
  }
  return stmt;
}

/** SQLite não tem boolean: true/false viram 1/0. */
const conv = (params: Valor[]): ValorSqlite[] => params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p));

/** SQLite não tem ILIKE: volta para LIKE (que já ignora maiúsculas em ASCII). */
const sqlSqlite = (sql: string) => sql.replace(/\bILIKE\b/g, "LIKE");

function todosSync<T>(sql: string, ...params: Valor[]): T[] {
  return preparar(sqlSqlite(sql)).all(...conv(params)) as T[];
}
function umSync<T>(sql: string, ...params: Valor[]): T | null {
  return (preparar(sqlSqlite(sql)).get(...conv(params)) as T | undefined) ?? null;
}
function rodarSync(sql: string, ...params: Valor[]): { changes: number } {
  const r = preparar(sqlSqlite(sql)).run(...conv(params));
  return { changes: Number(r.changes) };
}
function escalarSync(sql: string, ...params: Valor[]): number {
  const linha = preparar(sqlSqlite(sql)).get(...conv(params)) as Record<string, unknown> | undefined;
  if (!linha) return 0;
  return Number(Object.values(linha)[0] ?? 0);
}

export const sqliteExecutor: Executor = {
  async todos<T>(sql: string, ...params: Valor[]) {
    return todosSync<T>(sql, ...params);
  },
  async um<T>(sql: string, ...params: Valor[]) {
    return umSync<T>(sql, ...params);
  },
  async rodar(sql: string, ...params: Valor[]) {
    return rodarSync(sql, ...params);
  },
  async escalar(sql: string, ...params: Valor[]) {
    return escalarSync(sql, ...params);
  },
  async insertMany(tabela: string, colunas: string[], linhas: Valor[][]) {
    if (!linhas.length) return;
    const sql = `INSERT INTO ${tabela} (${colunas.join(", ")}) VALUES (${colunas.map(() => "?").join(", ")})`;
    const stmt = preparar(sql);
    for (const l of linhas) stmt.run(...conv(l));
  },
};

/**
 * Transação síncrona por baixo: o callback é async por contrato da API, mas
 * com SQLite tudo resolve no mesmo tick, então BEGIN/COMMIT envolvem o lote.
 */
export async function sqliteTransacao<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = await fn(sqliteExecutor);
    db.exec("COMMIT");
    return r;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function fecharDb(): void {
  g.__hfDb?.close();
  g.__hfDb = undefined;
  g.__hfStmts = undefined;
}

export function sqliteHealth(): DbHealth {
  try {
    const db = getDb();
    const versao = Number(
      (db.prepare("PRAGMA user_version").get() as { user_version?: number })?.user_version ?? 0
    );
    const contagens: Record<string, number> = {};
    for (const t of REQUIRED_TABLES) contagens[t] = escalarSync(`SELECT COUNT(*) FROM ${t}`);
    return { ok: true, driver: "sqlite", caminho: HF_DB_PATH, versao, contagens, erro: null };
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    return { ok: false, driver: "sqlite", caminho: HF_DB_PATH, versao: 0, contagens: {}, erro: m };
  }
}
