# HF — plano e arquitetura (v3)

## Problema

Templates do WhatsApp com botão de link são aprovados com a URL fixa. Você precisa:

1. subir uma **página white** informativa (dados da BM/empresa, "reunião confirmada") para o
   subdomínio usado no template;
2. depois, no painel, **trocar o destino** de cada link sem mexer no template;
3. fazer isso para **500+ BMs** de **100+ clientes**, cada cliente cuidando só do que é dele.

## Solução em uma frase

Um único serviço Node (Next.js 16) que é ao mesmo tempo o **painel** (admin + clientes), o
**motor de redirect** e o **servidor da página white**, com banco no Supabase (ou SQLite), e que
usa a API da Cloudflare apenas para apontar zonas/domínios para si mesmo.

## Papéis e escopo

- **admin**: vê tudo; cria clientes, domínios, zonas curinga e logins; pode "entrar como cliente".
- **client**: preso ao `client_id` do usuário. Vê e gerencia só os domínios e links do cliente:
  criar/editar/pausar códigos, trocar destino, página white, meta tag da Meta, ON/OFF do domínio,
  cliques, opt-outs. Não cria/remove domínio, não troca hostname/token/ativo/dono, não vê
  configurações nem outros clientes.
- **Escopo no código**: `Scope { clientId | null }` é o último parâmetro obrigatório de todo store
  exposto (`listLinks(f, scope)`, `getDomain(id, scope)`, …). Fora do escopo → 404 (não 403), para
  não denunciar existência. Endpoint admin-only → `somenteAdmin` (403).
- **Invariante de posse**: `links.client_id == domains.client_id` do domínio do link. Reatribuir um
  domínio (`assignDomainToClient`) move os links junto, numa transação, e limpa o domínio padrão do
  dono antigo.
- **Sessão**: cookie HMAC `{ uid, sv, exp, imp? }`. `sv` = `users.session_version` (troca/reset de
  senha, desativação e mudança de papel derrubam as sessões). `imp` = admin impersonando um
  cliente; as ações ficam atribuídas ao admin (`link_events.user_id`), com o escopo do cliente.
- **Chave de API** = admin (n8n/disparador). Não impersona nem troca senha.

## Banco: Supabase (Postgres) ou SQLite local

A camada `src/lib/db` tem uma API assíncrona única (`todos/um/rodar/escalar/transacao/insertMany`)
e dois drivers: `pg` (quando `DATABASE_URL` existe) e `node:sqlite` (padrão). O SQL é escrito uma vez
com `?`; o driver pg converte para `$n` (nenhum literal pode conter `?`). Diferenças de dialeto
passam por `likeOp()` e `diaExpr()`. Schema do Supabase em `supabase/schema.sql` (idempotente);
migrações do SQLite em `src/lib/db/schema.ts` (`MIGRACOES`, `PRAGMA user_version`; a v3 reconstrói
`links` com FK desligada e confere `foreign_key_check` antes do COMMIT).

## Modelo de dados (v3)

| tabela | papel |
| --- | --- |
| `settings` | chave/valor: api key, id da instância, alvo do DNS, token padrão (cifrado), página padrão, retenção, `panel_host` |
| `users` | e-mail (único), hash scrypt, `role` admin/client, `client_id`, ativo, `must_change_password`, `session_version` |
| `wildcards` | zona curinga: `base_hostname` (raiz da zona), zona/conta, registro `*` criado, status |
| `domains` | hostname, **`client_id` (dono)**, **`wildcard_id`** (coberto pelo `*`), zona/registro DNS, status, `page_config`, `redirects_enabled`, `fb_code`, `cnpj` |
| `clients` | nome, slug, domínio padrão (precisa ser do cliente), destino padrão, ativo |
| `links` | **`code` único por `domain_id`**, cliente, domínio, destino, `mode`, `append_query`, overrides da página, ativo, contador |
| `clicks` | log por clique (ts, host, país, UA, referer, query, hash do IP, outcome) |
| `link_events` | auditoria: `actor` (`user:<email>` / `api`), `user_id`, ação, diff |
| `optouts` | pedidos "não quero mais receber mensagens" (host, código, lead, contato) |

## Fluxo de request

```
https://luiscomercioltda.lumix10.cfd/abc123?l=5511999
   │ Cloudflare (proxied, SSL na borda; *.lumix10.cfd → túnel/VPS)
   ▼
HF (:3100)
   ├─ host do painel (localhost | HF_ADMIN_HOST | setting panel_host)
   │     ├─ /admin/**   → painel (sessão; sidebar e páginas por papel)
   │     ├─ /api/v1/**  → JSON (sessão ou x-api-key)
   │     └─ /           → 302 /admin
   ├─ host cadastrado em `domains` (ativo)
   │     ├─ /            → página white do host (200)
   │     ├─ /privacidade, /opt-out
   │     └─ /<code>      → resolveLink(domainId, code)  [cache (domínio|código) 30s + invalidação]
   │           ├─ ativo & redirect & destino & domínio ON & cliente ON → 302 (+ query) → fila de cliques
   │           ├─ pausado / modo página / OFF                          → página white (200)
   │           └─ inexistente NESTE domínio                            → página white (404)
   └─ qualquer outro host → 404 neutro (nunca o painel)
```

