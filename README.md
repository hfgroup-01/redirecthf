# HF — CRM de redirects (WhatsApp templates + Cloudflare)

Painel multiusuário para gerenciar **links de redirect com destino trocável** usados em botões de
template do WhatsApp. Um link é `https://<subdomínio-da-bm>/<codigo>`; no painel o cliente (ou você)
decide, a qualquer momento, para onde ele manda (ou se mostra a página white informativa).

- **Um subdomínio por BM**: `luiscomercioltda.lumix10.cfd`. Com a **zona curinga** cadastrada
  (`*.lumix10.cfd` → HF), cada subdomínio nasce sem chamada à Cloudflare; 500 BMs = zero registros
  extras. Domínios de outras zonas continuam funcionando com um registro DNS por host.
- **Admin e clientes**: o admin (você) cria clientes, domínios e os logins de cada cliente. O
  cliente entra com e-mail + senha e só vê **os domínios e links dele**: cria códigos, troca
  destinos, pausa, edita a página white, cola a meta tag da Meta, liga/desliga o redirect, vê cliques
  e opt-outs. O admin pode "entrar como cliente" para ver o painel dele.
- **Código único por domínio**: o mesmo código pode existir em BMs diferentes; cada um resolve só no
  próprio host. A URL do template é `https://<subdomínio>/{{1}}`.
- **Página white**: página informativa ("Reunião confirmada", dados da empresa, contato, privacidade)
  servida na raiz do domínio, em links pausados e em links no modo página. Nasce pronta a partir do
  **CNPJ**, leva a **meta tag de verificação do Facebook** e sempre traz o bloco de **opt-out**.
- **Chave ON/OFF por domínio**: ON = códigos redirecionam; OFF = todos mostram a página white
  (deixe OFF enquanto o template está em análise; ligue depois de aprovado).
- **Host do painel**: o painel e a API só respondem em `localhost` e no host configurado (ex.:
  `hfredirect.online`). Qualquer outro host serve só páginas white/redirects ou 404 neutro.
- **API** (`/api/v1/*`, chave em Configurações, age como admin) para n8n / disparador.
- **Banco**: Supabase (Postgres) ou SQLite local; tokens da Cloudflare criptografados (AES-GCM).

Detalhes de arquitetura e decisões: [docs/PLANO.md](docs/PLANO.md). Deploy na VPS:
[docs/DEPLOY-EASYPANEL.md](docs/DEPLOY-EASYPANEL.md).

## Rodar (jeito simples, no PC)

Dê dois cliques em **`HF.bat`** (há um atalho "HF Redirects" na Área de Trabalho). Ele sobe o
servidor e o túnel na mesma janela, reinicia o que cair, abre o painel no navegador e para
tudo quando a janela é fechada. Para abrir sozinho ao entrar no Windows, rode uma vez
`HF-iniciar-com-Windows.bat` (rodar de novo desfaz).

## Rodar (manual)

Requisitos: Node **22.13+** (recomendado 24).

```bash
npm install
npm run build
npm start          # http://localhost:3100/admin  -> cria o primeiro administrador
# dev: npm run dev
```

Docker / EasyPanel: `docker compose up -d` (volume `/data`). Variáveis em `.env.example`.

## Primeiro acesso e usuários

- `/admin/setup` cria o **primeiro administrador** (e-mail + senha). Se existe uma senha antiga
  (v2) ou `HF_ADMIN_PASSWORD` no `.env`, ela é pedida como prova. Com `HF_ADMIN_EMAIL` +
  `HF_ADMIN_PASSWORD` no ambiente, o admin nasce sozinho no primeiro boot (Docker).
- **Logins de cliente**: Clientes → cliente → "Logins do cliente". O HF gera uma senha temporária
  (mostrada uma vez); no primeiro acesso a pessoa cria a definitiva. Resetar senha derruba as
  sessões. Outros admins: Configurações → Usuários.
- Cada usuário troca a própria senha em **Minha conta**.

## Banco de dados: Supabase ou SQLite

Sem configurar nada, o HF usa SQLite em `data/hf.db` (migrações automáticas). Para o **Supabase**:

