"use client";

import { Download, FileSpreadsheet, Search, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { CopyButton } from "@/components/CopyButton";
import { Field, Msg } from "@/components/ui";
import { parseCsv, sugerirColunas } from "@/lib/csv";
import { temMarcadorLead } from "@/lib/leads";
import type { LeadTarget, Link } from "@/lib/types";

interface Resumo {
  recebidos: number;
  gravados: number;
  semLead: number;
  urlInvalida: number;
  duplicadosNoArquivo: number;
  exemplosErro: string[];
}

interface Lista {
  items: LeadTarget[];
  total: number;
  page: number;
  pageSize: number;
  totalNoLink: number;
}

type Modo = "gerar" | "existente";

/**
 * Card "Leads deste link": sobe a planilha com a coluna do link de cada lead,
 * o HF gera um id por lead e devolve a planilha pronta para o disparo.
 */
export function LeadTargets({ link, total }: { link: Link; total: number }) {
  const router = useRouter();
  const destinoTemMarcador = temMarcadorLead(link.destinationUrl);
  const [modo, setModo] = useState<Modo>("gerar");
  const [file, setFile] = useState<File | null>(null);
  const [header, setHeader] = useState<string[]>([]);
  const [urlCol, setUrlCol] = useState("");
  const [refCol, setRefCol] = useState("");
  const [leadCol, setLeadCol] = useState("");
  const [semUrl, setSemUrl] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro" | "info"; texto: string } | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<Lista | null>(null);

  const exemploId = "k7m2pq4xv9tz";
  const exemploVar = `${link.code}.${exemploId}`;
  const exemploUrl = link.domainHostname ? `https://${link.domainHostname}/${exemploVar}` : exemploVar;

  const carregar = useCallback(
    async (page = 1, busca = q) => {
      try {
        const r = await api<Lista>(`/api/v1/links/${link.id}/targets?page=${page}&q=${encodeURIComponent(busca)}`);
        setLista(r);
      } catch (e) {
        setMsg({ tipo: "erro", texto: (e as Error).message });
      }
    },
    [link.id, q]
  );

  useEffect(() => {
    if (total > 0) void carregar(1, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const escolherArquivo = async (f: File | null) => {
    setFile(f);
    setResumo(null);
    setAvisos([]);
    setMsg(null);
    setHeader([]);
    if (!f) return;
    const amostra = await f.slice(0, 128 * 1024).text();
    const csv = parseCsv(amostra, { max: 21 });
    const h = csv.header;
    setHeader(h);
    const sug = sugerirColunas(h, csv.rows.slice(1));
    setUrlCol(sug.url >= 0 ? h[sug.url] : "");
    setRefCol(sug.lead >= 0 && sug.lead !== sug.url ? h[sug.lead] : "");
    setLeadCol(sug.lead >= 0 ? h[sug.lead] : "");
    setSemUrl(sug.url < 0);
    if (sug.url < 0 && modo === "gerar") setModo("existente");
  };

  const enviar = async () => {
    if (!file) return;
    setOcupado("import");
    setMsg(null);
    setResumo(null);
    setAvisos([]);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("modo", modo);
      if (modo === "gerar") {
        fd.append("urlColumn", urlCol);
        if (refCol) fd.append("refColumn", refCol);
      } else {
        fd.append("leadColumn", leadCol);
        if (semUrl) fd.append("semUrl", "1");
        else fd.append("urlColumn", urlCol);
      }
      const res = await fetch(`/api/v1/links/${link.id}/targets/import?retorno=csv`, { method: "POST", body: fd, credentials: "same-origin" });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const cab = res.headers.get("x-hf-resumo");
      const meta = cab ? (JSON.parse(decodeURIComponent(cab)) as { resumo: Resumo; avisos?: string[] }) : null;
      const r = meta?.resumo ?? { recebidos: 0, gravados: 0, semLead: 0, urlInvalida: 0, duplicadosNoArquivo: 0, exemplosErro: [] };
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${link.code}-hf.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setResumo(r);
      setAvisos(meta?.avisos ?? []);
      setMsg({
        tipo: "ok",
        texto: `${r.gravados.toLocaleString("pt-BR")} lead(s) prontos. A planilha com hf_var e hf_url foi baixada: use a coluna hf_var como {{1}} no disparo.`,
      });
      setFile(null);
      setHeader([]);
      router.refresh();
      void carregar(1, "");
    } catch (e) {
      setMsg({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setOcupado(null);
    }
  };

  const limpar = async () => {
    if (!confirm(`Apagar TODOS os ${(lista?.totalNoLink ?? total).toLocaleString("pt-BR")} leads deste link? Os links já enviados param de direcionar e caem no destino padrão.`)) return;
    setOcupado("clear");
    try {
      await api(`/api/v1/links/${link.id}/targets`, { method: "DELETE" });
      setLista(null);
      setMsg({ tipo: "ok", texto: "Leads apagados." });
      router.refresh();
    } catch (e) {
      setMsg({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setOcupado(null);
    }
  };

  const totalAtual = lista?.totalNoLink ?? total;
  const paginas = lista ? Math.max(1, Math.ceil(lista.total / lista.pageSize)) : 1;
  const pronto =
    Boolean(file) && ocupado === null && (modo === "gerar" ? Boolean(urlCol) : Boolean(leadCol) && (semUrl || (Boolean(urlCol) && urlCol !== leadCol)));

  const seletor = (label: string, hint: string, valor: string, set: (v: string) => void, opcional = false) => (
    <Field label={label} hint={hint}>
      <select className="input" value={valor} onChange={(e) => set(e.target.value)}>
        <option value="">{opcional ? "— nenhuma —" : "— escolha —"}</option>
        {header.map((h, i) => (
          <option key={i} value={h}>
            {h || `(coluna ${i + 1})`}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Leads deste link (planilha)</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
            Suba a lista com o link de destino de cada lead. O HF gera um id por lead, guarda o direcionamento e devolve a planilha com as colunas{" "}
            <code className="mono text-text">hf_var</code> (o valor de <code className="mono text-text">{"{{1}}"}</code>) e <code className="mono text-text">hf_url</code>. Quem clicar cai
            direto na página dele.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge border-accent/40 bg-accent/10 text-blue-300">{totalAtual.toLocaleString("pt-BR")} lead(s)</span>
          {totalAtual > 0 ? (
            <>
              <a className="btn btn-sm" href={`/api/v1/links/${link.id}/targets/export`}>
                <Download size={13} /> Exportar
              </a>
              <button type="button" className="btn btn-sm btn-danger" disabled={ocupado !== null} onClick={() => void limpar()} title="Apagar todos os leads" aria-label="Apagar todos os leads">
                <Trash2 size={13} />
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Planilha (CSV)" hint="Vírgula, ponto e vírgula ou tab; até 40 MB / 250 mil linhas por arquivo.">
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="input cursor-pointer file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-panel-2 file:px-3 file:py-1 file:text-xs file:font-medium file:text-text"
              onChange={(e) => void escolherArquivo(e.target.files?.[0] ?? null)}
            />
          </Field>

          {header.length ? (
            <>
              <fieldset className="space-y-2">
                <legend className="label">O id de cada lead</legend>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-bg p-2.5 text-sm has-[:checked]:border-accent/50 has-[:checked]:bg-accent/5">
                  <input type="radio" className="mt-0.5" checked={modo === "gerar"} onChange={() => setModo("gerar")} />
                  <span>
                    <span className="font-medium">O HF gera (recomendado)</span>
                    <span className="mt-0.5 block text-xs text-muted">Id opaco de 12 caracteres por linha. Nenhum telefone aparece na URL.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-bg p-2.5 text-sm has-[:checked]:border-accent/50 has-[:checked]:bg-accent/5">
                  <input type="radio" className="mt-0.5" checked={modo === "existente"} onChange={() => setModo("existente")} />
                  <span>
                    <span className="font-medium">Usar uma coluna da planilha</span>
                    <span className="mt-0.5 block text-xs text-muted">O telefone/id da lista vira o identificador na URL.</span>
                  </span>
                </label>
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2">
                {modo === "gerar" ? (
                  <>
                    {seletor("Coluna do link de destino", "Para onde cada lead deve ir.", urlCol, setUrlCol)}
                    {seletor("Coluna de referência (opcional)", "Telefone ou nome, só para você achar o lead no painel.", refCol, setRefCol, true)}
                  </>
                ) : (
                  <>
                    {seletor("Coluna do identificador", "O valor que vai na URL do lead.", leadCol, setLeadCol)}
                    {!semUrl ? seletor("Coluna do link de destino", "Para onde cada lead deve ir.", urlCol, setUrlCol) : null}
                  </>
                )}
              </div>

              {modo === "existente" ? (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={semUrl} onChange={(e) => setSemUrl(e.target.checked)} />
                  <span>
                    A planilha não tem coluna de link
                    <span className="mt-0.5 block text-xs text-muted">
                      O destino vem do <code className="mono text-text">{"{lead}"}</code> na URL do link.
                      {link.mode === "redirect" ? (destinoTemMarcador ? <span className="ml-1 text-green-300">Seu destino já tem {"{lead}"}.</span> : <span className="ml-1 text-amber-300">Falta {"{lead}"} na URL de destino.</span>) : null}
                    </span>
                  </span>
                </label>
              ) : null}
            </>
          ) : null}

          {msg ? <Msg tipo={msg.tipo}>{msg.texto}</Msg> : null}
          {avisos.map((a) => (
            <Msg key={a} tipo="info">
              {a}
            </Msg>
          ))}
          {resumo ? (
            <div className="rounded-md border border-border bg-bg p-3 text-xs text-muted">
              <div>
                Linhas <strong className="text-text">{resumo.recebidos.toLocaleString("pt-BR")}</strong> · prontas <strong className="text-text">{resumo.gravados.toLocaleString("pt-BR")}</strong>
                {resumo.duplicadosNoArquivo ? ` · repetidos ${resumo.duplicadosNoArquivo}` : ""}
                {resumo.semLead ? ` · sem identificador ${resumo.semLead}` : ""}
                {resumo.urlInvalida ? ` · link inválido ${resumo.urlInvalida}` : ""}
              </div>
              {resumo.exemplosErro.length ? <ul className="mt-1 list-disc pl-4">{resumo.exemplosErro.map((e) => <li key={e}>{e}</li>)}</ul> : null}
            </div>
          ) : null}
          <button type="button" className="btn btn-primary" disabled={!pronto} onClick={() => void enviar()}>
            <Upload size={14} /> {ocupado === "import" ? "Processando…" : "Subir lista e gerar links"}
          </button>
        </div>

        <div className="space-y-3">
          <div className="rounded-md border border-border bg-bg p-3 text-xs">
            <div className="mb-1 font-semibold uppercase tracking-wider text-muted">Como fica no disparo</div>
            <ol className="list-decimal space-y-1 pl-4 text-muted">
              <li>
                Botão do template: <code className="mono break-all text-text">https://{link.domainHostname ?? "SEU-DOMINIO"}/{"{{1}}"}</code>
              </li>
              <li>
                Coluna <code className="mono text-text">hf_var</code> da planilha devolvida vira o <code className="mono text-text">{"{{1}}"}</code> de cada lead, ex.:{" "}
                <code className="mono break-all text-text">{exemploVar}</code> <CopyButton text={exemploVar} label="Copiar" />
              </li>
              <li className="break-all">
                O lead abre <span className="mono">{exemploUrl}</span> e cai no link dele.
              </li>
            </ol>
          </div>

          {totalAtual > 0 ? (
            <>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void carregar(1, q);
                }}
              >
                <input className="input" placeholder="Buscar id, referência ou link…" value={q} onChange={(e) => setQ(e.target.value)} />
                <button className="btn shrink-0" aria-label="Buscar">
                  <Search size={14} />
                </button>
              </form>
              {lista ? (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Id</th>
                        <th>Referência</th>
                        <th>Destino</th>
                        <th className="text-right">Cliques</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.items.map((t) => (
                        <tr key={t.id}>
                          <td className="mono whitespace-nowrap text-xs">{t.lead}</td>
                          <td className="mono max-w-[130px] truncate text-xs text-muted" title={t.ref ?? ""}>
                            {t.ref ?? "—"}
                          </td>
                          <td className="max-w-[220px] truncate text-xs" title={t.destinationUrl}>
                            {t.destinationUrl}
                          </td>
                          <td className="text-right tabular-nums">{t.clicksCount}</td>
                        </tr>
                      ))}
                      {!lista.items.length ? (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-xs text-muted">
                            Nada encontrado.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                  {paginas > 1 ? (
                    <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted">
                      <span>
                        Página {lista.page} de {paginas} · {lista.total.toLocaleString("pt-BR")} resultado(s)
                      </span>
                      <div className="flex gap-1">
                        <button type="button" className="btn btn-sm" disabled={lista.page <= 1} onClick={() => void carregar(lista.page - 1)}>
                          ←
                        </button>
                        <button type="button" className="btn btn-sm" disabled={lista.page >= paginas} onClick={() => void carregar(lista.page + 1)}>
                          →
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-3 text-xs text-muted">
              <FileSpreadsheet size={16} /> Nenhum lead ainda. Suba a planilha ao lado: cada linha vira um link próprio.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
