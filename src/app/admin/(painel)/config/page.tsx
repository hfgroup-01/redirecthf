import { ApiKeyPanel, DefaultTokenForm, DnsTargetForm, PageDefaultsForm, PanelHostForm, RetentionForm } from "@/components/SettingsForms";
import { Badge, PageHeader } from "@/components/ui";
import { CreateUserForm, UsersTable } from "@/components/UserForms";
import { requirePanelAdmin } from "@/lib/auth";
import { checkDatabase } from "@/lib/db";
import { HF_VERSION } from "@/lib/paths";
import { getSettingsView } from "@/lib/settings";
import { listUsers } from "@/lib/stores/users";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const { user } = await requirePanelAdmin();
  const [s, db, users] = await Promise.all([getSettingsView(), checkDatabase(), listUsers()]);

  return (
    <>
      <PageHeader title="Configurações" subtitle={`HF v${HF_VERSION} · instância ${s.instanceId}`} />

      <div className="space-y-6">
        <section className="card">
          <h2 className="mb-1 text-sm font-semibold">1. Para onde o DNS aponta</h2>
          <p className="mb-3 text-xs text-muted">
            Ao adicionar um domínio ou zona curinga, o HF cria na Cloudflare um registro <em>proxied</em> apontando para este servidor. Escolha como ele é alcançado.
          </p>
          <DnsTargetForm mode={s.dnsTargetMode} value={s.dnsTargetValue} />
          <details className="mt-4 text-xs text-muted">
            <summary className="cursor-pointer">Como expor o HF com Cloudflare Tunnel (PC local ou VPS sem porta aberta)</summary>
            <p className="mt-2">
              Atalho: na pasta do HF rode <code className="mono text-text">npm run tunnel:setup</code> (faz os passos 1 a 3 e imprime o alvo) e depois <code className="mono text-text">npm run tunnel</code>. Manual:
            </p>
            <pre className="mono mt-2 whitespace-pre-wrap rounded-md border border-border bg-bg p-3 text-[11px] text-text">{`# 1) Login e criação do túnel (uma vez)
cloudflared tunnel login
cloudflared tunnel create hf

# 2) Anote o ID do túnel (UUID) e use como alvo CNAME acima:
#    <UUID>.cfargotunnel.com

# 3) Config (%USERPROFILE%\\.cloudflared\\config.yml) com ingress catch-all:
tunnel: <UUID>
credentials-file: C:\\Users\\SEU_USUARIO\\.cloudflared\\<UUID>.json
ingress:
  - service: http://localhost:${process.env.PORT || 3100}

# 4) Rodar (ou instalar como serviço: cloudflared service install)
cloudflared tunnel run hf`}</pre>
            <p className="mt-2">Com o ingress sem hostname (catch-all), qualquer domínio cujo CNAME aponte para o túnel chega ao HF sem mexer no túnel de novo.</p>
          </details>
        </section>

        <section className="card">
          <h2 className="mb-1 text-sm font-semibold">2. Token da Cloudflare</h2>
          <DefaultTokenForm hasToken={s.hasDefaultToken} />
        </section>

        <section className="card">
          <h2 className="mb-1 text-sm font-semibold">3. Host do painel</h2>
          <p className="mb-3 text-xs text-muted">
            Onde este painel e a API respondem (além de localhost). É por aqui que os clientes entram. Em qualquer outro host o HF só serve páginas white, redirects ou 404.
          </p>
          <PanelHostForm host={s.panelHost} source={s.panelHostSource} />
        </section>

        <section className="card">
          <h2 className="mb-1 text-sm font-semibold">4. Chave de API (integrações: n8n, disparador)</h2>
          <ApiKeyPanel apiKey={s.apiKey} />
          <details className="mt-3 text-xs text-muted">
            <summary className="cursor-pointer">Exemplos de uso</summary>
            <pre className="mono mt-2 whitespace-pre-wrap rounded-md border border-border bg-bg p-3 text-[11px] text-text">{`# Criar link para um cliente (pelo slug) e receber a URL
curl -X POST https://${s.panelHost || "SEU-HF"}/api/v1/links \\
  -H "x-api-key: $HF_API_KEY" -H "content-type: application/json" \\
  -d '{"clientSlug":"clinica-sorriso","destinationUrl":"https://wa.me/5511999990000","label":"campanha set/26"}'

# Trocar o destino de um link (aceita id ou código; ?host= se o código existe em vários domínios)
curl -X PATCH "https://${s.panelHost || "SEU-HF"}/api/v1/links/abc123?host=clinica.lumix10.cfd" \\
  -H "x-api-key: $HF_API_KEY" -H "content-type: application/json" \\
  -d '{"destinationUrl":"https://site-do-cliente.com/agendar"}'

# Pausar todos os links de um cliente
curl -X POST https://${s.panelHost || "SEU-HF"}/api/v1/links/bulk \\
  -H "x-api-key: $HF_API_KEY" -H "content-type: application/json" \\
  -d '{"clientId":"cli_xxx","active":false}'

# Criar o subdomínio de uma BM (zona curinga) já vinculado ao cliente
curl -X POST https://${s.panelHost || "SEU-HF"}/api/v1/domains \\
  -H "x-api-key: $HF_API_KEY" -H "content-type: application/json" \\
  -d '{"label":"luiscomercioltda","base":"lumix10.cfd","clientId":"cli_xxx","cnpj":"00.000.000/0001-00"}'

# Listar / consultar
curl "https://${s.panelHost || "SEU-HF"}/api/v1/links?clientId=cli_xxx" -H "x-api-key: $HF_API_KEY"
curl "https://${s.panelHost || "SEU-HF"}/api/v1/resolve/abc123?host=clinica.lumix10.cfd" -H "x-api-key: $HF_API_KEY"`}</pre>
          </details>
        </section>

        <section className="card">
          <h2 className="mb-1 text-sm font-semibold">5. Página white padrão</h2>
          <p className="mb-3 text-xs text-muted">Conteúdo base para todos os domínios. Cada domínio pode sobrescrever campos; cada link pode sobrescrever título e texto.</p>
          <PageDefaultsForm value={s.pageDefaults} />
        </section>

        <section className="card">
          <h2 className="mb-1 text-sm font-semibold">6. Retenção do log de cliques</h2>
          <RetentionForm days={s.clicksRetentionDays} />
        </section>

        <section className="card">
          <h2 className="mb-1 text-sm font-semibold">7. Usuários</h2>
          <p className="mb-3 text-xs text-muted">Todos os logins: administradores e usuários de clientes. Logins de cliente são criados na página de cada cliente.</p>
          <UsersTable users={users} showRole meId={user.id} />
          <div className="mt-4 border-t border-border pt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Novo administrador</h3>
            <CreateUserForm role="admin" />
          </div>
        </section>

        <section className="card text-xs text-muted">
          <h2 className="mb-2 text-sm font-semibold text-text">Banco de dados</h2>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {db.driver === "pg" ? <Badge tone="accent">Supabase / Postgres</Badge> : <Badge tone="muted">SQLite local</Badge>}
            <span className="mono">{db.caminho}</span>
            {db.ok ? <Badge tone="ok">conectado</Badge> : <Badge tone="danger">erro</Badge>}
          </div>
          {db.erro ? <p className="mb-2 text-red-300">{db.erro}</p> : null}
          {db.driver === "sqlite" ? (
            <p className="mb-2">
              Para usar o Supabase: rode <code className="mono text-text">supabase/schema.sql</code> no SQL Editor, copie seus dados com <code className="mono text-text">npm run db:migrate</code> e defina <code className="mono text-text">DATABASE_URL</code> no <code className="mono text-text">.env</code>. Veja o README.
            </p>
          ) : null}
          <dl className="grid gap-1 sm:grid-cols-2">
            <div className="flex justify-between gap-2"><dt>Host do painel</dt><dd className="mono">{s.panelHost ? `${s.panelHost} (+ localhost)` : "só localhost"}</dd></div>
            <div className="flex justify-between gap-2"><dt>Schema</dt><dd>v{db.versao}</dd></div>
            {Object.entries(db.contagens).map(([t, n]) => (
              <div key={t} className="flex justify-between gap-2"><dt>{t}</dt><dd className="tabular-nums">{n}</dd></div>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}
