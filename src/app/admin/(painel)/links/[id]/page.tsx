import Link from "next/link";
import { notFound } from "next/navigation";
import { BarrasDiarias } from "@/components/Chart";
import { CopyButton } from "@/components/CopyButton";
import { LinkQuickActions } from "@/components/LinkActions";
import { LinkForm } from "@/components/LinkForm";
import { Badge, PageHeader, fmtData } from "@/components/ui";
import { escopo, requirePanelUser } from "@/lib/auth";
import { listClicks, serieDiaria } from "@/lib/stores/clicks";
import { listClients } from "@/lib/stores/clients";
import { listDomains } from "@/lib/stores/domains";
import { getLink, listEvents } from "@/lib/stores/links";

export const dynamic = "force-dynamic";

export default async function LinkPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { actor } = await requirePanelUser();
  const scope = escopo(actor);
  const admin = actor.role === "admin";
  const { id } = await params;
  const { page } = await searchParams;
  const link = await getLink(id, scope);
  if (!link) notFound();
  const [clients, domains, events, clicks, serie] = await Promise.all([
    admin ? listClients() : Promise.resolve([]),
    listDomains(scope),
    listEvents(link.id),
    listClicks(link.id, Math.max(1, Number(page ?? 1))),
    serieDiaria(14, link.id),
  ]);
  const totalPaginas = Math.max(1, Math.ceil(clicks.total / clicks.pageSize));

  return (
    <>
      <PageHeader
        title={`/${link.code}`}
        subtitle={link.url ?? "sem domínio"}
        actions={
          <>
            {link.url ? <CopyButton text={link.url} label="Copiar URL" small={false} /> : null}
            <Link href="/admin/links" className="btn">
              ← Links
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Configuração</h2>
            <LinkQuickActions link={link} />
          </div>
          <LinkForm link={link} clients={clients} domains={domains} role={actor.role} />
        </div>
        <div className="space-y-4">
          <div className="card">
            <h2 className="mb-1 text-sm font-semibold">Resumo</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Cliques</dt><dd className="tabular-nums">{link.clicksCount}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Último clique</dt><dd>{fmtData(link.lastClickAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Criado</dt><dd>{fmtData(link.createdAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Status</dt><dd>{link.active ? <Badge tone="ok">Ativo</Badge> : <Badge tone="warn">Pausado</Badge>}</dd></div>
            </dl>
          </div>
          <div className="card">
            <h2 className="mb-3 text-sm font-semibold">Cliques (14 dias)</h2>
            <BarrasDiarias serie={serie} />
          </div>
          <div className="card">
            <h2 className="mb-2 text-sm font-semibold">Histórico de alterações</h2>
            {events.length ? (
              <ul className="space-y-2 text-xs">
                {events.map((e) => (
                  <li key={e.id}>
                    <div className="flex justify-between gap-2 text-muted">
                      <span className="truncate" title={e.actor}>{e.action} · {e.actor}</span>
                      <span className="shrink-0">{fmtData(e.ts)}</span>
                    </div>
                    {e.detail ? <pre className="mono mt-0.5 whitespace-pre-wrap break-all text-[11px] text-muted/80">{formatarDetalhe(e.detail)}</pre> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted">Sem alterações.</p>
            )}
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <h2 className="text-sm font-semibold">Acessos ({clicks.total})</h2>
          {totalPaginas > 1 ? (
            <div className="flex items-center gap-2 text-xs text-muted">
              <span>Página {clicks.page}/{totalPaginas}</span>
              {clicks.page > 1 ? <Link className="btn btn-sm" href={`?page=${clicks.page - 1}`}>←</Link> : null}
              {clicks.page < totalPaginas ? <Link className="btn btn-sm" href={`?page=${clicks.page + 1}`}>→</Link> : null}
            </div>
          ) : null}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Resultado</th>
              <th>País</th>
              <th>Host</th>
              <th>Query</th>
              <th>Referer</th>
              <th>Navegador</th>
            </tr>
          </thead>
          <tbody>
            {clicks.items.map((c) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap text-muted">{fmtData(c.ts)}</td>
                <td><Badge tone={c.outcome === "redirect" ? "ok" : c.outcome === "bot" ? "muted" : "warn"}>{c.outcome}</Badge></td>
                <td>{c.country ?? "—"}</td>
                <td className="mono text-xs text-muted">{c.host ?? "—"}</td>
                <td className="mono max-w-[200px] truncate text-xs text-muted" title={c.query ?? ""}>{c.query ?? "—"}</td>
                <td className="max-w-[200px] truncate text-xs text-muted" title={c.referer ?? ""}>{c.referer ?? "—"}</td>
                <td className="max-w-[260px] truncate text-xs text-muted" title={c.ua ?? ""}>{c.ua ?? "—"}</td>
              </tr>
            ))}
            {!clicks.items.length ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted">
                  Nenhum acesso ainda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

function formatarDetalhe(detail: string): string {
  try {
    const d = JSON.parse(detail) as Record<string, unknown>;
    return Object.entries(d)
      .map(([k, v]) => {
        if (v && typeof v === "object" && "de" in (v as object)) {
          const { de, para } = v as { de: unknown; para: unknown };
          return `${k}: ${String(de ?? "—")} → ${String(para ?? "—")}`;
        }
        return `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`;
      })
      .join("\n");
  } catch {
    return detail;
  }
}