1. SQL Editor → cole [`supabase/schema.sql`](supabase/schema.sql) → Run (idempotente; rode de novo
   a cada versão nova do HF).
2. Connect → **Transaction pooler** (porta 6543) → cole no `.env` (raiz do projeto):
   ```
   DATABASE_URL=postgresql://postgres.abcdefgh:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
   ```
3. `npm run db:migrate` copia o que já existe no SQLite.
4. Reinicie o HF. Em **Configurações → Banco de dados** aparece "Supabase / Postgres · conectado".

O segredo que cifra os tokens e assina as sessões fica em `data/.secret` (ou `HF_SECRET`); use o
**mesmo** valor ao mudar de máquina.

## Túnel Cloudflare (sem abrir porta)

```bash
npm run tunnel:setup              # login (abre o navegador) -> cria o túnel "hf" -> grava config.yml
npm run tunnel                    # roda o túnel no terminal (deixe aberto)
```

O script imprime o alvo `<ID>.cfargotunnel.com`; cole em **Configurações → alvo do DNS (CNAME)**.
O `config.yml` fica com ingress *catch-all*: qualquer host cujo DNS aponte para o túnel chega ao HF.

## Configuração (uma vez)

1. **Configurações → alvo do DNS**: `CNAME <tunnel-id>.cfargotunnel.com` (túnel) ou `A <ip>` (VPS).
2. **Configurações → token da Cloudflare**: `Zone:Read` + `DNS:Edit` nas zonas que você usar.
3. **Configurações → host do painel**: ex. `hfredirect.online` (+ botão "Provisionar DNS do painel").
4. **Domínios → Zonas curinga → Adicionar**: `lumix10.cfd`. Se já existe um `*` apontando para outro
   lugar, o HF mostra e pede confirmação antes de substituir.
5. **Domínios → Adicionar subdomínio**: nome da BM + zona curinga + cliente dono (+ CNPJ e código da
   meta tag, opcionais). Fica "No ar" em segundos, sem tocar na Cloudflare.

## Fluxo com o template do WhatsApp

1. No template, botão de URL **dinâmica**: `https://luiscomercioltda.lumix10.cfd/{{1}}`.
2. O cliente (ou você) cria um código no painel e escolhe o destino.
3. No disparo, envie o código como `{{1}}` (ex.: `abc123` ou `abc123?l=<telefone>`).
4. Precisou trocar o destino? Edite no painel ou via API. O template não muda.
5. Pausou o link/cliente, deixou o domínio OFF ou modo página → quem clicar vê a página white.

## Um destino por lead

**Caso simples (sem CSV):** o link do cliente só muda pelo id/CPF do lead, ex.
`https://atendimento.marketing/order/jn0V72C34UZt`. Ponha `{lead}` na URL de destino do link
(`https://atendimento.marketing/order/{lead}` ou `…/order/?order={lead}`) e envie `{{1}}` =
`abc123.jn0V72C34UZt`. O HF encaixa o id na hora, preservando maiúsculas; CPF/telefone com
pontuação viram só dígitos.

**Caso geral (CSV com 100 mil linhas):** quando cada lead tem uma URL diferente, o código
continua um só (a campanha) e os destinos ficam numa tabela por lead:

1. Na página do link, **Destinos por lead (CSV)**: suba o CSV do disparo escolhendo a coluna do
   lead (telefone/id) e a coluna da URL. Entra em lotes de 1000 (100 mil leads em segundos).
2. O HF devolve o **mesmo CSV com `hf_var` e `hf_url`**: `hf_var` é o valor de `{{1}}`
   (`abc123.5511999990000`) e `hf_url` a URL completa. Use no disparador.
3. Ao clicar, `https://<host>/abc123.5511999990000` (ou `abc123?l=5511999990000`) cai na URL
   daquele lead; lead sem destino próprio cai na URL padrão do link. Telefones são comparados só
   pelos dígitos. Cada lead tem contador de cliques.
4. Via API (n8n): `POST /api/v1/links/:id/targets { targets: [{ lead, url }] }` (até 50 mil por
   chamada), `GET …/targets/export` (CSV), `DELETE …/targets[?lead=]`.

