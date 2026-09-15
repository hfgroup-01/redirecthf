import { escopo } from "@/lib/auth";
import { json, protegido } from "@/lib/http";
import { overview } from "@/lib/stores/clicks";

export const dynamic = "force-dynamic";

export const GET = protegido(async (_req, actor) => json(await overview(escopo(actor))));
