import type { Metadata } from "next";

export const metadata: Metadata = { title: "Página não encontrada", robots: { index: false, follow: false } };

/** 404 neutro (sem marca do HF): aparece quando algo do painel é pedido num domínio de redirect. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6 text-center text-neutral-700">
      <div>
        <h1 className="text-2xl font-semibold">Página não encontrada</h1>
        <p className="mt-2 text-sm text-neutral-500">O endereço que você acessou não existe.</p>
      </div>
    </div>
  );
}
