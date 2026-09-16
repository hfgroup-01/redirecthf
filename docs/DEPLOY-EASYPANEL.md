# Deploy do HF na VPS (EasyPanel)

Resultado final: o HF roda 24h na VPS. O **painel** entra pelo Traefik em
`https://hfredirect.lumix1.cfd/admin`, e os **sites das BMs** (`*.lumix10.cfd`) entram pelo
**túnel Cloudflare**, sem precisar cadastrar domínio nenhum no EasyPanel.

```
você ───────────► Traefik (EasyPanel) ──► crm_hfredirect:3100          (painel)
lead ──► Cloudflare ──► túnel "hf" ──► cloudflared ──► crm_hfredirect:3100   (redirects)
```

No EasyPanel: projeto **crm**, serviço **hfredirect**. O endereço interno do serviço é
`crm_hfredirect` e a porta é **3100** (aparece na lista de Domínios, à direita da seta).

## Estado atual

| Etapa | Situação |
|---|---|
| Supabase com o schema mais novo | **feito** (v5) |
| Serviço `hfredirect` no EasyPanel | **feito** — `https://hfredirect.lumix1.cfd/admin` responde |
| Serviço `cloudflared` no EasyPanel | **feito** (16/09/2026) — imagem construída de `docker/cloudflared.Dockerfile` |
| Desligar o HF do PC | **feito** — cutover conferido com o túnel do PC parado |

O PC não participa mais: painel, redirects e as 9 zonas curinga respondem pela VPS. O atalho
**HF Redirects** só serve como plano B se a VPS cair.

---

## 1. Copiar as credenciais do túnel

No PC, no PowerShell (copia para a área de transferência, sem aparecer na tela):

```powershell
Get-Content "C:\Users\Hercules Ferreira\.cloudflared\20529d8f-a352-43ba-9656-b030a5ae142a.json" | Set-Clipboard
```

É um JSON de uma linha com `AccountTag`, `TunnelSecret`, `TunnelID` e `Endpoint`. Guarde num bloco
de notas: você vai colar daqui a pouco. **Não** suba esse arquivo para o GitHub.

## 2. Criar o serviço `cloudflared`

No projeto **crm**: **+ Serviço → App**.

**Nome**: `cloudflared`

**Source** → aba **GitHub**: repositório `hfgroup-01/redirecthf`, branch `main`, e em **Build**
escolha **Dockerfile** com o caminho:

```
docker/cloudflared.Dockerfile
```

**Advanced → Command**: deixe **vazio**.

> **Por que não usar a imagem `cloudflare/cloudflared:latest` direto.** O EasyPanel não passa o
> campo Comando para o container: ele o envolve em `/bin/sh -c "..."` (dá para ver em
> `docker service inspect crm_cloudflared`, no campo `Command`). A imagem oficial do cloudflared é
> **distroless** — só o binário, sem `/bin/sh`. O container morre antes de o processo existir, sem
> escrever uma linha de log, e o Swarm fica reiniciando: status amarelo, aba de logs vazia.
> Deixar o Comando vazio também não serve, porque o `CMD` da imagem é `["version"]`: ele imprimiria
> a versão e sairia. Por isso o `docker/cloudflared.Dockerfile`, que põe os argumentos no
> `ENTRYPOINT` e dispensa o campo Comando.

**Mounts → Add Mount → File** (dois arquivos):

1. Caminho `/etc/cloudflared/config.yml`, conteúdo:

```yaml
tunnel: 20529d8f-a352-43ba-9656-b030a5ae142a
credentials-file: /etc/cloudflared/credentials.json
no-autoupdate: true
loglevel: info
ingress:
  - service: http://crm_hfredirect:3100
```

O ingress sem hostname é *catch-all*: qualquer domínio apontado para o túnel chega ao HF, sem
precisar mexer no túnel a cada BM nova.

> O serviço **precisa ser criado dentro do projeto `crm`**. O nome `crm_hfredirect` só é resolvido
> por containers da mesma rede; num projeto diferente o túnel conecta mas devolve 502 em tudo.

2. Caminho `/etc/cloudflared/credentials.json`, conteúdo: o JSON copiado no passo 1.

**Domínios**: nenhum. **Portas**: nenhuma. O serviço só faz conexão de saída.

Clique em **Implantar**.

## 3. Conferir

No log do serviço `cloudflared` devem aparecer quatro linhas:

```
Registered tunnel connection connIndex=0 ...
Registered tunnel connection connIndex=1 ...
Registered tunnel connection connIndex=2 ...
Registered tunnel connection connIndex=3 ...
```

Erros comuns:

