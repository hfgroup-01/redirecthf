-- ============================================================================
-- HF Redirects — schema para Supabase (Postgres) — v3
--
-- Como usar: Supabase → SQL Editor → cole tudo → Run.
-- É idempotente: pode rodar de novo quando o HF ganhar colunas/tabelas novas.
--
-- O HF acessa o banco direto pela connection string (DATABASE_URL), com o
-- usuário postgres. RLS fica ligado sem políticas: a API pública do Supabase
-- (anon/authenticated) não enxerga nada — só o servidor do HF.
-- ============================================================================

create schema if not exists public;

-- ---------------------------------------------------------------- settings
create table if not exists public.settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- domains
create table if not exists public.domains (
  id                text primary key,
  hostname          text not null unique,
  zone_id           text,
  zone_name         text,
  account_id        text,
  api_token_enc     text,
  dns_record_id     text,
  dns_type          text,
  dns_target        text,
  status            text not null default 'pending'
                    check (status in ('pending', 'dns_ok', 'active', 'error')),
  last_error        text,
  last_check_at     timestamptz,
  page_config       jsonb not null default '{}'::jsonb,
  active            boolean not null default true,
  redirects_enabled boolean not null default true,
  fb_code           text,
  cnpj              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.domains add column if not exists redirects_enabled boolean not null default true;
alter table public.domains add column if not exists fb_code text;
alter table public.domains add column if not exists cnpj text;

-- ---------------------------------------------------------------- clients
create table if not exists public.clients (
  id                text primary key,
  name              text not null,
  slug              text not null unique,
  phone             text,
  notes             text,
  default_domain_id text references public.domains(id) on delete set null,
  default_url       text,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists clients_name_idx on public.clients (lower(name));

-- ---------------------------------------------------------------- links
-- v3: o código é único POR domínio (links_domain_code_key), não mais global.
create table if not exists public.links (
  id              text primary key,
  code            text not null,
  client_id       text references public.clients(id) on delete cascade,
  domain_id       text references public.domains(id) on delete set null,
  label           text,
  destination_url text,
  mode            text not null default 'redirect' check (mode in ('redirect', 'page')),
  append_query    boolean not null default true,
  page_title      text,
  page_body       text,
  active          boolean not null default true,
  clicks_count    bigint not null default 0,
  last_click_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists links_client_idx  on public.links (client_id, created_at desc);
create index if not exists links_domain_idx  on public.links (domain_id);
create index if not exists links_created_idx on public.links (created_at desc);

-- ---------------------------------------------------------------- clicks
create table if not exists public.clicks (
  id       bigserial primary key,
  link_id  text not null references public.links(id) on delete cascade,
  ts       timestamptz not null default now(),
  host     text,
  country  text,
  ua       text,
  referer  text,
  query    text,
  ip_hash  text,
  outcome  text not null default 'redirect'
);

create index if not exists clicks_link_ts_idx on public.clicks (link_id, ts desc);
create index if not exists clicks_ts_idx      on public.clicks (ts desc);

-- ---------------------------------------------------------------- link_events
create table if not exists public.link_events (
  id      bigserial primary key,
  link_id text not null references public.links(id) on delete cascade,
  ts      timestamptz not null default now(),
  actor   text not null,
  action  text not null,
  detail  text
);

create index if not exists link_events_link_idx on public.link_events (link_id, ts desc);

-- ---------------------------------------------------------------- optouts
create table if not exists public.optouts (
  id      bigserial primary key,
  ts      timestamptz not null default now(),
  host    text,
  code    text,
  lead    text,
  contact text,
  ua      text,
  ip_hash text
);

create index if not exists optouts_ts_idx on public.optouts (ts desc);

-- ---------------------------------------------------------------- v3: usuários
create table if not exists public.users (
  id                   text primary key,
  email                text not null unique,
  name                 text,
  password_hash        text not null,
  role                 text not null default 'client' check (role in ('admin', 'client')),
  client_id            text references public.clients(id) on delete cascade,
  active               boolean not null default true,
  must_change_password boolean not null default false,
  session_version      integer not null default 1,
  last_login_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists users_client_idx on public.users (client_id);

-- ---------------------------------------------------------------- v3: zonas curinga
create table if not exists public.wildcards (
  id            text primary key,
  base_hostname text not null unique,
  zone_id       text,
  zone_name     text,
  account_id    text,
  api_token_enc text,
  dns_record_id text,
  dns_type      text,
  dns_target    text,
  status        text not null default 'pending' check (status in ('pending', 'dns_ok', 'active', 'error')),
  last_error    text,
  last_check_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- v3: dono e curinga do domínio
alter table public.domains add column if not exists client_id   text references public.clients(id)   on delete set null;
alter table public.domains add column if not exists wildcard_id text references public.wildcards(id) on delete set null;
create index if not exists domains_client_idx   on public.domains (client_id);
create index if not exists domains_wildcard_idx on public.domains (wildcard_id);

-- ---------------------------------------------------------------- v3: autoria dos eventos
alter table public.link_events add column if not exists user_id text;

-- ---------------------------------------------------------------- v3: código único por domínio
update public.links l set domain_id = coalesce(
  (select c.default_domain_id from public.clients c where c.id = l.client_id),
  (select d.id from public.domains d where d.active
     order by (case when d.status = 'active' then 0 else 1 end), d.created_at asc limit 1)
) where l.domain_id is null;
alter table public.links drop constraint if exists links_code_key;
create unique index if not exists links_domain_code_key on public.links (domain_id, code);

-- ---------------------------------------------------------------- segurança
-- RLS ligado e sem políticas = a API REST/anon do Supabase não lê nem escreve.
-- O HF entra como postgres pela connection string e ignora RLS.
alter table public.settings    enable row level security;
alter table public.domains     enable row level security;
alter table public.clients     enable row level security;
alter table public.links       enable row level security;
alter table public.clicks      enable row level security;
alter table public.link_events enable row level security;
alter table public.optouts     enable row level security;
alter table public.users       enable row level security;
alter table public.wildcards   enable row level security;

-- Versão do schema (o HF confere no /api/v1/health)
insert into public.settings (key, value, updated_at)
values ('schema_version', '"3"', now())
on conflict (key) do update set value = excluded.value, updated_at = now();
