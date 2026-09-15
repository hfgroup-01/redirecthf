/**
 * Schema do banco local (SQLite) e migrações.
 *
 * COMO EVOLUIR: acrescente uma NOVA string no fim de `MIGRACOES`. Nunca edite
 * uma migração já aplicada (o `PRAGMA user_version` decide o que roda).
 * O equivalente Postgres fica em supabase/schema.sql (idempotente).
 *
 * Datas são ISO-8601 geradas pela aplicação (`toISOString()`), nunca
 * CURRENT_TIMESTAMP (que não é ISO e quebra `new Date()` na tela).
 * Booleanos são INTEGER 0/1; JSON é TEXT.
 */
export const MIGRACOES: string[] = [
  `
  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS domains (
    id             TEXT PRIMARY KEY,
    hostname       TEXT NOT NULL UNIQUE,
    zone_id        TEXT,
    zone_name      TEXT,
    account_id     TEXT,
    api_token_enc  TEXT,
    dns_record_id  TEXT,
    dns_type       TEXT,
    dns_target     TEXT,
    status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'dns_ok', 'active', 'error')),
    last_error     TEXT,
    last_check_at  TEXT,
    page_config    TEXT NOT NULL DEFAULT '{}',
    active         INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clients (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    slug              TEXT NOT NULL UNIQUE,
    phone             TEXT,
    notes             TEXT,
    default_domain_id TEXT REFERENCES domains(id) ON DELETE SET NULL,
    default_url       TEXT,
    active            INTEGER NOT NULL DEFAULT 1,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS clients_name_idx ON clients (name);

  CREATE TABLE IF NOT EXISTS links (
    id              TEXT PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    client_id       TEXT REFERENCES clients(id) ON DELETE CASCADE,
    domain_id       TEXT REFERENCES domains(id) ON DELETE SET NULL,
    label           TEXT,
    destination_url TEXT,
    mode            TEXT NOT NULL DEFAULT 'redirect'
                    CHECK (mode IN ('redirect', 'page')),
    append_query    INTEGER NOT NULL DEFAULT 1,
    page_title      TEXT,
    page_body       TEXT,
    active          INTEGER NOT NULL DEFAULT 1,
    clicks_count    INTEGER NOT NULL DEFAULT 0,
    last_click_at   TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS links_client_idx ON links (client_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS links_domain_idx ON links (domain_id);
  CREATE INDEX IF NOT EXISTS links_created_idx ON links (created_at DESC);

  CREATE TABLE IF NOT EXISTS clicks (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id  TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
    ts       TEXT NOT NULL,
    host     TEXT,
    country  TEXT,
    ua       TEXT,
    referer  TEXT,
    query    TEXT,
    ip_hash  TEXT,
    outcome  TEXT NOT NULL DEFAULT 'redirect'
  );

  CREATE INDEX IF NOT EXISTS clicks_link_ts_idx ON clicks (link_id, ts DESC);
  CREATE INDEX IF NOT EXISTS clicks_ts_idx ON clicks (ts DESC);

  CREATE TABLE IF NOT EXISTS link_events (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
    ts      TEXT NOT NULL,
    actor   TEXT NOT NULL,
    action  TEXT NOT NULL,
    detail  TEXT
  );

  CREATE INDEX IF NOT EXISTS link_events_link_idx ON link_events (link_id, ts DESC);
  `,
  // v2 — chave ON/OFF por domínio, meta tag do Facebook, CNPJ e opt-outs.
  `
  ALTER TABLE domains ADD COLUMN redirects_enabled INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE domains ADD COLUMN fb_code TEXT;
  ALTER TABLE domains ADD COLUMN cnpj TEXT;

  CREATE TABLE IF NOT EXISTS optouts (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ts      TEXT NOT NULL,
    host    TEXT,
    code    TEXT,
    lead    TEXT,
    contact TEXT,
    ua      TEXT,
    ip_hash TEXT
  );

  CREATE INDEX IF NOT EXISTS optouts_ts_idx ON optouts (ts DESC);
  `,
  // v3 — multiusuário (admin + clientes), domínio com dono, código único POR
  // domínio, zonas curinga (*.base) e autoria dos eventos.
  `
  CREATE TABLE IF NOT EXISTS users (
    id                   TEXT PRIMARY KEY,
    email                TEXT NOT NULL UNIQUE,
    name                 TEXT,
    password_hash        TEXT NOT NULL,
    role                 TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
    client_id            TEXT REFERENCES clients(id) ON DELETE CASCADE,
    active               INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    session_version      INTEGER NOT NULL DEFAULT 1,
    last_login_at        TEXT,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS users_client_idx ON users (client_id);

  CREATE TABLE IF NOT EXISTS wildcards (
    id            TEXT PRIMARY KEY,
    base_hostname TEXT NOT NULL UNIQUE,
    zone_id       TEXT,
    zone_name     TEXT,
    account_id    TEXT,
    api_token_enc TEXT,
    dns_record_id TEXT,
    dns_type      TEXT,
    dns_target    TEXT,
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'dns_ok', 'active', 'error')),
    last_error    TEXT,
    last_check_at TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );

  ALTER TABLE domains ADD COLUMN client_id   TEXT REFERENCES clients(id)   ON DELETE SET NULL;
  ALTER TABLE domains ADD COLUMN wildcard_id TEXT REFERENCES wildcards(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS domains_client_idx   ON domains (client_id);
  CREATE INDEX IF NOT EXISTS domains_wildcard_idx ON domains (wildcard_id);

  ALTER TABLE link_events ADD COLUMN user_id TEXT;

  UPDATE links SET domain_id = COALESCE(
    (SELECT c.default_domain_id FROM clients c WHERE c.id = links.client_id),
    (SELECT d.id FROM domains d WHERE d.active = 1
       ORDER BY CASE d.status WHEN 'active' THEN 0 ELSE 1 END, d.created_at ASC LIMIT 1)
  ) WHERE domain_id IS NULL;

  CREATE TABLE links_new (
    id              TEXT PRIMARY KEY,
    code            TEXT NOT NULL,
    client_id       TEXT REFERENCES clients(id) ON DELETE CASCADE,
    domain_id       TEXT REFERENCES domains(id) ON DELETE SET NULL,
    label           TEXT,
    destination_url TEXT,
    mode            TEXT NOT NULL DEFAULT 'redirect'
                    CHECK (mode IN ('redirect', 'page')),
    append_query    INTEGER NOT NULL DEFAULT 1,
    page_title      TEXT,
    page_body       TEXT,
    active          INTEGER NOT NULL DEFAULT 1,
    clicks_count    INTEGER NOT NULL DEFAULT 0,
    last_click_at   TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );
  INSERT INTO links_new (id, code, client_id, domain_id, label, destination_url, mode, append_query,
                         page_title, page_body, active, clicks_count, last_click_at, created_at, updated_at)
    SELECT id, code, client_id, domain_id, label, destination_url, mode, append_query,
           page_title, page_body, active, clicks_count, last_click_at, created_at, updated_at FROM links;
  DROP TABLE links;
  ALTER TABLE links_new RENAME TO links;
  CREATE UNIQUE INDEX links_domain_code_key ON links (domain_id, code);
  CREATE INDEX links_client_idx  ON links (client_id, created_at DESC);
  CREATE INDEX links_domain_idx  ON links (domain_id);
  CREATE INDEX links_created_idx ON links (created_at DESC);
  `,
];

