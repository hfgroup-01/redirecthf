import { Link2 } from "lucide-react";
import Link from "next/link";
import { LinkQuickActions } from "@/components/LinkActions";
import { LinkFilters } from "@/components/LinkFilters";
import { LinkForm } from "@/components/LinkForm";
import { Tr } from "@/components/motion";
import { Badge, EmptyState, PageHeader, fmtData } from "@/components/ui";
import { escopo, requirePanelUser } from "@/lib/auth";
import { listClients } from "@/lib/stores/clients";
import { listDomains } from "@/lib/stores/domains";
import { listLinks } from "@/lib/stores/links";

export const dynamic = "force-dynamic";

interface SP {
  clientId?: string;
  domainId?: string;
  active?: string;
  mode?: string;
  q?: string;
  page?: string;
}

export default async function LinksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { actor } = await requirePanelUser();
  const scope = escopo(actor);
  const admin = actor.role === "admin";
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const [r, clients, domains] = await Promise.all([
    listLinks(
      {
        clientId: sp.clientId || undefined,
        domainId: sp.domainId || undefined,
        q: sp.q || undefined,
        active: sp.active === "1" ? true : sp.active === "0" ? false : undefined,
        mode: sp.mode === "page" || sp.mode === "redirect" ? sp.mode : undefined,
        page,
        pageSize: 50,
      },
      scope
    ),
    admin ? listClients() : Promise.resolve([]),
    listDomains(scope),
  ]);
  const totalPaginas = Math.max(1, Math.ceil(r.total / r.pageSize));
  const qs = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") u.set(k, v);
    u.set("page", String(p));
    return `/admin/links?${u.toString()}`;
  };

  return (
    <>
      <PageHeader
        title={admin ? "Links" : "Meus links"}
        subtitle={`${r.total} link(s). Cada link é um código no seu domínio; o destino pode ser trocado a qualquer hora sem mudar a URL enviada.`}
      />

      <details className="card mb-6" open={r.total === 0}>
        <summary className="cursor-pointer text-sm font-semibold">+ Novo link</summary>
        <div className="mt-4">
          <LinkForm clients={clients} domains={domains} role={actor.role} defaultClientId={scope.clientId ?? undefined} />
        </div>
      </details>

      <div className="mb-4">
        <LinkFilters
          clients={clients}
          domains={domains}
          role={actor.role}
          atual={{ clientId: sp.clientId, domainId: sp.domainId, active: sp.active, mode: sp.mode, q: sp.q }}
        />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Código / URL</th>
              {admin ? <th>Cliente</th> : null}
              <th>Destino</th>
              <th>Modo</th>
              <th>Status</th>
              <th className="text-right">Cliques</th>
              <th>Último</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {r.items.map((l, i) => (
              <Tr key={l.id} i={i}>
                <td>
                  <Link href={`/admin/links/${l.id}`} className="mono font-medium hover:underline">
                    /{l.code}
                  </Link>
                  <div className="mono max-w-[260px] truncate text-xs text-muted" title={l.url ?? ""}>
                    {l.url ?? "sem domínio"}
                  </div>
                  {l.label ? <div className="text-xs text-muted">{l.label}</div> : null}
                </td>
                {admin ? (
                  <td>
                    {l.clientId ? (
                      <Link href={`/admin/clientes/${l.clientId}`} className="hover:underline">
                        {l.clientName}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                ) : null}
                <td className="max-w-[280px] truncate text-xs" title={l.destinationUrl ?? ""}>
                  {l.destinationUrl ?? <span className="text-muted">—</span>}
                </td>
                <td>{l.mode === "redirect" ? <Badge tone="accent">redirect</Badge> : <Badge tone="muted">página</Badge>}</td>
                <td>{l.active ? <Badge tone="ok">Ativo</Badge> : <Badge tone="warn">Pausado</Badge>}</td>
                <td className="text-right tabular-nums">{l.clicksCount}</td>
                <td className="whitespace-nowrap text-xs text-muted">{fmtData(l.lastClickAt)}</td>
                <td>
                  <LinkQuickActions link={l} />
                </td>
              </Tr>
            ))}
            {!r.items.length ? (
              <tr>
                <td colSpan={admin ? 8 : 7}>
                  <EmptyState icon={<Link2 size={18} />} title="Nenhum link encontrado" text="Crie um link acima ou ajuste os filtros." />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            Página {r.page} de {totalPaginas}
          </span>
          <div className="flex gap-2">
            {r.page > 1 ? (
              <Link className="btn btn-sm" href={qs(r.page - 1)}>
                ← Anterior
              </Link>
            ) : null}
            {r.page < totalPaginas ? (
              <Link className="btn btn-sm" href={qs(r.page + 1)}>
                Próxima →
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
