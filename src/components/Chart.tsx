import type { SerieDia } from "@/lib/stores/clicks";

/** Barras simples em CSS (server component): cliques por dia. */
export function BarrasDiarias({ serie, altura = 96 }: { serie: SerieDia[]; altura?: number }) {
  const max = Math.max(1, ...serie.map((s) => s.cliques));
  return (
    <div className="flex items-end gap-1" style={{ height: altura }}>
      {serie.map((s) => {
        const h = Math.max(2, Math.round((s.cliques / max) * (altura - 18)));
        const dia = s.dia.slice(8, 10) + "/" + s.dia.slice(5, 7);
        return (
          <div key={s.dia} className="group flex flex-1 flex-col items-center justify-end gap-1" title={`${dia}: ${s.cliques}`}>
            <div className="w-full rounded-sm bg-accent/70 transition group-hover:bg-accent" style={{ height: h }} />
            <div className="text-[10px] text-muted">{dia}</div>
          </div>
        );
      })}
    </div>
  );
}
