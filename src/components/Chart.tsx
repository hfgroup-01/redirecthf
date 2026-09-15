"use client";

import { BarraAnimada } from "@/components/motion";
import type { SerieDia } from "@/lib/stores/clicks";

/**
 * Barras de cliques por dia: crescem na montagem, valor por hover/foco.
 * Responsivo por container query: em cards estreitos mostra só o dia ("02"),
 * em cards largos a data ("02/09"); as colunas encolhem (min-w-0) sem vazar.
 */
export function BarrasDiarias({ serie, altura = 96 }: { serie: SerieDia[]; altura?: number }) {
  const max = Math.max(1, ...serie.map((s) => s.cliques));
  const total = serie.reduce((a, s) => a + s.cliques, 0);
  return (
    <div className="@container w-full min-w-0">
      <div
        className="flex w-full items-end gap-0.5 overflow-hidden sm:gap-1"
        style={{ height: altura }}
        role="img"
        aria-label={`${total} cliques nos últimos ${serie.length} dias`}
      >
        {serie.map((s, i) => {
          const h = Math.max(3, Math.round((s.cliques / max) * (altura - 20)));
          const dia = s.dia.slice(8, 10) + "/" + s.dia.slice(5, 7);
          return (
            <div key={s.dia} className="group relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${dia}: ${s.cliques}`}>
              <span className="pointer-events-none absolute -top-5 z-10 rounded bg-panel-2 px-1.5 py-0.5 text-[10px] tabular-nums text-text opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                {s.cliques}
              </span>
              <BarraAnimada altura={h} i={i} className="w-full min-w-[3px] rounded-sm bg-accent/70 transition-colors duration-150 group-hover:bg-accent" />
              <div className="w-full truncate text-center text-[10px] leading-none text-muted tabular-nums">
                <span className="@[420px]:hidden">{dia.slice(0, 2)}</span>
                <span className="hidden @[420px]:inline">{dia}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
