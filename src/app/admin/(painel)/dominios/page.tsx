import Link from "next/link";
import { DomainActions, DomainCreateForm, DomainSwitch } from "@/components/DomainForms";
import { Badge, PageHeader, fmtData, statusDominio } from "@/components/ui";
import { WildcardActions, WildcardCreateForm } from "@/components/WildcardForms";
import { escopo, requirePanelUser } from "@/lib/auth";
import { getSettingsView } from "@/lib/settings";
import { listClients } from "@/lib/stores/clients";
import { listDomains } from "@/lib/stores/domains";
import { listWildcards } from "@/lib/stores/wildcards";

export const dynamic = "force-dynamic";

export default async function DominiosPage() {
  const { actor } = await requirePanelUser();
  const admin = actor.role === "admin";
  const scope = escopo(actor);
  const [domains, s, wildcards, clients] = await Promise.all([
    listDomains(scope),
    admin ? getSettingsView() : null,
    admin ? listWildcards() : Promise.resolve([]),
    admin ? listClients() : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={admin ? "Domínios / sites" : "Meus domínios"}
        subtitle={
          admin
            ? "Cada subdomínio de BM vira um site: página white com a meta tag do Facebook, e uma chave ON/OFF que decide se os códigos redirecionam."
            : "Cada domínio é a raiz dos seus links: https://<domínio>/{{1}} no template. Edite a página white e a meta tag da Meta em cada um."
        }
      />

      {admin && s && (!s.dnsTargetValue || !s.hasDefaultToken) ? (
        <div className="card mb-6 border-warn/40 text-sm">
          <strong>Antes de adicionar domínios:</strong>{" "}
          {!s.dnsTargetValue ? "defina para onde o DNS aponta (IP da VPS ou túnel)" : null}
          {!s.dnsTargetValue && !s.hasDefaultToken ? " e " : null}
          {!s.hasDefaultToken ? "salve um token padrão da Cloudflare (ou informe por domínio)" : null} em{" "}
          <Link href="/admin/config" className="text-blue-300 hover:underline">
            Configurações
          </Link>
          .
        </div>
      ) : null}

      {admin && s ? (
        <div className="card mb-6">
          <h2 className="mb-1 text-sm font-semibold">Zonas curinga (*.zona → HF)</h2>
          <p className="mb-3 text-xs text-muted">
            Uma vez por zona: o HF cria o registro <code className="mono">*</code> proxied. Depois, cada subdomínio de BM nasce sem chamada à Cloudflare, na hora. Só a raiz da zona (1 nível de subdomínio).
          </p>
          {wildcards.length ? (
            <div className="mb-4 overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Zona</th>
                    <th>Status</th>
                    <th>DNS</th>
                    <th className="text-right">Domínios</th>
                    <th>Checado</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {wildcards.map((w) => {
                    const st = statusDominio(w.status);
                    return (
                      <tr key={w.id}>
                        <td className="mono font-medium">*.{w.baseHostname}{w.lastError ? <div className="max-w-[320px] truncate text-xs text-red-300" title={w.lastError}>{w.lastError}</div> : null}</td>
                        <td><Badge tone={st.tone}>{st.label}</Badge></td>
                        <td className="mono text-xs text-muted">{w.dnsType ? `${w.dnsType} → ${w.dnsTarget}` : "—"}</td>
                        <td className="text-right tabular-nums">{w.domainsCount ?? 0}</td>
                        <td className="whitespace-nowrap text-xs text-muted">{fmtData(w.lastCheckAt)}</td>
                        <td><WildcardActions wildcard={w} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          <details open={wildcards.length === 0}>
            <summary className="cursor-pointer text-sm font-semibold">+ Adicionar zona curinga</summary>
            <div className="mt-3">
              <WildcardCreateForm hasDefaultToken={s.hasDefaultToken} dnsTargetValue={s.dnsTargetValue} />
            </div>
          </details>
        </div>
      ) : null}

      {admin && s ? (
        <details className="card mb-6" open={domains.length === 0}>
          <summary className="cursor-pointer text-sm font-semibold">+ Adicionar subdomínio / site</summary>
          <div className="mt-4">
            <DomainCreateForm hasDefaultToken={s.hasDefaultToken} dnsTargetValue={s.dnsTargetValue} wildcards={wildcards} clients={clients} />
          </div>
        </details>
      ) : null}

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Site</th>
              {admin ? <th>Cliente</th> : null}
              <th>Redirect</th>
              <th>Status</th>
              <th>Meta tag FB</th>
              <th>Empresa</th>
              <th className="text-right">Links</th>
              <th>Checado</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {domains.map((d) => {
              const st = statusDominio(d.status);
              return (
                <tr key={d.id}>
                  <td>
                    <Link href={`/admin/dominios/${d.id}`} className="mono font-medium hover:underline">
                      {d.hostname}
                    </Link>
                    {d.wildcardBase ? <div className="text-[11px] text-muted">via *.{d.wildcardBase}</div> : null}
                    {!d.active ? <div className="text-xs text-warn">inativo</div> : null}
                    {d.lastError ? (
                      <div className="max-w-[300px] truncate text-xs text-red-300" title={d.lastError}>
                        {d.lastError}
                      </div>
                    ) : null}
                  </td>
                  {admin ? (
                    <td className="text-xs">
                      {d.clientId ? (
                        <Link href={`/admin/clientes/${d.clientId}`} className="hover:underline">
                          {d.clientName}
                        </Link>
                      ) : (
                        <span className="text-muted">sem dono</span>
                      )}
                    </td>
                  ) : null}
                  <td>
                    <DomainSwitch domain={d} />
                  </td>
                  <td>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </td>
                  <td>{d.fbCode ? <Badge tone="ok">publicada</Badge> : <Badge tone="muted">sem código</Badge>}</td>
                  <td className="max-w-[220px] truncate text-xs" title={d.pageConfig.companyName ?? ""}>
                    {d.pageConfig.companyName ?? <span className="text-muted">padrão</span>}
                    {d.cnpj ? <div className="mono text-[11px] text-muted">{d.cnpj}</div> : null}
                  </td>
                  <td className="text-right tabular-nums">{d.linksCount ?? 0}</td>
                  <td className="whitespace-nowrap text-xs text-muted">{fmtData(d.lastCheckAt)}</td>
                  <td>
                    <DomainActions domain={d} compact role={actor.role} />
                  </td>
                </tr>
              );
            })}
            {!domains.length ? (
              <tr>
                <td colSpan={admin ? 9 : 8} className="py-8 text-center text-muted">
                  {admin ? "Nenhum domínio cadastrado." : "Nenhum domínio vinculado ao seu acesso. Fale com o administrador."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
