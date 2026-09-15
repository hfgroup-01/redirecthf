import { requirePanelHost } from "@/lib/auth";
import { Reveal } from "@/components/motion";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  await requirePanelHost();
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Reveal className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm bg-accent shadow-[0_0_14px_rgb(59_130_246_/_0.6)]" />
          <span className="text-lg font-semibold tracking-tight">HF</span>
          <span className="text-sm text-muted">redirects</span>
        </div>
        {children}
      </Reveal>
    </div>
  );
}
