import type { ReactNode } from "react";

export function Badge({ tone, children }: { tone: "ok" | "warn" | "danger" | "muted" | "accent"; children: ReactNode }) {
  const cls = {
    ok: "border-ok/40 bg-ok/10 text-green-300",
    warn: "border-warn/40 bg-warn/10 text-amber-300",
    danger: "border-danger/40 bg-danger/10 text-red-300",
    muted: "border-border bg-panel-2 text-muted",
    accent: "border-accent/40 bg-accent/10 text-blue-300",
  }[tone];
  return <span className={`badge ${cls}`}>{children}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Msg({ tipo, children }: { tipo: "ok" | "erro" | "info"; children: ReactNode }) {
  const cls = {
    ok: "border-ok/40 bg-ok/10 text-green-200",
    erro: "border-danger/40 bg-danger/10 text-red-200",
    info: "border-accent/40 bg-accent/10 text-blue-200",
  }[tipo];
  return <div className={`rounded-md border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

export function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function statusDominio(status: string): { tone: "ok" | "warn" | "danger" | "muted"; label: string } {
  switch (status) {
    case "active":
      return { tone: "ok", label: "No ar" };
    case "dns_ok":
      return { tone: "warn", label: "DNS ok · propagando" };
    case "error":
      return { tone: "danger", label: "Erro" };
    default:
      return { tone: "muted", label: "Pendente" };
  }
}
