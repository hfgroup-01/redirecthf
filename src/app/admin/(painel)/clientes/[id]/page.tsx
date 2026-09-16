import Link from "next/link";
import { notFound } from "next/navigation";
import { BarrasDiarias } from "@/components/Chart";
import { ClientDeleteButton, ImpersonateButton } from "@/components/ClientActions";
import { ClientDomains } from "@/components/ClientDomains";
import { ClientForm } from "@/components/ClientForm";
import { BulkLinkActions, LinkQuickActions } from "@/components/LinkActions";
import { LinkForm } from "@/components/LinkForm";
import { Tr } from "@/components/motion";
import { Badge, PageHeader, fmtData } from "@/components/ui";
import { CreateUserForm, UsersTable } from "@/components/UserForms";
import { requirePanelAdmin } from "@/lib/auth";
import { ADMIN_SCOPE } from "@/lib/scope";
import { serieDiaria } from "@/lib/stores/clicks";
import { getClient, listClients } from "@/lib/stores/clients";
import { listDomains } from "@/lib/stores/domains";
import { listLinks } from "@/lib/stores/links";
import { listUsers } from "@/lib/stores/users";
import { listWildcards } from "@/lib/stores/wildcards";

export const dynamic = "force-dynamic";

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requirePanelAdmin();
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();
  const [domains, semDono, clients, users, linksPag, serie, wildcards] = await Promise.all([
    listDomains(ADMIN_SCOPE, { clientId: client.id }),
    listDomains(ADMIN_SCOPE, { unassigned: true }),
    listClients(),
    listUsers({ clientId: client.id }),
    listLinks({ clientId: client.id, pageSize: 200 }, ADMIN_SCOPE),
    serieDiaria(14, undefined, client.id),
    listWildcards(),
  ]);
  const links = linksPag.items;

  return (
    <>
      <PageHeader
        title={client.name}
        subtitle={`${domains.length} domínio(s) · ${users.length} login(s) · ${client.linksCount} link(s) · ${client.clicksCount} clique(s)`}
        actions={
          <>
            <ImpersonateButton client={client} />
            <ClientDeleteButton client={client} />
            <Link href="/admin/clientes" className="btn">
              ← Clientes
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">Editar cliente</h2>
          <ClientForm client={client} domains={[...domains, ...semDono]} />
        </div>
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold">Cliques (14 dias)</h2>
          <BarrasDiarias serie={serie} />
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-1 text-sm font-semibold">Domínios do cliente</h2>
          <p className="mb-3 text-xs text-muted">Só domínios vinculados aparecem no painel do cliente. Cada um tem a própria URL de template.</p>
          <ClientDomains client={client} domains={domains} unassigned={semDono} />
        </div>
        <div className="card">
          <h2 className="mb-1 text-sm font-semibold">Logins do cliente</h2>
          <p className="mb-3 text-xs text-muted">Quem entra no painel com o escopo deste cliente. A senha temporária aparece uma vez; no primeiro acesso a pessoa cria a definitiva.</p>
          <UsersTable users={users} meId={user.id} />
          <div className="mt-4 border-t border-border pt-4">
            <CreateUserForm role="client" clientId={client.id} />
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold">Novo link para este cliente</h2>
          <LinkForm clients={clients} domains={domains} wildcards={wildcards} defaultClientId={client.id} role="admin" />
        </div>
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold">Ações em massa</h2>
          {links.length ? <BulkLinkActions clientId={client.id} total={links.length} /> : <p className="text-sm text-muted">Sem links ainda.</p>}
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Código / URL</th>
              <th>Destino</th>
              <th>Modo</th>
              <th>Status</th>
              <th className="text-right">Cliques</th>
              <th>Último clique</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {links.map((l, i) => (
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
                <td className="max-w-[320px] truncate text-xs" title={l.destinationUrl ?? ""}>
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
            {!links.length ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted">
                  Nenhum link.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
