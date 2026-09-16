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
| Serviço `cloudflared` no EasyPanel | **falta** — é o que este guia detalha |
| Desligar o HF do PC | depois do `cloudflared` |

Enquanto o `cloudflared` não subir na VPS, os links `*.lumix10.cfd` dependem do PC ligado com o
atalho **HF Redirects** aberto. O painel já não depende.

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

**Source** → aba **Docker Image**:

```
cloudflare/cloudflared:latest
```

**Advanced → Command** (o `cloudflared` já é o executável da imagem; aqui vão só os argumentos):

```
tunnel --config /etc/cloudflared/config.yml run
```

> Se o log acusar comando desconhecido, troque por
> `cloudflared tunnel --config /etc/cloudflared/config.yml run`.

**Mounts → Add Mount → File** (dois arquivos):

1. Caminho `/etc/cloudflared/config.yml`, conteúdo:

```yaml
tunnel: 20529d8f-a352-43ba-9656-b030a5ae142a
credentials-file: /etc/cloudflared/credentials.json
ingress:
  - service: http://crm_hfredirect:3100
```

O ingress sem hostname é *catch-all*: qualquer domínio apontado para o túnel chega ao HF, sem
precisar mexer no túnel a cada BM nova.

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
| `dial tcp: lookup ...: no such host` | o nome no `ingress` está diferente de `crm_hfredirect` |
| `connection refused` | o serviço `hfredirect` está parado ou fora da porta 3100 |

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

## 7. Atualizações daqui pra frente

`git push` na `main` → no EasyPanel, **Implantar** no serviço `hfredirect` (30–90 s). Se a
atualização mexer no banco, rode antes o `supabase/schema.sql` novo no SQL Editor do Supabase (é
idempotente, pode rodar quantas vezes quiser).

O serviço `cloudflared` não precisa ser tocado nas atualizações.
