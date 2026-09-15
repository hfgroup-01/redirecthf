import Link from "next/link";
import { BarrasDiarias } from "@/components/Chart";
import { CopyButton } from "@/components/CopyButton";
import { Badge, PageHeader, Stat, fmtData, statusDominio } from "@/components/ui";
import { escopo, requirePanelUser } from "@/lib/auth";
import { ADMIN_SCOPE } from "@/lib/scope";
import { getClicksRetentionDays, getSettingsView } from "@/lib/settings";
import { overview, pruneClicks, type Overview } from "@/lib/stores/clicks";
import { listDomains } from "@/lib/stores/domains";
import { listWildcards } from "@/lib/stores/wildcards";

export const dynamic = "force-dynamic";

const g = globalThis as unknown as { __hfLastPrune?: number };

export default async function DashboardPage() {
  const { actor, user } = await requirePanelUser();
  if (actor.role !== "admin") return <InicioCliente clientId={actor.clientId!} nome={user.name ?? user.email} />;

  // Limpeza oportunista do log de cliques (1x por dia, ao abrir o dashboard).
  if (!g.__hfLastPrune || Date.now() - g.__hfLastPrune > 86_400_000) {
    g.__hfLastPrune = Date.now();
    try {
      await pruneClicks(await getClicksRetentionDays());
    } catch {
      /* ignora */
    }
  }

  const [o, s, wildcards] = await Promise.all([overview(ADMIN_SCOPE), getSettingsView(), listWildcards()]);
  const pendencias: { texto: string; href: string }[] = [];
  if (!s.dnsTargetValue) pendencias.push({ texto: "Definir para onde o DNS aponta (IP da VPS ou túnel)", href: "/admin/config" });
  if (!s.hasDefaultToken) pendencias.push({ texto: "Salvar o token padrão da Cloudflare", href: "/admin/config" });
  if (!s.panelHost) pendencias.push({ texto: "Definir o host do painel (para os clientes entrarem pela internet)", href: "/admin/config" });
  if (!wildcards.length) pendencias.push({ texto: "Cadastrar a zona curinga (ex.: lumix10.cfd) para os subdomínios das BMs", href: "/admin/dominios" });
  if (o.domainsTotal === 0) pendencias.push({ texto: "Adicionar o primeiro domínio de redirect", href: "/admin/dominios" });
  if (o.clientsTotal === 0) pendencias.push({ texto: "Cadastrar o primeiro cliente (e o login dele)", href: "/admin/clientes" });
  if (o.linksTotal === 0) pendencias.push({ texto: "Criar o primeiro link", href: "/admin/links" });

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Visão geral dos redirects." />

      {pendencias.length ? (
        <div className="card mb-6 border-accent/40">
          <h2 className="mb-2 text-sm font-semibold">Para começar</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {pendencias.map((p) => (
              <li key={p.texto}>
                <Link className="text-blue-300 hover:underline" href={p.href}>
                  {p.texto}
                </Link>
              </li>
            ))}
            <li className="text-muted">
              No template do WhatsApp, use o botão de URL dinâmica: <code className="mono">https://NOMEDABM.lumix10.cfd/{"{{1}}"}</code> e envie o código do link como variável.
            </li>
          </ol>
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cliques hoje" value={o.clicksToday} />
        <Stat label="Cliques 7 dias" value={o.clicks7d} sub={`${o.clicks30d} em 30 dias`} />
        <Stat label="Links ativos" value={o.linksActive} sub={`${o.linksTotal} no total · ${o.clientsTotal} clientes`} />
        <Stat label="Domínios no ar" value={o.domainsActive} sub={`${o.domainsTotal} cadastrados`} />
      </div>

      <GraficosETabelas o={o} />
    </>
  );
}

async function InicioCliente({ clientId, nome }: { clientId: string; nome: string }) {
  const scope = escopo({ kind: "user", role: "client", userId: null, email: null, clientId, impersonating: null, label: "" });
  const [o, domains] = await Promise.all([overview(scope), listDomains(scope)]);
  const pendencias: { texto: string; href: string }[] = [];
  if (!domains.length) pendencias.push({ texto: "Peça ao administrador para vincular um domínio (subdomínio da sua BM) ao seu acesso.", href: "/admin/dominios" });
  for (const d of domains) {
    if (!d.fbCode) pendencias.push({ texto: `Cole o código de verificação da Meta em ${d.hostname}`, href: `/admin/dominios/${d.id}` });
  }
  if (domains.length && o.linksTotal === 0) pendencias.push({ texto: "Crie o primeiro código de link e escolha para onde ele manda o lead", href: "/admin/links" });

  return (
    <>
      <PageHeader title="Início" subtitle={`Olá, ${nome}. Seus domínios, códigos e cliques.`} />

      {pendencias.length ? (
        <div className="card mb-6 border-accent/40">
          <h2 className="mb-2 text-sm font-semibold">Para começar</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {pendencias.map((p) => (
              <li key={p.texto}>
                <Link className="text-blue-300 hover:underline" href={p.href}>
                  {p.texto}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cliques hoje" value={o.clicksToday} />
        <Stat label="Cliques 7 dias" value={o.clicks7d} sub={`${o.clicks30d} em 30 dias`} />
        <Stat label="Links ativos" value={o.linksActive} sub={`${o.linksTotal} no total`} />
        <Stat label="Domínios no ar" value={o.domainsActive} sub={`${o.domainsTotal} vinculados`} />
      </div>

      <div className="card mb-6">
        <h2 className="mb-3 text-sm font-semibold">Seus domínios e a URL do template</h2>
        {domains.length ? (
          <ul className="space-y-2">
            {domains.map((d) => {
              const st = statusDominio(d.status);
              const url = `https://${d.hostname}/{{1}}`;
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-bg p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/dominios/${d.id}`} className="mono font-medium hover:underline">
                      {d.hostname}
                    </Link>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {d.redirectsEnabled ? <Badge tone="ok">ON</Badge> : <Badge tone="warn">OFF · página white</Badge>}
                    {d.fbCode ? <Badge tone="ok">meta tag</Badge> : <Badge tone="muted">sem meta tag</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="mono text-xs">{url}</code>
                    <CopyButton text={url} label="Copiar" />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nenhum domínio vinculado ao seu acesso ainda.</p>
        )}
        <p className="mt-3 text-xs text-muted">
          No botão do template do WhatsApp use <em>URL dinâmica</em> com essa URL; a variável {"{{1}}"} recebe o código do link. Você troca o destino de cada código em <Link href="/admin/links" className="text-blue-300 hover:underline">Meus links</Link>.
        </p>
      </div>

      <GraficosETabelas o={o} />
    </>
  );
}

function GraficosETabelas({ o }: { o: Overview }) {
  return (
    <>
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">Cliques por dia (14 dias)</h2>
          <BarrasDiarias serie={o.serie} altura={140} />
        </div>
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold">Top links (7 dias)</h2>
          {o.topLinks.length ? (
            <ul className="space-y-2 text-sm">
              {o.topLinks.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2">
                  <Link href={`/admin/links/${l.id}`} className="min-w-0 truncate hover:underline">
                    <span className="mono">/{l.code}</span>
                    <span className="ml-2 text-xs text-muted">{l.domainHostname ?? l.clientName ?? l.label ?? ""}</span>
                  </Link>
                  <span className="tabular-nums text-muted">{l.cliques}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Sem cliques ainda.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold">Últimos acessos</h2>
        {o.recentClicks.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Link</th>
                  <th>Cliente</th>
                  <th>Resultado</th>
                  <th>País</th>
                  <th>Host</th>
                  <th>Navegador</th>
                </tr>
              </thead>
              <tbody>
                {o.recentClicks.map((c) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap text-muted">{fmtData(c.ts)}</td>
                    <td>
                      <Link href={`/admin/links/${c.linkId}`} className="mono hover:underline">
                        /{c.code}
                      </Link>
                    </td>
                    <td>{c.clientName ?? "—"}</td>
                    <td>
                      <Badge tone={c.outcome === "redirect" ? "ok" : c.outcome === "bot" ? "muted" : "warn"}>{c.outcome}</Badge>
                    </td>
                    <td>{c.country ?? "—"}</td>
                    <td className="mono text-xs text-muted">{c.host ?? "—"}</td>
                    <td className="max-w-[260px] truncate text-xs text-muted" title={c.ua ?? ""}>
                      {c.ua ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">Nenhum acesso registrado.</p>
        )}
      </div>
    </>
  );
}
