"use client";

import { ArrowLeftRight, Globe, LayoutDashboard, Link2, LogOut, Settings, UserCircle, UserX, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/components/api";
import type { Role } from "@/lib/types";

const NAV_ADMIN = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/links", label: "Links", icon: Link2 },
  { href: "/admin/dominios", label: "Domínios / sites", icon: Globe },
  { href: "/admin/optouts", label: "Opt-outs", icon: UserX },
  { href: "/admin/config", label: "Configurações", icon: Settings },
  { href: "/admin/conta", label: "Minha conta", icon: UserCircle },
];

const NAV_CLIENT = [
  { href: "/admin", label: "Início", icon: LayoutDashboard, exact: true },
  { href: "/admin/links", label: "Meus links", icon: Link2 },
  { href: "/admin/dominios", label: "Meus domínios", icon: Globe },
  { href: "/admin/optouts", label: "Opt-outs", icon: UserX },
  { href: "/admin/conta", label: "Minha conta", icon: UserCircle },
];

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
  const nav = role === "admin" ? NAV_ADMIN : NAV_CLIENT;
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-panel">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <span className="inline-block h-3 w-3 rounded-sm bg-accent" />
        <span className="font-semibold tracking-tight">HF</span>
        <span className="text-xs text-muted">redirects</span>
      </div>
      {impersonating ? (
        <div className="border-b border-warn/40 bg-warn/10 p-3 text-xs">
          <div className="text-amber-200">
            Vendo como <strong>{impersonating.name}</strong>
          </div>
          <button
            type="button"
            className="mt-2 flex items-center gap-1 text-amber-100 hover:underline"
            onClick={async () => {
              await api("/api/v1/auth/impersonate", { method: "DELETE" });
              router.push(`/admin/clientes/${impersonating.id}`);
              router.refresh();
            }}
          >
            <ArrowLeftRight size={12} /> Voltar a ser admin
          </button>
        </div>
      ) : null}
      <nav className="flex-1 space-y-0.5 p-2">
        {nav.map(({ href, label, icon: Icon, exact }) => {
          const ativo = exact ? path === href : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
                ativo ? "bg-accent/15 text-blue-200" : "text-muted hover:bg-panel-2 hover:text-text"
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-2">
        <div className="truncate px-3 py-1 text-[11px] text-muted" title={email}>
          {email}
        </div>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted hover:bg-panel-2 hover:text-text"
          onClick={async () => {
            await api("/api/v1/auth/logout", { method: "POST" });
            router.push("/admin/login");
            router.refresh();
          }}
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </aside>
  );
}
