import { redirect } from "next/navigation";
import { isSetupDone } from "@/lib/auth";
import { legacyAdminPasswordExists } from "@/lib/settings";
import { SetupForm } from "@/components/AuthForms";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await isSetupDone()) redirect("/admin/login");
  const precisaProva = await legacyAdminPasswordExists();
  return (
    <div className="card">
      <h1 className="mb-1 text-base font-semibold">Primeiro acesso</h1>
      <p className="mb-4 text-sm text-muted">Crie o administrador do HF (e-mail + senha). Depois você cria os logins dos clientes pelo painel.</p>
      <SetupForm precisaProva={precisaProva} />
    </div>
  );
}
