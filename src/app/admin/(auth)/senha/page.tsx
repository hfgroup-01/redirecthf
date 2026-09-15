import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ForcedPasswordForm } from "@/components/AuthForms";

export const dynamic = "force-dynamic";

/** Troca obrigatória de senha (primeiro acesso com senha temporária). */
export default async function SenhaPage() {
  const s = await getSessionUser();
  if (!s) redirect("/admin/login");
  if (!s.user.mustChangePassword) redirect("/admin");
  return (
    <div className="card">
      <h1 className="mb-1 text-base font-semibold">Crie sua senha</h1>
      <p className="mb-4 text-sm text-muted">
        Olá{s.user.name ? `, ${s.user.name}` : ""}. Você entrou com uma senha temporária; defina a sua senha definitiva para continuar.
      </p>
      <ForcedPasswordForm />
    </div>
  );
}
