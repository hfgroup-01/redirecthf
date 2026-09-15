/**
 * Copia TUDO do SQLite local (data/hf.db) para o Supabase/Postgres.
 *
 *   1. Rode supabase/schema.sql no SQL Editor do Supabase.
 *   2. DATABASE_URL="postgresql://..." node scripts/migrate-sqlite-to-supabase.mjs
 *      (ou defina DATABASE_URL no .env e rode: npm run db:migrate)
 *
 * Idempotente: linhas que já existem (mesma chave) são puladas.
 * Mantém a mesma pasta data/.secret (HF_SECRET): os tokens da Cloudflare
 * cifrados continuam legíveis.
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const raiz = path.resolve(import.meta.dirname, "..");

// .env simples (sem dependência): só para pegar DATABASE_URL se não veio do ambiente.
if (!process.env.DATABASE_URL && existsSync(path.join(raiz, ".env"))) {
  for (const linha of readFileSync(path.join(raiz, ".env"), "utf-8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("Defina DATABASE_URL (connection string do Supabase).");
  process.exit(1);
}
const dbPath = path.join(process.env.HF_DATA_DIR?.trim() || path.join(raiz, "data"), "hf.db");
if (!existsSync(dbPath)) {
  console.error(`Não existe ${dbPath}.`);
  process.exit(1);
}

const { Pool } = require("pg");
const pool = new Pool({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
  max: 2,
});
const sq = new DatabaseSync(dbPath, { readOnly: true });

const b = (v) => (v === null || v === undefined ? null : Boolean(v));
const t = (v) => (v ? new Date(v).toISOString() : null);
const temTabela = (nome) => Boolean(sq.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(nome));

/** Insere em lotes com ON CONFLICT DO NOTHING; devolve quantas entraram. */
async function copiar(tabela, colunas, linhas, conflito) {
  if (!linhas.length) return 0;
  let inseridas = 0;
  const LOTE = 200;
  for (let i = 0; i < linhas.length; i += LOTE) {
    const parte = linhas.slice(i, i + LOTE);
    const values = [];
    const grupos = parte.map((l) => `(${l.map((v) => { values.push(v); return `$${values.length}`; }).join(", ")})`);
    const r = await pool.query(
      `INSERT INTO ${tabela} (${colunas.join(", ")}) VALUES ${grupos.join(", ")} ON CONFLICT ${conflito} DO NOTHING`,
      values
    );
    inseridas += r.rowCount ?? 0;
  }
  return inseridas;
}

const ok = (msg) => console.log("  ✔ " + msg);

