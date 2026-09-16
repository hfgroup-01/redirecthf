/**
 * Atalho de escala: garante que `<label>.<base>` exista como domínio de uma
 * zona curinga, criando na hora quando ainda não existe. Como o `*` da zona já
 * está no DNS, o subdomínio nasce pronto — nenhuma chamada à Cloudflare.
 *
 * Existe porque o fluxo normal é cadastrar o domínio em Domínios e só depois
 * criar o link; com mais de mil BMs isso dobra o trabalho a cada BM nova.
 */
import { provisionDomain } from "@/lib/domainSetup";
import { badRequest } from "@/lib/errors";
import { validarHostname, validarLabel } from "@/lib/http";
import { createDomain, getDomainByHostnameAny } from "@/lib/stores/domains";
import { getWildcardByBase } from "@/lib/stores/wildcards";
import type { Domain } from "@/lib/types";

/**
 * "Driggo Restaurante" -> "driggorestaurante". Diferente de POST /domains, que
 * exige o label já pronto: aqui o nome vem da planilha de BMs como o cliente
 * escreveu, e recusar por causa de um espaço só daria trabalho manual.
 */
function normalizarLabel(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]/g, "");
}

export interface SubdominioInput {
  /** Nome da BM: só o primeiro nível. Aceita "Driggo Restaurante". */
  label: string;
  /** Base da zona curinga já cadastrada (ex.: "lumix11.cfd"). */
  base: string;
  clientId?: string | null;
  /** default true: confere se o host já responde (1 request, sem Cloudflare). */
  provision?: boolean;
}

export async function garantirSubdominio(input: SubdominioInput): Promise<{ domain: Domain; criado: boolean }> {
  const base = validarHostname(input.base ?? "");
  const wc = await getWildcardByBase(base);
  // Não exige a zona `active`: é a mesma regra de POST /domains com label+base.
  // Zona ainda sem DNS só significa que o domínio nasce com status de erro.
  if (!wc) throw badRequest(`A zona curinga "${base}" não está cadastrada. Cadastre em Domínios > Zonas curinga.`);
  const hostname = `${validarLabel(normalizarLabel(input.label ?? ""))}.${wc.baseHostname}`;
  const clientId = input.clientId || null;

  // Reaproveita: criar vários links na mesma BM não pode exigir cadastrar o domínio de novo.
  const existente = await getDomainByHostnameAny(hostname);
  if (existente) {
    if ((existente.clientId ?? null) !== clientId) {
      const dono = existente.clientName ? `o cliente ${existente.clientName}` : "ninguém (está sem dono)";
      throw badRequest(`O domínio ${hostname} já existe e pertence a ${dono}. Escolha esse cliente ou outro nome de BM.`);
    }
    return { domain: existente, criado: false };
  }

  const domain = await createDomain({ hostname, clientId, wildcardId: wc.id });
  if (input.provision === false) return { domain, criado: true };
  // Em zona curinga o provision não fala com a Cloudflare: só confere alcance.
  // Falhar aqui não desfaz nada — o domínio existe e serve; fica com status de erro.
  const r = await provisionDomain(domain.id);
  return { domain: r.domain, criado: true };
}
