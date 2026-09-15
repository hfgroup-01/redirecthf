import { NextResponse } from "next/server";
import { HF_VERSION } from "@/lib/paths";
import { getInstanceId } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Usado pela checagem de domínio: prova que o DNS chegou NESTA instância. */
export async function GET() {
  return NextResponse.json(
    { hf: true, instance: await getInstanceId(), version: HF_VERSION },
    { headers: { "cache-control": "no-store" } }
  );
}