try {
  await pool.query("SELECT 1");
  const tabelas = new Set((await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map((r) => r.table_name));
  for (const tb of ["settings", "domains", "clients", "links", "clicks", "link_events", "optouts", "users", "wildcards", "lead_targets"]) {
    if (!tabelas.has(tb)) {
      console.error(`Falta a tabela "${tb}" no Supabase. Rode supabase/schema.sql (v4) primeiro.`);
      process.exit(1);
    }
  }
  console.log(`SQLite: ${dbPath}\nPostgres: ${new URL(url).hostname}\n`);

  // settings (sem sobrescrever schema_version)
  {
    const rows = sq.prepare("SELECT key, value, updated_at FROM settings").all().filter((r) => r.key !== "schema_version");
    const n = await copiar("settings", ["key", "value", "updated_at"], rows.map((r) => [r.key, r.value, t(r.updated_at)]), "(key)");
    ok(`settings: ${n}/${rows.length}`);
  }
  // wildcards (antes de domains, que referencia)
  {
    const rows = temTabela("wildcards") ? sq.prepare("SELECT * FROM wildcards").all() : [];
    const n = await copiar(
      "wildcards",
      ["id", "base_hostname", "zone_id", "zone_name", "account_id", "api_token_enc", "dns_record_id", "dns_type", "dns_target", "status", "last_error", "last_check_at", "created_at", "updated_at"],
      rows.map((r) => [r.id, r.base_hostname, r.zone_id, r.zone_name, r.account_id, r.api_token_enc, r.dns_record_id, r.dns_type, r.dns_target, r.status, r.last_error, t(r.last_check_at), t(r.created_at), t(r.updated_at)]),
      "(id)"
    );
    ok(`wildcards: ${n}/${rows.length}`);
  }
  // domains (client_id entra depois de clients, por causa do ciclo domains <-> clients)
  const domains = sq.prepare("SELECT * FROM domains").all();
  {
    const n = await copiar(
      "domains",
      ["id", "hostname", "zone_id", "zone_name", "account_id", "api_token_enc", "dns_record_id", "dns_type", "dns_target", "status", "last_error", "last_check_at", "page_config", "active", "redirects_enabled", "fb_code", "cnpj", "wildcard_id", "created_at", "updated_at"],
      domains.map((r) => [r.id, r.hostname, r.zone_id, r.zone_name, r.account_id, r.api_token_enc, r.dns_record_id, r.dns_type, r.dns_target, r.status, r.last_error, t(r.last_check_at), r.page_config || "{}", b(r.active), b(r.redirects_enabled ?? 1), r.fb_code ?? null, r.cnpj ?? null, r.wildcard_id ?? null, t(r.created_at), t(r.updated_at)]),
      "(id)"
    );
    ok(`domains: ${n}/${domains.length}`);
  }
  // clients
  {
    const rows = sq.prepare("SELECT * FROM clients").all();
    const n = await copiar(
      "clients",
      ["id", "name", "slug", "phone", "notes", "default_domain_id", "default_url", "active", "created_at", "updated_at"],
      rows.map((r) => [r.id, r.name, r.slug, r.phone, r.notes, r.default_domain_id, r.default_url, b(r.active), t(r.created_at), t(r.updated_at)]),
      "(id)"
    );
    ok(`clients: ${n}/${rows.length}`);
  }
  // dono dos domínios (segundo passo)
  {
    let n = 0;
    for (const d of domains) {
      if (!d.client_id) continue;
      const r = await pool.query("UPDATE domains SET client_id = $1 WHERE id = $2 AND client_id IS NULL", [d.client_id, d.id]);
      n += r.rowCount ?? 0;
    }
    ok(`domains.client_id: ${n}`);
  }
  // users
  {
    const rows = temTabela("users") ? sq.prepare("SELECT * FROM users").all() : [];
    const n = await copiar(
      "users",
      ["id", "email", "name", "password_hash", "role", "client_id", "active", "must_change_password", "session_version", "last_login_at", "created_at", "updated_at"],
      rows.map((r) => [r.id, r.email, r.name, r.password_hash, r.role, r.client_id, b(r.active), b(r.must_change_password ?? 0), Number(r.session_version ?? 1), t(r.last_login_at), t(r.created_at), t(r.updated_at)]),
      "(id)"
    );
    ok(`users: ${n}/${rows.length}`);
  }
  // links
  {
    const rows = sq.prepare("SELECT * FROM links").all();
    const n = await copiar(
      "links",
      ["id", "code", "client_id", "domain_id", "label", "destination_url", "mode", "append_query", "page_title", "page_body", "active", "clicks_count", "last_click_at", "created_at", "updated_at"],
      rows.map((r) => [r.id, r.code, r.client_id, r.domain_id, r.label, r.destination_url, r.mode, b(r.append_query), r.page_title, r.page_body, b(r.active), Number(r.clicks_count ?? 0), t(r.last_click_at), t(r.created_at), t(r.updated_at)]),
      "(id)"
    );
    ok(`links: ${n}/${rows.length}`);
  }
  // clicks
  {
    const rows = sq.prepare("SELECT * FROM clicks").all();
    const n = await copiar(
      "clicks",
      ["id", "link_id", "ts", "host", "country", "ua", "referer", "query", "ip_hash", "lead", "outcome"],
      rows.map((r) => [r.id, r.link_id, t(r.ts), r.host, r.country, r.ua, r.referer, r.query, r.ip_hash, r.lead ?? null, r.outcome]),
      "(id)"
    );
    ok(`clicks: ${n}/${rows.length}`);
  }
  // lead_targets (destinos por lead)
  {
    const rows = temTabela("lead_targets") ? sq.prepare("SELECT * FROM lead_targets").all() : [];
    const n = await copiar(
      "lead_targets",
      ["id", "link_id", "lead_key", "destination_url", "clicks_count", "last_click_at", "created_at", "updated_at"],
      rows.map((r) => [r.id, r.link_id, r.lead_key, r.destination_url, Number(r.clicks_count ?? 0), t(r.last_click_at), t(r.created_at), t(r.updated_at)]),
      "(id)"
    );
    ok(`lead_targets: ${n}/${rows.length}`);
  }
  // link_events
  {
    const rows = sq.prepare("SELECT * FROM link_events").all();
    const n = await copiar(
      "link_events",
      ["id", "link_id", "ts", "actor", "user_id", "action", "detail"],
      rows.map((r) => [r.id, r.link_id, t(r.ts), r.actor, r.user_id ?? null, r.action, r.detail]),
      "(id)"
    );
    ok(`link_events: ${n}/${rows.length}`);
  }
  // optouts
  {
    const rows = sq.prepare("SELECT * FROM optouts").all();
    const n = await copiar(
      "optouts",
      ["id", "ts", "host", "code", "lead", "contact", "ua", "ip_hash"],
      rows.map((r) => [r.id, t(r.ts), r.host, r.code, r.lead, r.contact, r.ua, r.ip_hash]),
      "(id)"
    );
    ok(`optouts: ${n}/${rows.length}`);
  }
  // sequências dos ids numéricos
  for (const tb of ["clicks", "link_events", "optouts", "lead_targets"]) {
    await pool.query(`SELECT setval(pg_get_serial_sequence('${tb}', 'id'), COALESCE((SELECT MAX(id) FROM ${tb}), 0) + 1, false)`);
  }
  ok("sequências ajustadas");
  console.log("\nPronto. Defina DATABASE_URL no .env do HF e reinicie: ele passa a usar o Supabase.");
} catch (e) {
  console.error("\nFalhou:", e.message);
  process.exitCode = 1;
} finally {
  sq.close();
  await pool.end();
}
