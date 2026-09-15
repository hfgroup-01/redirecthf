import { redirect } from "next/navigation";
import { requirePanelUser } from "@/lib/auth";
import { getClient } from "@/lib/stores/clients";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const s = await requirePanelUser();
  if (s.user.mustChangePassword) redirect("/admin/senha");
  const imp = s.actor.impersonating ? await getClient(s.actor.impersonating.clientId) : null;
  return (
    <div className="flex min-h-screen">
      <Sidebar role={s.actor.role} email={s.user.email} impersonating={imp ? { id: imp.id, name: imp.name } : null} />
      <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
