import { agora, rodar, um } from "@/lib/db";
import { decrypt, encrypt, randomToken, verifyPassword } from "@/lib/crypto";
import { invalidarHostInfo, invalidarPanelHost } from "@/lib/hosts";
import type { DnsType, PageConfig, SettingsView } from "@/lib/types";

const K = {
  /** v2: senha única do admin. Em v3 só serve como prova no setup do primeiro usuário. */
  legacyPasswordHash: "admin_password_hash",
  apiKey: "api_key",
  instanceId: "instance_id",
  dnsTargetMode: "dns_target_mode",
  dnsTargetValue: "dns_target_value",
  cfTokenDefault: "cf_token_default_enc",
  pageDefaults: "page_defaults",
  clicksRetentionDays: "clicks_retention_days",
  panelHost: "panel_host",
} as const;

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await um<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", key);
  if (!row || row.value === null || row.value === undefined) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await rodar(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    key,
    JSON.stringify(value ?? null),
    agora()
  );
}

export async function deleteSetting(key: string): Promise<void> {
  await rodar("DELETE FROM settings WHERE key = ?", key);
}

/** Identifica ESTA instância no /hf/ping (a checagem de domínio confere que o DNS caiu aqui). */
export async function getInstanceId(): Promise<string> {
  let id = await getSetting<string>(K.instanceId, "");
  if (!id) {
    id = `hf_${randomToken(8)}`;
    await setSetting(K.instanceId, id);
  }
  return id;
}

export async function getApiKey(): Promise<string> {
  let key = await getSetting<string>(K.apiKey, "");
  if (!key) {
    key = `hf_${randomToken(24)}`;
    await setSetting(K.apiKey, key);
  }
  return key;
}

export async function rotateApiKey(): Promise<string> {
  const key = `hf_${randomToken(24)}`;
  await setSetting(K.apiKey, key);
  return key;
}

// ------------------------------------------------------------ host do painel
export async function getPanelHostSetting(): Promise<string> {
  return (await getSetting<string>(K.panelHost, "")).trim().toLowerCase();
}

export async function setPanelHostSetting(host: string): Promise<void> {
  await setSetting(K.panelHost, host.trim().toLowerCase());
  invalidarPanelHost();
}

// ------------------------------------------------------------ senha legada (v2)
export async function legacyAdminPasswordExists(): Promise<boolean> {
  if (await getSetting<string>(K.legacyPasswordHash, "")) return true;
  return Boolean(process.env.HF_ADMIN_PASSWORD?.trim());
}

/** Prova de posse na criação do primeiro usuário: hash antigo OU HF_ADMIN_PASSWORD do env. */
export async function checkLegacyAdminPassword(senha: string): Promise<boolean> {
  const hash = await getSetting<string>(K.legacyPasswordHash, "");
  if (hash && verifyPassword(senha, hash)) return true;
  const env = process.env.HF_ADMIN_PASSWORD?.trim();
  return Boolean(env) && senha === env;
}

export async function clearLegacyAdminPassword(): Promise<void> {
  await deleteSetting(K.legacyPasswordHash);
}

// ------------------------------------------------------------ DNS / Cloudflare
export async function getDnsTarget(): Promise<{ mode: DnsType; value: string }> {
  const [mode, value] = await Promise.all([getSetting<DnsType>(K.dnsTargetMode, "CNAME"), getSetting<string>(K.dnsTargetValue, "")]);
  return { mode, value };
}

export async function setDnsTarget(mode: DnsType, value: string): Promise<void> {
  await setSetting(K.dnsTargetMode, mode);
  await setSetting(K.dnsTargetValue, value.trim());
}

export async function getDefaultCfToken(): Promise<string> {
  const enc = await getSetting<string>(K.cfTokenDefault, "");
  return enc ? decrypt(enc) : "";
}

export async function setDefaultCfToken(token: string): Promise<void> {
  await setSetting(K.cfTokenDefault, token.trim() ? encrypt(token.trim()) : "");
}

// ------------------------------------------------------------ página white padrão
export const PAGE_DEFAULTS: Required<PageConfig> = {
  companyName: "Central de Agendamentos",
  headline: "Reunião confirmada",
  subheadline:
    "Recebemos a confirmação do seu agendamento. Nossa equipe entrará em contato pelo WhatsApp com os detalhes finais.",
  steps: [
    "Confira o dia e o horário combinados na mensagem que você recebeu.",
    "Um consultor vai enviar o link ou o endereço da reunião com antecedência.",
    "Se precisar remarcar, responda à mensagem no WhatsApp a qualquer momento.",
  ],
  aboutTitle: "Sobre nós",
  aboutText:
    "Somos uma empresa especializada em atendimento e agendamento de reuniões comerciais. Trabalhamos com transparência, respeito ao seu tempo e comunicação clara em todas as etapas.",
  phone: "",
  email: "",
  address: "",
  cnpj: "",
  website: "",
  primaryColor: "#1f6feb",
  footerNote: "Este é um canal oficial de comunicação. Não compartilhamos seus dados com terceiros.",
};

export async function getPageDefaults(): Promise<PageConfig> {
  return { ...PAGE_DEFAULTS, ...(await getSetting<PageConfig>(K.pageDefaults, {})) };
}

export async function setPageDefaults(cfg: PageConfig): Promise<void> {
  await setSetting(K.pageDefaults, cfg);
  invalidarHostInfo();
}

export async function getClicksRetentionDays(): Promise<number> {
  const n = await getSetting<number>(K.clicksRetentionDays, 90);
  return Number.isFinite(n) && n > 0 ? n : 90;
}

export async function setClicksRetentionDays(n: number): Promise<void> {
  await setSetting(K.clicksRetentionDays, Math.max(1, Math.floor(n)));
}

export async function getSettingsView(): Promise<SettingsView> {
  const env = process.env.HF_ADMIN_HOST?.trim().toLowerCase() || "";
  // Leituras independentes em paralelo (cada uma é uma ida ao banco).
  const [dns, setting, instanceId, apiKey, tokenEnc, pageDefaults, clicksRetentionDays] = await Promise.all([
    getDnsTarget(),
    getPanelHostSetting(),
    getInstanceId(),
    getApiKey(),
    getSetting<string>(K.cfTokenDefault, ""),
    getPageDefaults(),
    getClicksRetentionDays(),
  ]);
  return {
    instanceId,
    apiKey,
    dnsTargetMode: dns.mode,
    dnsTargetValue: dns.value,
    hasDefaultToken: Boolean(tokenEnc),
    pageDefaults,
    clicksRetentionDays,
    panelHost: env || setting,
    panelHostSource: env ? "env" : setting ? "setting" : "none",
  };
}
