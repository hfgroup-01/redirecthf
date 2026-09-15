"use client";

import { AnimatePresence, m } from "framer-motion";
import { ArrowLeftRight, Globe, LayoutDashboard, Link2, LogOut, Menu, Settings, UserCircle, UserX, Users, X } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { api } from "@/components/api";
import { TopProgress } from "@/components/motion";
import type { Role } from "@/lib/types";

interface Item {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  exact?: boolean;
}

const NAV_ADMIN: Item[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/links", label: "Links", icon: Link2 },
  { href: "/admin/dominios", label: "Domínios / sites", icon: Globe },
  { href: "/admin/optouts", label: "Opt-outs", icon: UserX },
  { href: "/admin/config", label: "Configurações", icon: Settings },
  { href: "/admin/conta", label: "Minha conta", icon: UserCircle },
];

const NAV_CLIENT: Item[] = [
  { href: "/admin", label: "Início", icon: LayoutDashboard, exact: true },
  { href: "/admin/links", label: "Meus links", icon: Link2 },
  { href: "/admin/dominios", label: "Meus domínios", icon: Globe },
  { href: "/admin/optouts", label: "Opt-outs", icon: UserX },
  { href: "/admin/conta", label: "Minha conta", icon: UserCircle },
];

/** Dentro de um <Link>: avisa o pai enquanto a navegação está pendente. */
function Pendente({ onChange }: { onChange: (v: boolean) => void }) {
  const { pending } = useLinkStatus();
  useEffect(() => {
    onChange(pending);
  }, [pending, onChange]);
  return pending ? <span aria-hidden className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> : null;
}

function NavLinks({ items, path, onNavigate, onPending }: { items: Item[]; path: string; onNavigate?: () => void; onPending: (v: boolean) => void }) {
  return (
    <nav className="flex-1 space-y-0.5 p-2" aria-label="Principal">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const ativo = exact ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={ativo ? "page" : undefined}
            className={`relative flex min-h-10 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-150 ${
              ativo ? "text-blue-200" : "text-muted hover:bg-panel-2 hover:text-text"
            }`}
          >
            {ativo ? (
              <m.span layoutId="nav-ativo" className="absolute inset-0 -z-10 rounded-md bg-accent/15" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
            ) : null}
            <Icon size={16} className="shrink-0" />
            <span className="truncate">{label}</span>
            <Pendente onChange={onPending} />
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({
  role,
  email,
  impersonating,
}: {
  role: Role;
  email: string;
  impersonating: { id: string; name: string } | null;
}) {
  const path = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, setPendente] = useState(false);
  const nav = role === "admin" ? NAV_ADMIN : NAV_CLIENT;

  useEffect(() => {
    setAberto(false);
  }, [path]);

  const sair = async () => {
    await api("/api/v1/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  const bannerImp = impersonating ? (
    <div className="border-b border-warn/40 bg-warn/10 p-3 text-xs">
      <div className="text-amber-200">
        Vendo como <strong>{impersonating.name}</strong>
      </div>
      <button
        type="button"
        className="mt-2 flex cursor-pointer items-center gap-1 text-amber-100 hover:underline"
        onClick={async () => {
          await api("/api/v1/auth/impersonate", { method: "DELETE" });
          router.push(`/admin/clientes/${impersonating.id}`);
          router.refresh();
        }}
      >
        <ArrowLeftRight size={12} /> Voltar a ser admin
      </button>
    </div>
  ) : null;

  const rodape = (
    <div className="border-t border-border p-2">
      <div className="truncate px-3 py-1 text-[11px] text-muted" title={email}>
        {email}
      </div>
      <button type="button" className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-muted transition-colors duration-150 hover:bg-panel-2 hover:text-text" onClick={sair}>
        <LogOut size={16} />
        Sair
      </button>
    </div>
  );

  const marca = (
    <div className="flex h-14 items-center gap-2 px-4">
      <span className="inline-block h-3 w-3 rounded-sm bg-accent shadow-[0_0_12px_rgb(59_130_246_/_0.6)]" />
      <span className="font-semibold tracking-tight">HF</span>
      <span className="text-xs text-muted">redirects</span>
      {role === "client" ? <span className="badge ml-auto border-border bg-panel-2 text-muted">cliente</span> : null}
    </div>
  );

  return (
    <>
      <TopProgress visible={pendente} />

      {/* Desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-panel lg:flex">
        <div className="border-b border-border">{marca}</div>
        {bannerImp}
        <NavLinks items={nav} path={path} onPending={setPendente} />
        {rodape}
      </aside>

      {/* Mobile: barra superior + gaveta */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-panel/95 pr-2 backdrop-blur lg:hidden">
        {marca}
        <button type="button" className="btn btn-ghost" aria-label={aberto ? "Fechar menu" : "Abrir menu"} aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
          {aberto ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>
      <AnimatePresence>
        {aberto ? (
          <>
            <m.button
              key="overlay"
              type="button"
              aria-label="Fechar menu"
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAberto(false)}
            />
            <m.aside
              key="drawer"
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-panel shadow-[var(--shadow-pop)] lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 40 }}
            >
              <div className="border-b border-border">{marca}</div>
              {bannerImp}
              <NavLinks items={nav} path={path} onNavigate={() => setAberto(false)} onPending={setPendente} />
              {rodape}
            </m.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