| Log | Causa |
|---|---|
| `failed to sufficiently increase receive buffer size` | aviso normal do QUIC, pode ignorar |
| `Unauthorized: Failed to get tunnel` | o `credentials.json` foi colado errado ou incompleto |
| `dial tcp: lookup ...: no such host` | o nome no `ingress` está diferente de `crm_hfredirect`, ou o serviço foi criado fora do projeto `crm` |
| `connection refused` | o serviço `hfredirect` está parado ou fora da porta 3100 |
| `Cannot determine default origin certificate path` | o `--config` não chegou ou o `config.yml` não foi montado em `/etc/cloudflared/` |
| **status amarelo e nenhum log** | o campo Comando foi preenchido — a imagem não tem shell (seção 2). Confira com `docker service ps crm_cloudflared --no-trunc` na VPS: fica ciclando em `Preparing`/`Ready` sem chegar a `Running` |

**Diagnóstico pelo navegador**, sem abrir o log (teste com o HF do PC **fechado**):

| O que aparece em `https://lumix10.cfd/hf/ping` | Significa |
|---|---|
| erro 1033 (HTTP 530) | nenhum conector ativo — o container não sobe (loop de reinício) |
| erro 502 | o conector está de pé, mas não alcança `crm_hfredirect:3100` — é rede/nome/porta |
| `{"hf":true,...}` | funcionando |

Com o túnel de pé, ele passa a ter **dois conectores** (PC e VPS) e a Cloudflare divide os acessos
entre eles. Isso é normal durante a troca.

## 4. Desligar o HF do PC (cutover)

1. Feche a janela **HF Redirects** no PC.
2. Teste, pelo celular ou numa janela anônima:
   - `https://lumix10.cfd/hf/ping` → deve responder `{"hf":true,...}`
   - um link real de BM, ex. `https://babyburguerlanches.lumix10.cfd/CODIGO.ID`
   - `https://hfredirect.lumix1.cfd/admin` → painel
3. Deu problema? Reabra o atalho no PC: ele volta a atender pelo mesmo túnel enquanto você
   investiga.

Depois disso o PC pode ficar desligado. Não deixe os dois rodando o tempo todo: os caches do HF são
por processo, então duas instâncias podem demorar até 30 s para enxergar a mudança da outra.

## 5. Domínios do serviço `hfredirect`

| Domínio | Destino | Situação |
|---|---|---|
| `hfredirect.lumix1.cfd` | `crm_hfredirect:3100` | correto, é o painel |
| `crm-hfredirect.ck75vf.easypanel.host` | `crm_hfredirect:80` | porta errada (nada escuta na 80) e o host não está autorizado no painel: responde 502/404. Pode apagar |

## 6. Variáveis do serviço `hfredirect` (conferência)

```
PORT=3100
HF_DATA_DIR=/data
DATABASE_URL=<pooler 6543 do Supabase, igual ao .env do PC>
HF_SECRET=<conteúdo de C:\hfredirect\data\.secret>
HF_ADMIN_HOST=hfredirect.lumix1.cfd
```

O `HF_SECRET` precisa ser **o mesmo** do PC: é ele que decifra o token da Cloudflare guardado no
banco e assina os cookies de sessão. Para copiar:

```powershell
Get-Content C:\hfredirect\data\.secret | Set-Clipboard
```

`HF_ADMIN_HOST` é obrigatório: sem ele, o painel só abre em `localhost` e o domínio devolve 404.

**Se o `HF_SECRET` faltar**, o HF não avisa: ele gera um segredo novo em `/data/.secret` e sobe
normalmente. O sintoma aparece depois, ao usar qualquer coisa que dependa da Cloudflare — botão DNS
de domínio ou de zona curinga — na forma de `Unsupported state or unable to authenticate data`, que
é o AES-GCM recusando a chave errada. Os tokens no banco continuam íntegros; só essa instância não
os lê. Para conferir qual segredo o serviço está usando, sem expor o valor:

```bash
V=$(docker service inspect crm_hfredirect --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' | grep '^HF_SECRET=' | cut -d= -f2-)
echo "tamanho: ${#V}"; printf '%s' "$V" | sha256sum | cut -c1-12
```

Compare com o do PC (`node -e "..."` sobre `data/.secret`): tamanho **43** e o mesmo prefixo de
hash. `tamanho: 0` com hash `e3b0c44298fc` significa variável ausente.

## 7. Atualizações daqui pra frente

`git push` na `main` → no EasyPanel, **Implantar** no serviço `hfredirect` (30–90 s). Se a
atualização mexer no banco, rode antes o `supabase/schema.sql` novo no SQL Editor do Supabase (é
idempotente, pode rodar quantas vezes quiser).

O serviço `cloudflared` não precisa ser tocado nas atualizações.
