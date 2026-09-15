/**
 * Registro de cliques em lote: o redirect só empilha em memória e responde;
 * a cada ~1s a fila é gravada numa única transação (1 INSERT multi-linha +
 * 1 UPDATE de contador por link + 1 por lead com destino próprio). Com Supabase
 * isso vira poucas idas ao banco por segundo, independentemente do volume.
 */
import { agora, transacao, type Valor } from "@/lib/db";

export interface ClickInput {
  linkId: string;
  host: string | null;
  country: string | null;
  ua: string | null;
  referer: string | null;
  query: string | null;
  ipHash: string | null;
  /** Lead identificado (codigo.lead ou ?l=), se veio. */
  lead: string | null;
  /** true = o destino veio de lead_targets (conta no contador do lead). */
  viaTarget?: boolean;
  /** "bot" = fetcher de preview (WhatsApp/Meta): fica no log, não conta como clique. */
  outcome: "redirect" | "page" | "inactive" | "bot";
}

interface Fila {
  itens: (ClickInput & { ts: string })[];
  timer: NodeJS.Timeout | null;
  gravando: boolean;
}

const g = globalThis as unknown as { __hfClickQueue?: Fila; __hfExitHook?: boolean };
const fila = (): Fila => (g.__hfClickQueue ??= { itens: [], timer: null, gravando: false });

const INTERVALO_MS = 1000;
const LOTE_MAX = 2000;
const COLUNAS = ["link_id", "ts", "host", "country", "ua", "referer", "query", "ip_hash", "lead", "outcome"];

export function enqueueClick(c: ClickInput): void {
  const f = fila();
  f.itens.push({ ...c, ts: agora() });
  if (f.itens.length >= LOTE_MAX) {
    void flushClicks();
    return;
  }
  if (!f.timer) {
    f.timer = setTimeout(() => {
      f.timer = null;
      void flushClicks();
    }, INTERVALO_MS);
    // Não segura o processo vivo só por causa da fila.
    f.timer.unref?.();
  }
}

export async function flushClicks(): Promise<number> {
  const f = fila();
  if (f.gravando || !f.itens.length) return 0;
  f.gravando = true;
  const lote = f.itens;
  f.itens = [];
  try {
    await transacao(async (tx) => {
      const linhas: Valor[][] = lote.map((c) => [c.linkId, c.ts, c.host, c.country, c.ua, c.referer, c.query, c.ipHash, c.lead, c.outcome]);
      await tx.insertMany("clicks", COLUNAS, linhas);
      const porLink = new Map<string, { n: number; ultimo: string }>();
      const porLead = new Map<string, { linkId: string; lead: string; n: number; ultimo: string }>();
      for (const c of lote) {
        if (c.outcome === "bot") continue;
        const e = porLink.get(c.linkId);
        if (e) {
          e.n++;
          if (c.ts > e.ultimo) e.ultimo = c.ts;
        } else porLink.set(c.linkId, { n: 1, ultimo: c.ts });
        if (c.viaTarget && c.lead) {
          const k = `${c.linkId}|${c.lead}`;
          const t = porLead.get(k);
          if (t) {
            t.n++;
            if (c.ts > t.ultimo) t.ultimo = c.ts;
          } else porLead.set(k, { linkId: c.linkId, lead: c.lead, n: 1, ultimo: c.ts });
        }
      }
      for (const [linkId, e] of porLink) {
        await tx.rodar("UPDATE links SET clicks_count = clicks_count + ?, last_click_at = ? WHERE id = ?", e.n, e.ultimo, linkId);
      }
      for (const t of porLead.values()) {
        await tx.rodar(
          "UPDATE lead_targets SET clicks_count = clicks_count + ?, last_click_at = ? WHERE link_id = ? AND lead_key = ?",
          t.n,
          t.ultimo,
          t.linkId,
          t.lead
        );
      }
    });
    return lote.length;
  } catch (err) {
    // Link apagado entre o clique e o flush (FK) ou banco fora: perde o lote
    // em vez de derrubar o processo; loga para diagnóstico.
    console.error("[hf] falha ao gravar cliques:", (err as Error).message);
    return 0;
  } finally {
    f.gravando = false;
    if (f.itens.length && !f.timer) {
      f.timer = setTimeout(() => {
        f.timer = null;
        void flushClicks();
      }, INTERVALO_MS);
      f.timer.unref?.();
    }
  }
}

// Melhor esforço: grava o que estiver pendente ao encerrar.
if (typeof process !== "undefined" && !g.__hfExitHook) {
  g.__hfExitHook = true;
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.once(sig, () => {
      flushClicks().finally(() => process.exit(0));
    });
  }
}
