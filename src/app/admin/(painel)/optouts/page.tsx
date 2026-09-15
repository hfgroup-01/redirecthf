import Link from "next/link";
import { Tr } from "@/components/motion";
import { OptOutDelete } from "@/components/OptOutDelete";
import { PageHeader, fmtData } from "@/components/ui";
import { escopo, requirePanelUser } from "@/lib/auth";
import { listOptOuts } from "@/lib/stores/optouts";

export const dynamic = "force-dynamic";

export default async function OptOutsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { actor } = await requirePanelUser();
  const { page } = await searchParams;
  const r = await listOptOuts(escopo(actor), Math.max(1, Number(page ?? 1)));
  const totalPaginas = Math.max(1, Math.ceil(r.total / r.pageSize));

  return (
    <>
      <PageHeader
        title="Opt-outs"
        subtitle={`${r.total} pedido(s) de "não receber mensagens" feitos pela página white${actor.role === "admin" ? "" : " dos seus domínios"}. Exporte e filtre no disparador.`}
        actions={
          <a className="btn" href="/api/v1/optouts?format=csv">
            Exportar CSV
          </a>
        }
      />
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Contato informado</th>
              <th>Lead (?l=)</th>
              <th>Código</th>
              <th>Site</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {r.items.map((o, i) => (
              <Tr key={o.id} i={i}>
                <td className="whitespace-nowrap text-muted">{fmtData(o.ts)}</td>
                <td className="mono">{o.contact ?? "—"}</td>
                <td className="mono">{o.lead ?? "—"}</td>
                <td className="mono">{o.code ? `/${o.code}` : "—"}</td>
                <td className="mono text-xs text-muted">{o.host ?? "—"}</td>
                <td>
                  <OptOutDelete id={o.id} />
                </td>
              </Tr>
            ))}
            {!r.items.length ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted">
                  Nenhum pedido ainda.
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
              <Link className="btn btn-sm" href={`/admin/optouts?page=${r.page - 1}`}>
                ← Anterior
              </Link>
            ) : null}
            {r.page < totalPaginas ? (
              <Link className="btn btn-sm" href={`/admin/optouts?page=${r.page + 1}`}>
                Próxima →
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
      {actor.role === "admin" ? (
        <p className="mt-4 text-xs text-muted">
          Integração: <code className="mono">GET /api/v1/optouts?format=csv</code> (ou JSON paginado sem o format) com a chave de API.
        </p>
      ) : null}
    </>
  );
}
