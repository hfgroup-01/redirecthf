import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { CountUp, FadeMsg } from "@/components/motion";

export function Badge({
  tone,
  children,
  dot = false,
}: {
  tone: "ok" | "warn" | "danger" | "muted" | "accent";
  children: ReactNode;
  dot?: boolean;
}) {
  const cls = {
    ok: "border-ok/40 bg-ok/10 text-green-300",
    warn: "border-warn/40 bg-warn/10 text-amber-300",
    danger: "border-danger/40 bg-danger/10 text-red-300",
    muted: "border-border bg-panel-2 text-muted",
    accent: "border-accent/40 bg-accent/10 text-blue-300",
  }[tone];
  const dotCls = { ok: "bg-green-400", warn: "bg-amber-400", danger: "bg-red-400", muted: "bg-muted", accent: "bg-blue-400" }[tone];
  return (
    <span className={`badge ${cls}`}>
      {dot ? <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dotCls}`} /> : null}
      {children}
    </span>
  );
}

/** Rótulo + controle. Quando o filho é um input/select/textarea, liga label↔campo por id. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  const controle =
    isValidElement(children) && typeof children.type === "string" && ["input", "select", "textarea"].includes(children.type)
      ? cloneElement(children as ReactElement<{ id?: string; "aria-describedby"?: string }>, {
          id: (children as ReactElement<{ id?: string }>).props.id ?? id,
          ...(hint ? { "aria-describedby": `${id}-hint` } : {}),
        })
      : children;
  const htmlFor = isValidElement(children) && typeof children.type === "string" ? (children as ReactElement<{ id?: string }>).props.id ?? id : undefined;
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {controle}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs leading-relaxed text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Msg({ tipo, children }: { tipo: "ok" | "erro" | "info"; children: ReactNode }) {
  const cls = {
    ok: "border-ok/40 bg-ok/10 text-green-200",
    erro: "border-danger/40 bg-danger/10 text-red-200",
    info: "border-accent/40 bg-accent/10 text-blue-200",
  }[tipo];
  return <FadeMsg className={`rounded-md border px-3 py-2 text-sm leading-relaxed ${cls}`}>{children}</FadeMsg>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon?: ReactNode }) {
  return (
    <div className="card card-hover relative overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
        {icon ? <div className="rounded-md bg-accent/10 p-1.5 text-blue-300">{icon}</div> : null}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
        {typeof value === "number" ? <CountUp value={value} /> : value}
      </div>
      {sub ? <div className="mt-1 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

/** Estado vazio com ícone, título e ação opcional. */
export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      {icon ? <div className="mb-1 rounded-full border border-border bg-panel-2 p-3 text-muted">{icon}</div> : null}
      <div className="text-sm font-medium">{title}</div>
      {text ? <p className="max-w-md text-xs leading-relaxed text-muted">{text}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
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
