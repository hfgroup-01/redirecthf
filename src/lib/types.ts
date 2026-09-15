export type DomainStatus = "pending" | "dns_ok" | "active" | "error";
export type DnsType = "A" | "CNAME";
export type LinkMode = "redirect" | "page";
export type Role = "admin" | "client";

/** Conteúdo da página white (informativa). Domínio sobrescreve o padrão; link sobrescreve título/corpo. */
export interface PageConfig {
  companyName?: string;
  headline?: string;
  subheadline?: string;
  steps?: string[];
  aboutTitle?: string;
  aboutText?: string;
  phone?: string;
  email?: string;
  address?: string;
  cnpj?: string;
  website?: string;
  primaryColor?: string;
  footerNote?: string;
}

export interface Domain {
  id: string;
  hostname: string;
  zoneId: string | null;
  zoneName: string | null;
  accountId: string | null;
  hasToken: boolean;
  dnsRecordId: string | null;
  dnsType: DnsType | null;
  dnsTarget: string | null;
  status: DomainStatus;
  lastError: string | null;
  lastCheckAt: string | null;
  pageConfig: PageConfig;
  active: boolean;
  /** ON = códigos redirecionam; OFF = tudo cai na página white. */
  redirectsEnabled: boolean;
  /** Código(s) da meta tag facebook-domain-verification (vários separados por vírgula). */
  fbCode: string | null;
  cnpj: string | null;
  /** Dono do domínio (cliente). null = do admin / sem dono. Só o admin altera. */
  clientId: string | null;
  clientName?: string | null;
  /** Zona curinga que cobre este host (sem registro DNS próprio). */
  wildcardId: string | null;
  wildcardBase?: string | null;
  createdAt: string;
  updatedAt: string;
  linksCount?: number;
}

/** Zona com registro `*` proxied apontando para o HF: subdomínios nascem prontos. */
export interface Wildcard {
  id: string;
  baseHostname: string;
  zoneId: string | null;
  zoneName: string | null;
  accountId: string | null;
  hasToken: boolean;
  dnsRecordId: string | null;
  dnsType: DnsType | null;
  dnsTarget: string | null;
  status: DomainStatus;
  lastError: string | null;
  lastCheckAt: string | null;
  createdAt: string;
  updatedAt: string;
  domainsCount?: number;
}

export interface UserView {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  clientId: string | null;
  clientName?: string | null;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OptOut {
  id: number;
  ts: string;
  host: string | null;
  code: string | null;
  lead: string | null;
  contact: string | null;
  ua: string | null;
}

export interface Client {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  notes: string | null;
  defaultDomainId: string | null;
  defaultUrl: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  linksCount?: number;
  clicksCount?: number;
  domainsCount?: number;
  usersCount?: number;
  defaultDomainHostname?: string | null;
}

export interface Link {
  id: string;
  code: string;
  clientId: string | null;
  domainId: string | null;
  label: string | null;
  destinationUrl: string | null;
  mode: LinkMode;
  appendQuery: boolean;
  pageTitle: string | null;
  pageBody: string | null;
  active: boolean;
  clicksCount: number;
  lastClickAt: string | null;
  createdAt: string;
  updatedAt: string;
  clientName?: string | null;
  clientSlug?: string | null;
  domainHostname?: string | null;
  /** URL pública montada (https://<host>/<code>). */
  url?: string | null;
}

export interface Click {
  id: number;
  linkId: string;
  ts: string;
  host: string | null;
  country: string | null;
  ua: string | null;
  referer: string | null;
  query: string | null;
  outcome: string;
}

export interface LinkEvent {
  id: number;
  linkId: string;
  ts: string;
  actor: string;
  userId: string | null;
  action: string;
  detail: string | null;
}

export type PanelHostSource = "env" | "setting" | "none";

export interface SettingsView {
  instanceId: string;
  apiKey: string;
  dnsTargetMode: DnsType;
  dnsTargetValue: string;
  hasDefaultToken: boolean;
  pageDefaults: PageConfig;
  clicksRetentionDays: number;
  /** Host onde o painel e a API respondem (além de localhost). */
  panelHost: string;
  panelHostSource: PanelHostSource;
}

export interface Paginado<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
