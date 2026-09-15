import Link from "next/link";
import { ClientRowActions, ClientSwitch } from "@/components/ClientActions";
import { ClientForm } from "@/components/ClientForm";
import { PageHeader } from "@/components/ui";
import { requirePanelAdmin } from "@/lib/auth";
import { ADMIN_SCOPE } from "@/lib/scope";
import { listClients } from "@/lib/stores/clients";
import { listDomains } from "@/lib/stores/domains";

export const dynamic = "force-dynamic";

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePanelAdmin();
  const { q } = await searchParams;
  const [clients, semDono] = await Promise.all([listClients(q), listDomains(ADMIN_SCOPE, { unassigned: true })]);

  return (
    <>
      <PageHeader title="Clientes" subtitle={`${clients.length} cliente(s). Cada cliente tem seus domínios, links e logins para acessar o painel.`} />

      <details className="card mb-6" open={clients.length === 0}>
        <summary className="cursor-pointer text-sm font-semibold">+ Novo cliente</summary>
        <div className="mt-4">
          <ClientForm domains={semDono} />
        </div>
      </details>

      <form className="mb-4 flex gap-2">
        <input className="input w-72" name="q" defaultValue={q ?? ""} placeholder="Buscar por nome, slug ou telefone…" />
        <button className="btn">Buscar</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Slug</th>
              <th>Domínio padrão</th>
              <th className="text-right">Domínios</th>
              <th className="text-right">Logins</th>
              <th className="text-right">Links</th>
              <th className="text-right">Cliques</th>
              <th>Links ativos</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/admin/clientes/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  {c.phone ? <div className="text-xs text-muted">{c.phone}</div> : null}
                </td>
                <td className="mono text-xs">{c.slug}</td>
                <td className="mono text-xs text-muted">{c.defaultDomainHostname ?? "—"}</td>
                <td className="text-right tabular-nums">{c.domainsCount}</td>
                <td className="text-right tabular-nums">{c.usersCount}</td>
                <td className="text-right tabular-nums">{c.linksCount}</td>
                <td className="text-right tabular-nums">{c.clicksCount}</td>
                <td>
                  <ClientSwitch client={c} />
                </td>
                <td>
                  <ClientRowActions client={c} />
                </td>
              </tr>
            ))}
            {!clients.length ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
