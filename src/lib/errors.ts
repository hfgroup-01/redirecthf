/**
 * Erros HTTP que stores e rotas lançam. `tratarErro` (http.ts) transforma em
 * resposta JSON com o status certo. Fica num módulo sem dependências para os
 * stores poderem usar sem importar next/server.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (m: string) => new HttpError(400, m);
export const forbidden = (m = "Sem permissão para isso.") => new HttpError(403, m);
export const notFound = (m = "Não encontrado.") => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);
