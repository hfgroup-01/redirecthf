/**
 * Escopo de visibilidade: `clientId` null = admin (vê tudo); string = só as
 * linhas daquele cliente. É o ÚLTIMO parâmetro obrigatório de todo store
 * exposto a rotas/páginas, para o tsc obrigar a decidir em cada chamada.
 */
export interface Scope {
  clientId: string | null;
}

export const ADMIN_SCOPE: Scope = { clientId: null };

export const escopado = (s: Scope): s is { clientId: string } => s.clientId !== null;
