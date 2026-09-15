import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";
import { DomainActions, DomainEditor, DomainSwitch } from "@/components/DomainForms";
import { Badge, PageHeader, fmtData, statusDominio } from "@/components/ui";
import { escopo, requirePanelUser } from "@/lib/auth";
import { getPageDefaults } from "@/lib/settings";
import { listClients } from "@/lib/stores/clients";
import { getDomain } from "@/lib/stores/domains";

export const dynamic = "force-dynamic";

export default async function DominioPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requirePanelUser();
  const admin = actor.role === "admin";
  const { id } = await params;
  const [domain, pageDefaults, clients] = await Promise.all([getDomain(id, escopo(actor)), getPageDefaults(), admin ? listClients() : Promise.resolve([])]);
  if (!domain) notFound();
  const st = statusDominio(domain.status);
  const urlTemplate = `https://${domain.hostname}/{{1}}`;

  return (
    <>
      <PageHeader
        title={domain.hostname}
        subtitle={`${domain.linksCount ?? 0} link(s) neste domínio${domain.clientName ? ` · cliente: ${domain.clientName}` : ""}${domain.wildcardBase ? ` · via *.${domain.wildcardBase}` : ""}`}
        actions={
          <Link href="/admin/dominios" className="btn">
            ← Domínios
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Chave do site</h2>
          <DomainSwitch domain={domain} size="md" />
          <p className="mt-2 text-xs text-muted">ON: os códigos deste domínio redirecionam para o destino de cada link. OFF: todo mundo vê a página white (o template continua válido).</p>
          <h2 className="mb-2 mt-4 text-sm font-semibold">Status</h2>
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge tone={st.tone}>{st.label}</Badge>
            {domain.fbCode ? <Badge tone="ok">meta tag publicada</Badge> : <Badge tone="muted">sem meta tag</Badge>}
          </div>
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between gap-2"><dt className="text-muted">DNS</dt><dd className="mono text-right">{domain.dnsType ? `${domain.dnsType} → ${domain.dnsTarget}` : "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Zona</dt><dd className="mono">{domain.zoneName ?? "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Checado em</dt><dd>{fmtData(domain.lastCheckAt)}</dd></div>
          </dl>
          {domain.lastError ? <p className="mt-2 text-xs text-red-300">{domain.lastError}</p> : null}
          <div className="mt-3">
            <DomainActions domain={domain} role={actor.role} />
          </div>
        </div>
        <div className="card lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold">Fluxo: verificar o domínio na BM e usar no template</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>
              Na BM, adicione o domínio <code className="mono text-text">{domain.hostname}</code>, escolha <em>Meta-tag</em>, cole o código abaixo em "Verificação do Facebook" e salve.
            </li>
            <li>
              Clique em <em>Meta tag</em> (ao lado) para conferir que a tag está no ar; depois clique em <em>Verificar</em> na BM.
            </li>
            <li>
              No botão de URL do template use <em>URL dinâmica</em>: <code className="mono text-text">{urlTemplate}</code> <CopyButton text={urlTemplate} />
            </li>
            <li>
              Deixe a chave em <strong>OFF</strong> enquanto o template está em análise (o revisor vê a página white). Aprovado, ligue em <strong>ON</strong>.
            </li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="btn btn-sm" href={`https://${domain.hostname}/`} target="_blank" rel="noreferrer">
              Abrir site ↗
            </a>
            <a className="btn btn-sm" href={`https://${domain.hostname}/hf/ping`} target="_blank" rel="noreferrer">
              Testar /hf/ping ↗
            </a>
          </div>
        </div>
      </div>

      <DomainEditor domain={domain} pageDefaults={pageDefaults} role={actor.role} clients={clients} />
    </>
  );
}