export const REQUIRED_TABLES = [
  "settings",
  "domains",
  "clients",
  "links",
  "clicks",
  "link_events",
  "optouts",
  "users",
  "wildcards",
] as const;

interface BancoMigravel {
  exec(sql: string): void;
  prepare(sql: string): { get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[] };
}

export function aplicarMigracoes(db: BancoMigravel): { de: number; para: number } {
  const linha = db.prepare("PRAGMA user_version").get() as { user_version?: number } | undefined;
  const atual = Number(linha?.user_version ?? 0);

  if (atual > MIGRACOES.length) {
    throw new Error(
      `O banco está na versão ${atual}, mais nova que esta versão do HF (${MIGRACOES.length}). Atualize o app.`
    );
  }

  for (let versao = atual; versao < MIGRACOES.length; versao++) {
    // FK desligada FORA da transação (dentro é no-op): um DROP TABLE com FK
    // ligada faria DELETE implícito e cascatearia clicks/link_events.
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN");
    try {
      db.exec(MIGRACOES[versao]);
      const quebradas = db.prepare("PRAGMA foreign_key_check").all();
      if (quebradas.length) {
        throw new Error(`Migração v${versao + 1}: ${quebradas.length} referência(s) inválida(s); abortada.`);
      }
      db.exec(`PRAGMA user_version = ${versao + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    } finally {
      db.exec("PRAGMA foreign_keys = ON");
    }
  }
  return { de: atual, para: MIGRACOES.length };
}
