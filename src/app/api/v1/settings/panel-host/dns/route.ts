import { checkReachability, ensureDnsRecord, findZoneForHostname, verifyToken } from "@/lib/cloudflare";
import type { Passo } from "@/lib/domainSetup";
import { badRequest, json, somenteAdmin } from "@/lib/http";
import { getPanelHost } from "@/lib/hosts";
import { getDefaultCfToken, getDnsTarget, getInstanceId } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Cria/corrige o registro DNS do host do painel (proxied) apontando para o alvo do HF, e confere se responde. */
export const POST = somenteAdmin(async () => {
  const { host } = await getPanelHost();
  if (!host) throw badRequest("Defina o host do painel antes.");
  const token = await getDefaultCfToken();
  if (!token) throw badRequest("Sem token padrão da Cloudflare em Configurações.");
  const alvo = await getDnsTarget();
  if (!alvo.value) throw badRequest("Defina o alvo do DNS em Configurações.");

  const steps: Passo[] = [];
  const t = await verifyToken(token);
  if (t.status !== "active") throw badRequest(`Token da Cloudflare com status "${t.status}".`);
  steps.push({ step: "Token da Cloudflare", status: "ok" });
  const zona = await findZoneForHostname(host, token);
  steps.push({ step: "Zona encontrada", status: "ok", message: `${zona.name} (${zona.accountName})` });
  const r = await ensureDnsRecord({ zoneId: zona.id, token, hostname: host, type: alvo.mode, content: alvo.value });
  const acao = r.action === "created" ? "criado" : r.action === "updated" ? "corrigido" : "já estava certo";
  steps.push({ step: "Registro DNS", status: "ok", message: `${alvo.mode} ${host} -> ${alvo.value} (${acao}, proxied)` });
  const check = await checkReachability(host, await getInstanceId());
  steps.push({ step: "Painel no ar", status: check.ok ? "ok" : "warn", message: check.detail });
  return json({ host, steps });
});
