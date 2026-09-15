import { PasswordForm } from "@/components/AuthForms";
import { Badge, PageHeader, fmtData } from "@/components/ui";
import { requirePanelUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ContaPage() {
  const { user, actor } = await requirePanelUser();
  return (
    <>
      <PageHeader title="Minha conta" subtitle={user.email} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Acesso</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-muted">Nome</dt><dd>{user.name ?? "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">E-mail</dt><dd className="mono text-xs">{user.email}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Papel</dt><dd>{user.role === "admin" ? <Badge tone="accent">administrador</Badge> : <Badge tone="muted">cliente</Badge>}</dd></div>
            {user.clientName ? <div className="flex justify-between gap-2"><dt className="text-muted">Cliente</dt><dd>{user.clientName}</dd></div> : null}
            {actor.impersonating ? <div className="flex justify-between gap-2"><dt className="text-muted">Modo</dt><dd><Badge tone="warn">vendo como cliente</Badge></dd></div> : null}
            <div className="flex justify-between gap-2"><dt className="text-muted">Último acesso</dt><dd>{fmtData(user.lastLoginAt)}</dd></div>
          </dl>
        </div>
        <div className="card lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">Trocar senha</h2>
          <PasswordForm />
        </div>
      </div>
    </>
  );
}
