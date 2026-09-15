import { redirect } from "next/navigation";
import { requirePanelUser } from "@/lib/auth";
import { getClient } from "@/lib/stores/clients";
import { PageTransition } from "@/components/motion";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const s = await requirePanelUser();
  if (s.user.mustChangePassword) redirect("/admin/senha");
  const imp = s.actor.impersonating ? await getClient(s.actor.impersonating.clientId) : null;
  return (
    <div className="flex min-h-screen">
      <Sidebar role={s.actor.role} email={s.user.email} impersonating={imp ? { id: imp.id, name: imp.name } : null} />
      <main className="min-w-0 flex-1 px-4 pb-10 pt-20 sm:px-6 lg:px-8 lg:pt-6">
        <div className="mx-auto max-w-7xl">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
    </div>
  );
}