- **Caches (por processo)**: host→domínio (TTL 30s, negativo 10s, cap 5000 com eviction) e
  (domínio, código)→link (30s/10s, cap 20000). Invalidação síncrona nos stores.
- **Fila de cliques**: lote a cada ~1s numa transação; previews (WhatsApp/Meta) contam como `bot`.
- `/hf/ping` responde em qualquer host (a verificação de domínio depende disso).

## Subdomínio por BM (zona curinga)

1. Domínios → Zonas curinga → `lumix10.cfd`: o HF valida token, exige que seja a raiz da zona
   (Universal SSL cobre um nível), lista o `*` atual; se aponta para outro lugar, **pede confirmação**
   antes de substituir; cria `* CNAME/A` proxied → alvo do DNS; testa `hfprobe-xxxx.lumix10.cfd/hf/ping`.
2. Domínios → Adicionar: nome da BM + zona + cliente dono. `provisionDomain` vê que o host está sob
   um curinga pronto e pula a Cloudflare: só verifica `/hf/ping` → `active` em segundos.
3. O cliente cola o código da meta tag na página do domínio dele; a raiz passa a servir
   `<meta name="facebook-domain-verification">`; botão *Meta tag* confere pela internet.
4. Chave **OFF** durante a análise do template; **ON** depois. Template: `https://<host>/{{1}}`.

## Host do painel

O painel/API só existem em `localhost` ou no host do painel (`HF_ADMIN_HOST` no env tem prioridade
sobre o setting). Motivo: com `*.lumix10.cfd` apontando para o HF, qualquer subdomínio não
cadastrado chegaria aqui — e não pode cair no login. O host do painel não pode ser um domínio de
redirect; o botão "Provisionar DNS do painel" cria o registro (proxied) apontando para o HF.

## Exposição do servidor

| modo | alvo do DNS | quando |
| --- | --- | --- |
| Cloudflare Tunnel | `CNAME <uuid>.cfargotunnel.com` | PC local ou VPS: ingress catch-all → HF; nenhum DNS extra por domínio |
| VPS com porta | `A <ip>` | Traefik + SSL no origin |

Ver `docs/DEPLOY-EASYPANEL.md` (HF + cloudflared como dois serviços, mesmo túnel `hf`).

## Escala (500 BMs, 100+ clientes)

- Zona curinga: 0 registros DNS por BM; cadastro de domínio sem chamada externa.
- Hot path: 1 lookup de host + 1 de (domínio, código), ambos em cache; HTML da página white é string;
  302 puro com `no-store`.
- Índices: `links(domain_id, code)` único, `links(client_id, created_at)`, `domains(client_id)`,
  `clicks(link_id, ts)`, `users(email)`.
- Listagens paginadas; bulk por cliente; caches com eviction (nunca `clear()` por overflow).
- Um processo por banco (caches são por processo): durante a migração PC→VPS os dois podem coexistir
  alguns minutos, não permanentemente.

## Segurança

- Sessão: cookie HttpOnly assinado (HMAC-SHA256 com `HF_SECRET`/`data/.secret`), 7 dias, versão
  de sessão por usuário.
- Senhas: scrypt; login com tempo constante para usuário inexistente; rate limit 8/min por IP e por e-mail.
- Primeiro admin: `/admin/setup` só com `users` vazio e, se havia senha v2 ou `HF_ADMIN_PASSWORD`,
  exige uma delas como prova.
- Tokens Cloudflare: AES-256-GCM. IP do visitante só como hash. `noindex`; sem `x-powered-by`.
- RLS ligado no Supabase sem políticas (a API anon não vê nada; o HF entra como `postgres`).

## O que ficou de fora (de propósito)

- Cloaking por user-agent/geo: a página white é o **estado do link**, não um disfarce por visitante.
- Chaves de API por cliente (a API é do admin/disparador).
- Envio de e-mail (senha temporária é mostrada ao admin, que repassa).
- Cloudflare Access na frente de `/admin` (recomendado numa próxima etapa).

## Próximos passos possíveis

- Cloudflare Access para o host do painel.
- Importar clientes/links por CSV; exportar cliques; webhook de clique.
- Regras por horário/geo por link (agendar troca de destino); rotação A/B de destinos.
