import { NextResponse, type NextRequest } from "next/server";
import { checkDatabase } from "@/lib/db";
import { foraDoPainel } from "@/lib/http";
import { HF_VERSION } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (await foraDoPainel(req)) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  const db = await checkDatabase();
  return NextResponse.json(
    { ok: db.ok, version: HF_VERSION, db: { driver: db.driver, caminho: db.caminho, versao: db.versao, contagens: db.contagens, erro: db.erro } },
    { status: db.ok ? 200 : 503, headers: { "cache-control": "no-store" } }
  );
}