## API rápida

Header `x-api-key: <chave>` (ou `Authorization: Bearer`). Sessão de cliente pelo cookie enxerga só
o escopo dele; a chave de API é admin.

| Método | Rota | Uso |
| --- | --- | --- |
| GET | `/api/v1/health` | saúde (só no host do painel) |
| GET | `/api/v1/me` | quem sou (usuário/ator) |
| GET/POST | `/api/v1/clients` · `/api/v1/clients/:idOuSlug` (PATCH/DELETE) | clientes (admin) |
| GET/POST | `/api/v1/users` · `/api/v1/users/:id` (PATCH/DELETE) · `/api/v1/users/:id/reset-password` | logins (admin) |
| POST/DELETE | `/api/v1/auth/impersonate` | admin entra como cliente / volta |
| GET/POST | `/api/v1/links` · `/api/v1/links/:idOuCodigo?host=` (PATCH/DELETE) | links (`domainId` obrigatório, ou `subdomain: { label, base }` para criar a BM junto; `?host=` se o código existe em vários domínios) |
| POST | `/api/v1/links/bulk` | `{ clientId | ids[], destinationUrl?, mode?, active? }` |
| GET | `/api/v1/links/:id/clicks?page=` | log de cliques |
| GET/POST/DELETE | `/api/v1/links/:id/targets` · POST `…/targets/import` (CSV, `?retorno=csv`) · GET `…/targets/export` | destinos por lead |
| GET/POST | `/api/v1/domains` · `/api/v1/domains/:id` (PATCH/DELETE) | `{ hostname }` ou `{ label, base }`, `clientId`, `cnpj`, `fbCode`, `redirectsEnabled` |
| POST | `/api/v1/domains/:id/dns` · `/check` · `/meta` | provisionar DNS (admin) / verificar / conferir meta tag |
| GET/POST | `/api/v1/wildcards` · `/api/v1/wildcards/:id` (DELETE) · `/:id/dns` · `/:id/check` | zonas curinga (admin) |
| POST | `/api/v1/cnpj` | `{ cnpj }` → página white montada pela Receita |
| GET | `/api/v1/optouts` · `?format=csv` | pedidos de opt-out (escopados) |
| GET/PATCH | `/api/v1/settings` · POST `/settings/panel-host/dns` | configurações (admin) |
| GET | `/api/v1/resolve/:codigo?host=&lead=` | o que um código (e um lead) faz hoje |
| GET | `/api/v1/stats` | visão geral (escopada) |

Exemplo (n8n → HTTP Request):

```json
POST /api/v1/links
{ "clientSlug": "clinica-sorriso", "destinationUrl": "https://wa.me/5511999990000", "label": "set/26" }
→ { "link": { "code": "k7m2pq", "url": "https://clinica.lumix10.cfd/k7m2pq", ... } }
```

**BM nova em uma chamada.** No lugar de `domainId`, mande `subdomain`: o HF cadastra
`<label>.<base>` na zona curinga (que já tem o `*` no DNS, então nasce pronto) e cria o link nele.
Se o domínio já existir e for do mesmo cliente, reaproveita — dá para chamar em lote sem verificar
antes o que já foi criado. O `label` aceita o nome da BM como está na planilha:

```json
POST /api/v1/links
{ "clientSlug": "bruno", "subdomain": { "label": "Driggo Restaurante", "base": "lumix11.cfd" },
  "destinationUrl": "https://atendimento.marketing/order/{lead}" }
→ { "link": { "url": "https://driggorestaurante.lumix11.cfd/k7m2pq", ... } }
```

Só administrador. `subdomain.provision: false` pula a checagem de alcance (1 request por BM), útil
ao criar centenas de uma vez.

## Teste ponta a ponta

Com o servidor rodando: `npm run smoke` (não toca na Cloudflare). Cobre login por e-mail, escopo do
cliente, zona curinga, mesmo código em domínios diferentes, impersonação, opt-outs e cliques.
Se já existe um admin no banco, passe `HF_SMOKE_EMAIL` e `HF_SMOKE_PASSWORD`.
