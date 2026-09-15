# Deploy do HF na VPS (EasyPanel) com o túnel Cloudflare

Resultado: o HF roda 24h na VPS, o painel abre em `https://hfredirect.online/admin`, e todos os
subdomínios de BM (`*.lumix10.cfd`) chegam ao HF pelo **mesmo túnel** que hoje roda no PC.

## 0. O que você precisa ter em mãos

| item | onde pegar |
| --- | --- |
| `DATABASE_URL` | linha 9 do `C:\hfredirect\.env` (pooler 6543 do Supabase) |
| `HF_SECRET` | conteúdo de `C:\hfredirect\data\.secret` (obrigatório: cifra o token da Cloudflare e assina as sessões) |
| credenciais do túnel | `C:\Users\Hercules Ferreira\.cloudflared\20529d8f-a352-43ba-9656-b030a5ae142a.json` |
| repositório | GitHub privado com este projeto (EasyPanel builda pelo Dockerfile) |

Imprima os dois arquivos no PC (para colar no EasyPanel):

```powershell
Get-Content C:\hfredirect\data\.secret
Get-Content "C:\Users\Hercules Ferreira\.cloudflared\20529d8f-a352-43ba-9656-b030a5ae142a.json"
```

## 1. Supabase

O schema v3 já foi aplicado (Configurações → Banco de dados mostra "v3"). Nada a fazer.

## 2. Projeto `hf` no EasyPanel

### Serviço `hf` (App)

- **Source**: GitHub → repositório privado → branch `main` → Build: **Dockerfile** (na raiz).
- **Environment**:
  ```
  PORT=3100
  HF_DATA_DIR=/data
  DATABASE_URL=<do .env>
  HF_SECRET=<conteúdo de data/.secret>
  HF_ADMIN_HOST=hfredirect.online
  HF_ADMIN_EMAIL=<seu e-mail>            # opcional: cria o admin sozinho se o banco não tiver usuário
  HF_ADMIN_PASSWORD=<uma senha forte>    # idem
  ```
- **Mounts**: volume em `/data` (só para o caso de voltar ao SQLite; com Supabase fica vazio).
- **Domains**: nenhum (o tráfego entra pelo túnel, não pelo Traefik). Se quiser, adicione o
  domínio interno do EasyPanel só para ver o health, mas o painel só responde em `HF_ADMIN_HOST`
  e `localhost`.
- Porta interna: 3100. Anote o **hostname interno** do serviço (na aba Domains/Internal aparece algo
  como `hf_hf`).

### Serviço `cloudflared` (App, imagem Docker)

- **Image**: `cloudflare/cloudflared:latest`
- **Command**: `tunnel --config /etc/cloudflared/config.yml run`
- **Mounts → File**: dois arquivos
  1. `/etc/cloudflared/config.yml`:
     ```yaml
     tunnel: 20529d8f-a352-43ba-9656-b030a5ae142a
     credentials-file: /etc/cloudflared/credentials.json
     ingress:
       - service: http://hf_hf:3100
     ```
     (troque `hf_hf` pelo hostname interno do serviço `hf`, se for diferente)
  2. `/etc/cloudflared/credentials.json`: cole o conteúdo do JSON do túnel.
- Sem portas nem domínios.

Quando o `cloudflared` subir, o log mostra 4 linhas `Registered tunnel connection`. O túnel `hf`
passa a ter **dois conectores** (PC + VPS) enquanto o lançador do PC estiver aberto: os acessos
são distribuídos entre os dois. Isso é aceitável só durante a troca.

## 3. Host do painel: `hfredirect.online`

1. Cloudflare → Add a domain → `hfredirect.online` (plano Free) → troque os nameservers no
   registrador para os que a Cloudflare indicar. Espere ficar "Active".
2. No HF (ainda pelo PC, `http://localhost:3100/admin/config`): **Host do painel** =
   `hfredirect.online` → Salvar → **Provisionar DNS do painel** (cria `CNAME hfredirect.online →
   20529d8f-….cfargotunnel.com`, proxied, com flattening no apex).
3. Abra `https://hfredirect.online/admin`. Como `HF_ADMIN_HOST` também está no ambiente da VPS,
   as duas instâncias aceitam esse host.

## 4. Cutover (PC → VPS)

1. Confira `https://hfredirect.online/api/v1/health` (versão, `driver: pg`, `versao: 3`).
2. Feche a janela "HF Redirects" no PC. Repita `https://lumix10.cfd/hf/ping` e um código real: continua
   respondendo, agora só pela VPS.
3. Se algo der errado, abra o atalho do PC de novo: ele volta a atender pelo mesmo túnel.

## 5. Zona curinga e primeiro cliente

1. Domínios → Zonas curinga → Adicionar `lumix10.cfd`. O HF mostra o `* A` (IP de estacionamento)
   que existe hoje e pede confirmação → Substituir. Em 1–2 min o status vira "No ar".
2. Clientes → Novo cliente → depois, na página do cliente: **Logins do cliente** → criar login
   (copie a senha temporária e mande para o cliente).
3. Domínios → Adicionar subdomínio: nome da BM + `*.lumix10.cfd` + cliente dono + CNPJ.
4. O cliente entra em `https://hfredirect.online/admin`, cola o código da meta tag em "Meus domínios",
   cria o primeiro código em "Meus links" e usa `https://<bm>.lumix10.cfd/{{1}}` no template.

## 6. Atualizações

`git push` na `main` → EasyPanel rebuilda e reinicia o serviço `hf` (30–90 s). Antes de um deploy
que mude o banco, rode o `supabase/schema.sql` novo no SQL Editor (é idempotente).
