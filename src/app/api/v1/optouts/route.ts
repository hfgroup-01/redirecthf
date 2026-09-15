import { NextResponse, type NextRequest } from "next/server";
import { escopo } from "@/lib/auth";
import { json, protegido } from "@/lib/http";
import { allOptOuts, listOptOuts } from "@/lib/stores/optouts";

export const dynamic = "force-dynamic";

/** GET ?page=  |  GET ?format=csv  (para o disparador/n8n filtrar números). Só os domínios do escopo. */
export const GET = protegido(async (req: NextRequest, actor) => {
  const p = req.nextUrl.searchParams;
  const scope = escopo(actor);
  if (p.get("format") === "csv") {
    const linhas = [["ts", "contact", "lead", "code", "host"].join(";")];
    for (const o of await allOptOuts(scope)) {
      linhas.push([o.ts, o.contact ?? "", o.lead ?? "", o.code ?? "", o.host ?? ""].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"));
    }
    return new NextResponse(linhas.join("\r\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="optouts-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      },
    });
  }
  return json(await listOptOuts(scope, Number(p.get("page") ?? 1), 50));
});
