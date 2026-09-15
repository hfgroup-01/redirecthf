"use client";

import { Download, FileSpreadsheet, Search, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { CopyButton } from "@/components/CopyButton";
import { Field, Msg } from "@/components/ui";
import { parseCsv, sugerirColunas } from "@/lib/csv";
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

/** Card "Destinos por lead": importar CSV, ver/buscar, exportar e limpar. */
export function LeadTargets({ link, total }: { link: Link; total: number }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [header, setHeader] = useState<string[]>([]);
  const [leadCol, setLeadCol] = useState("");
  const [urlCol, setUrlCol] = useState("");
  const [baixar, setBaixar] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro" | "info"; texto: string } | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<Lista | null>(null);

  const exemploVar = `${link.code}.5511999990000`;
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
    setMsg(null);
    setHeader([]);
    if (!f) return;
    const amostra = await f.slice(0, 128 * 1024).text();
    const csv = parseCsv(amostra, { max: 21 });
    const h = csv.header;
    setHeader(h);
    const sug = sugerirColunas(h, csv.rows.slice(1));
    setLeadCol(sug.lead >= 0 ? h[sug.lead] : "");
    setUrlCol(sug.url >= 0 ? h[sug.url] : "");
  };

  const importar = async () => {
    if (!file) return;
    setOcupado("import");
    setMsg(null);
    setResumo(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("leadColumn", leadCol);
      fd.append("urlColumn", urlCol);
      const res = await fetch(`/api/v1/links/${link.id}/targets/import${baixar ? "?retorno=csv" : ""}`, { method: "POST", body: fd, credentials: "same-origin" });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      let r: Resumo;
      if (baixar) {
        const cab = res.headers.get("x-hf-resumo");
        r = cab ? (JSON.parse(decodeURIComponent(cab)) as { resumo: Resumo }).resumo : { recebidos: 0, gravados: 0, semLead: 0, urlInvalida: 0, duplicadosNoArquivo: 0, exemplosErro: [] };
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${link.code}-hf.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else {
        r = ((await res.json()) as { resumo: Resumo }).resumo;
      }
      setResumo(r);
      setMsg({ tipo: "ok", texto: `${r.gravados.toLocaleString("pt-BR")} destino(s) gravado(s).${baixar ? " O CSV pronto para o disparador foi baixado." : ""}` });
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
    if (!confirm(`Apagar TODOS os destinos por lead deste link (${(lista?.totalNoLink ?? total).toLocaleString("pt-BR")})? Os leads passam a cair no destino padrão.`)) return;
    setOcupado("clear");
    try {
      await api(`/api/v1/links/${link.id}/targets`, { method: "DELETE" });
      setLista(null);
      setMsg({ tipo: "ok", texto: "Destinos por lead apagados." });
      router.refresh();
    } catch (e) {
      setMsg({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setOcupado(null);
    }
  };

  const totalAtual = lista?.totalNoLink ?? total;
  const paginas = lista ? Math.max(1, Math.ceil(lista.total / lista.pageSize)) : 1;

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Destinos por lead (CSV)</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
            Cada lead pode ter a própria URL. Suba o CSV do disparo com uma coluna do lead (telefone ou id) e uma coluna com o link. No template, a variável vai como{" "}
            <code className="mono text-text">{exemploVar}</code>. Quem não tiver destino próprio cai na URL padrão do link.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge border-accent/40 bg-accent/10 text-blue-300">{totalAtual.toLocaleString("pt-BR")} lead(s)</span>
          {totalAtual > 0 ? (
            <>
              <a className="btn btn-sm" href={`/api/v1/links/${link.id}/targets/export`}>
                <Download size={13} /> Exportar CSV
              </a>
              <button type="button" className="btn btn-sm btn-danger" disabled={ocupado !== null} onClick={() => void limpar()} title="Apagar todos os destinos por lead" aria-label="Apagar todos os destinos por lead">
                <Trash2 size={13} />
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Arquivo CSV" hint="Vírgula, ponto e vírgula ou tab; até 40 MB / 250 mil linhas por arquivo.">
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="input cursor-pointer file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-panel-2 file:px-3 file:py-1 file:text-xs file:font-medium file:text-text"
              onChange={(e) => void escolherArquivo(e.target.files?.[0] ?? null)}
            />
          </Field>
          {header.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Coluna do lead" hint="Telefone ou id que vai na variável do template.">
                <select className="input" value={leadCol} onChange={(e) => setLeadCol(e.target.value)}>
                  <option value="">— escolha —</option>
                  {header.map((h, i) => (
                    <option key={i} value={h}>
                      {h || `(coluna ${i + 1})`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Coluna da URL de destino">
                <select className="input" value={urlCol} onChange={(e) => setUrlCol(e.target.value)}>
                  <option value="">— escolha —</option>
                  {header.map((h, i) => (
                    <option key={i} value={h}>
                      {h || `(coluna ${i + 1})`}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={baixar} onChange={(e) => setBaixar(e.target.checked)} />
            Baixar o CSV pronto para o disparador <span className="text-xs text-muted">(mesmas colunas + hf_var e hf_url)</span>
          </label>
          {msg ? <Msg tipo={msg.tipo}>{msg.texto}</Msg> : null}
          {resumo ? (
            <div className="rounded-md border border-border bg-bg p-3 text-xs text-muted">
              <div>
                Recebidos <strong className="text-text">{resumo.recebidos.toLocaleString("pt-BR")}</strong> · gravados <strong className="text-text">{resumo.gravados.toLocaleString("pt-BR")}</strong>
                {resumo.duplicadosNoArquivo ? ` · repetidos no arquivo ${resumo.duplicadosNoArquivo}` : ""}
                {resumo.semLead ? ` · sem lead ${resumo.semLead}` : ""}
                {resumo.urlInvalida ? ` · URL inválida ${resumo.urlInvalida}` : ""}
              </div>
              {resumo.exemplosErro.length ? <ul className="mt-1 list-disc pl-4">{resumo.exemplosErro.map((e) => <li key={e}>{e}</li>)}</ul> : null}
            </div>
          ) : null}
          <button type="button" className="btn btn-primary" disabled={!file || !leadCol || !urlCol || leadCol === urlCol || ocupado !== null} onClick={() => void importar()}>
            <Upload size={14} /> {ocupado === "import" ? "Importando…" : "Importar destinos"}
          </button>
        </div>

        <div className="space-y-3">
          <div className="rounded-md border border-border bg-bg p-3 text-xs">
            <div className="mb-1 font-semibold uppercase tracking-wider text-muted">No disparo</div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="mono text-text">{`{{1}} = ${exemploVar}`}</code>
              <CopyButton text={exemploVar} label="Copiar exemplo" />
            </div>
            <div className="mt-1 break-all text-muted">
              URL final: <span className="mono">{exemploUrl}</span> · também funciona <span className="mono">{link.code}?l=5511999990000</span>
            </div>
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
                <input className="input" placeholder="Buscar lead ou URL…" value={q} onChange={(e) => setQ(e.target.value)} />
                <button className="btn shrink-0" aria-label="Buscar">
                  <Search size={14} />
                </button>
              </form>
              {lista ? (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Lead</th>
                        <th>Destino</th>
                        <th className="text-right">Cliques</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.items.map((t) => (
                        <tr key={t.id}>
                          <td className="mono text-xs">{t.lead}</td>
                          <td className="max-w-[260px] truncate text-xs" title={t.destinationUrl}>
                            {t.destinationUrl}
                          </td>
                          <td className="text-right tabular-nums">{t.clicksCount}</td>
                        </tr>
                      ))}
                      {!lista.items.length ? (
                        <tr>
                          <td colSpan={3} className="py-4 text-center text-xs text-muted">
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
              <FileSpreadsheet size={16} /> Nenhum destino por lead ainda. Todos os cliques vão para a URL padrão do link.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
