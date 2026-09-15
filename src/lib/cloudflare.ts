/**
 * Cliente REST da Cloudflare (API v4) usado pelo HF.
 *
 * O token precisa de: Zone > Zone > Read  e  Zone > DNS > Edit
 * (nas zonas dos domínios que serão usados). Nada de Pages/Workers aqui:
 * o HF só cria o registro DNS apontando o domínio para o próprio servidor.
 */
import type { DnsType } from "@/lib/types";

const BASE = "https://api.cloudflare.com/client/v4";

interface CfError {
  code: number;
  message: string;
}

interface CfResponse<T> {
  success: boolean;
  errors: CfError[];
  messages: unknown[];
  result: T;
  result_info?: { page: number; per_page: number; total_count: number };
}

export class CloudflareError extends Error {
  constructor(
    message: string,
    public readonly errors: CfError[] = [],
    public readonly status = 0
  ) {
    super(message);
    this.name = "CloudflareError";
  }
}

async function cfFetch<T>(path: string, token: string, init?: RequestInit): Promise<CfResponse<T>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new CloudflareError(`Não consegui falar com a API da Cloudflare: ${(e as Error).message}`);
  }
  let body: CfResponse<T>;
  try {
    body = (await res.json()) as CfResponse<T>;
  } catch {
    throw new CloudflareError(`Resposta inválida da Cloudflare (HTTP ${res.status}).`, [], res.status);
  }
  if (!body.success) {
    const msg = (body.errors ?? []).map((e) => `${e.message} (${e.code})`).join("; ") || `HTTP ${res.status}`;
    throw new CloudflareError(msg, body.errors ?? [], res.status);
  }
  return body;
}

/** Confere se o token é válido/ativo. */
export async function verifyToken(token: string): Promise<{ id: string; status: string }> {
  const r = await cfFetch<{ id: string; status: string }>("/user/tokens/verify", token);
  return r.result;
}

export interface ZoneInfo {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
}

/**
 * Descobre a zona de um hostname: tenta o próprio nome e vai subindo
 * (go.cliente.com.br -> cliente.com.br -> com.br). Precisa de Zone:Read.
 */
export async function findZoneForHostname(hostname: string, token: string): Promise<ZoneInfo> {
  const labels = hostname.toLowerCase().split(".").filter(Boolean);
  const tentativas: string[] = [];
  for (let i = 0; i <= labels.length - 2; i++) tentativas.push(labels.slice(i).join("."));

  for (const nome of tentativas) {
    const r = await cfFetch<
      { id: string; name: string; status: string; account: { id: string; name: string } }[]
    >(`/zones?name=${encodeURIComponent(nome)}&per_page=5`, token);
    const zona = r.result.find((z) => z.name === nome);
    if (zona) {
      return { id: zona.id, name: zona.name, accountId: zona.account?.id ?? "", accountName: zona.account?.name ?? "" };
    }
  }
  throw new CloudflareError(
    `Nenhuma zona da Cloudflare corresponde a "${hostname}" (tentei: ${tentativas.join(", ")}). O domínio está nesta conta e o token tem Zone:Read?`
  );
}

export interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
}

/** Registros com exatamente este nome (ex.: "go.cliente.com" ou "*.cliente.com"). */
export async function listDnsRecords(zoneId: string, token: string, name: string): Promise<DnsRecord[]> {
  const lista = await cfFetch<DnsRecord[]>(`/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}&per_page=50`, token);
  return lista.result.filter((r) => r.name.toLowerCase() === name.toLowerCase());
}

export interface EnsureDnsInput {
  zoneId: string;
  token: string;
  hostname: string;
  type: DnsType;
  content: string;
}

export interface EnsureDnsResult {
  recordId: string;
  action: "created" | "updated" | "unchanged";
}

/**
 * Garante que existe UM registro (A ou CNAME, proxied) para o hostname apontando
 * para o alvo. Corrige registro existente que aponte para outro lugar.
 */
export async function ensureDnsRecord(input: EnsureDnsInput): Promise<EnsureDnsResult> {
  const { zoneId, token, hostname, type, content } = input;
  const existentes = await listDnsRecords(zoneId, token, hostname);
  const mesmoTipo = existentes.find((r) => r.type === type);
  const outros = existentes.filter((r) => r.type !== type && (r.type === "A" || r.type === "AAAA" || r.type === "CNAME"));

  // Um CNAME não pode coexistir com A/AAAA no mesmo nome: remove os conflitantes.
  for (const o of outros) {
    await cfFetch(`/zones/${zoneId}/dns_records/${o.id}`, token, { method: "DELETE" });
  }

  const body = JSON.stringify({ type, name: hostname, content, proxied: true, ttl: 1, comment: "HF redirect" });

  if (mesmoTipo) {
    if (mesmoTipo.content.toLowerCase() === content.toLowerCase() && mesmoTipo.proxied) {
      return { recordId: mesmoTipo.id, action: "unchanged" };
    }
    const upd = await cfFetch<DnsRecord>(`/zones/${zoneId}/dns_records/${mesmoTipo.id}`, token, {
      method: "PUT",
      body,
    });
    return { recordId: upd.result.id, action: "updated" };
  }

  const criado = await cfFetch<DnsRecord>(`/zones/${zoneId}/dns_records`, token, { method: "POST", body });
  return { recordId: criado.result.id, action: "created" };
}

export async function deleteDnsRecord(zoneId: string, token: string, recordId: string): Promise<void> {
  try {
    await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, token, { method: "DELETE" });
  } catch (e) {
    // Registro já removido à mão não é erro.
    if (e instanceof CloudflareError && /not found|does not exist/i.test(e.message)) return;
    throw e;
  }
}

/**
 * Checa se o hostname já cai NESTA instância do HF (via /hf/ping).
 * Tolera 522/525/526 (SSL da Cloudflare ainda propagando).
 */
export async function checkReachability(
  hostname: string,
  instanceId: string
): Promise<{ ok: boolean; status: number | null; detail: string }> {
  try {
    const res = await fetch(`https://${hostname}/hf/ping?t=${Date.now()}`, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: { "cache-control": "no-cache" },
    });
    if (res.status !== 200) {
      return { ok: false, status: res.status, detail: `HTTP ${res.status} ao acessar https://${hostname}/hf/ping` };
    }
    const j = (await res.json().catch(() => null)) as { hf?: boolean; instance?: string } | null;
    if (!j?.hf) return { ok: false, status: 200, detail: "O host respondeu, mas não é o HF (outro site está lá?)." };
    if (j.instance !== instanceId) {
      return { ok: false, status: 200, detail: `O host responde a OUTRA instância do HF (${j.instance}).` };
    }
    return { ok: true, status: 200, detail: "OK: o domínio chega neste HF." };
  } catch (e) {
    return { ok: false, status: null, detail: `Sem resposta: ${(e as Error).message}` };
  }
}
