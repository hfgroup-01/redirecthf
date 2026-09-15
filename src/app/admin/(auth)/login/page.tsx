import { redirect } from "next/navigation";
import { getSessionUser, isSetupDone } from "@/lib/auth";
import { LoginForm } from "@/components/AuthForms";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!(await isSetupDone())) redirect("/admin/setup");
  const s = await getSessionUser();
  if (s) redirect(s.user.mustChangePassword ? "/admin/senha" : "/admin");
  return (
    <div className="card">
      <h1 className="mb-1 text-base font-semibold">Entrar</h1>
      <p className="mb-4 text-sm text-muted">Use o e-mail e a senha do seu acesso.</p>
      <LoginForm />
    </div>
  );
}
