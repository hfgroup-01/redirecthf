/**
 * Smoke test de ponta a ponta contra um servidor HF rodando (padrão :3100).
 * Não toca na Cloudflare (domínios e zona curinga são criados com provision:false).
 *
 *   node scripts/smoke.mjs [baseUrl]
 *
 * Primeiro usuário: o teste cria o admin via /auth/setup. Se já existir (409),
 * usa HF_SMOKE_EMAIL / HF_SMOKE_PASSWORD do ambiente para logar.
 */
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
if (existsSync(path.join(raiz, ".env"))) {
  for (const linha of readFileSync(path.join(raiz, ".env"), "utf-8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const BASE = process.argv[2] || "http://127.0.0.1:3100";
const TS = Date.now();
const BASE_CURINGA = `smoke-${TS}.exemplo.com.br`;
const HOST_A = `smoke-a-${TS}.exemplo.com.br`;
const HOST_B = `smoke-b-${TS}.exemplo.com.br`;
const HOST_DESCONHECIDO = `desconhecido-${TS}.exemplo.com`;
let falhas = 0;

const ok = (cond, msg) => {
  console.log(`${cond ? "  ✔" : "  ✘"} ${msg}`);
  if (!cond) falhas++;
};

/** Um jar por sessão (admin, cliente…). */
const admin = { cookie: "" };
const cliente = { cookie: "" };
const anon = { cookie: "" };

// http.request em vez de fetch: o fetch do Node (undici) descarta o header
// "host", e o teste precisa simular o domínio de redirect.
const base = new URL(BASE);
function call(path, { method = "GET", body, headers = {}, jar = admin, raw } = {}) {
  return new Promise((resolve, reject) => {
    const data = raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: base.hostname,
        port: base.port || 80,
        path,
        method,
        headers: {
          "content-type": raw !== undefined ? "application/x-www-form-urlencoded" : "application/json",
          cookie: jar.cookie,
          ...(data ? { "content-length": Buffer.byteLength(data) } : {}),
          ...headers,
        },
      },
      (res) => {
        let texto = "";
        res.setEncoding("utf8");
        res.on("data", (d) => (texto += d));
        res.on("end", () => {
          const sc = res.headers["set-cookie"];
          if (sc?.length) {
            const v = sc[0].split(";")[0];
            jar.cookie = v.endsWith("=") ? "" : v;
          }
          let json = null;
          try {
            json = texto ? JSON.parse(texto) : null;
          } catch {
            /* html */
          }
          resolve({ status: res.statusCode, json, texto, headers: { get: (k) => res.headers[k.toLowerCase()] ?? null } });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

console.log(`HF smoke test @ ${BASE}`);

// 1. health
{
  const r = await call("/api/v1/health", { jar: anon });
  ok(r.status === 200 && r.json?.ok, `health ok (schema v${r.json?.db?.versao}, ${r.json?.db?.driver})`);
}

// 2. setup do primeiro admin (ou login)
{
  const email = `smoke-admin-${TS}@hf.local`;
  const setup = await call("/api/v1/auth/setup", {
    method: "POST",
    body: { email, name: "Smoke Admin", password: "smoke-teste-123", currentAdminPassword: process.env.HF_ADMIN_PASSWORD ?? "" },
  });
  if (setup.status === 409) {
    const e = process.env.HF_SMOKE_EMAIL;
    const p = process.env.HF_SMOKE_PASSWORD;
    if (!e || !p) console.log("  (aviso) já existe usuário: defina HF_SMOKE_EMAIL e HF_SMOKE_PASSWORD para logar");
    const login = await call("/api/v1/auth/login", { method: "POST", body: { email: e, password: p } });
    ok(login.status === 200 && login.json?.role === "admin", "login do admin existente");
  } else {
    ok(setup.status === 200 && setup.json?.user?.role === "admin", `setup criou o admin ${email} e logou`);
  }
  const me = await call("/api/v1/me");
  ok(me.status === 200 && me.json?.actor?.role === "admin" && me.json?.actor?.clientId === null, "GET /me: admin sem escopo");
  const errado = await call("/api/v1/auth/login", { method: "POST", body: { email: "ninguem@hf.local", password: "x" }, jar: anon });
  ok(errado.status === 401, "login com usuário inexistente -> 401");
}

// 3. settings + api key
let apiKey = "";
{
  const r = await call("/api/v1/settings");
  ok(r.status === 200 && r.json?.settings?.apiKey, "settings + apiKey");
  apiKey = r.json?.settings?.apiKey ?? "";
  const r2 = await call("/api/v1/settings", { jar: anon, headers: { "x-api-key": apiKey } });
  ok(r2.status === 200, "autenticação por x-api-key");
  const r3 = await call("/api/v1/settings", { jar: anon, headers: { "x-api-key": "errada" } });
  ok(r3.status === 401, "chave errada -> 401");
  const me = await call("/api/v1/me", { jar: anon, headers: { "x-api-key": apiKey } });
  ok(me.status === 200 && me.json?.actor?.kind === "api" && me.json?.actor?.role === "admin", "chave de API age como admin");
}

// 4. regra de host: painel só em localhost / host do painel
{
  const a = await call("/admin", { jar: anon, headers: { host: HOST_DESCONHECIDO } });
  ok(a.status === 404, "GET /admin em host desconhecido -> 404");
  const b = await call("/", { jar: anon, headers: { host: HOST_DESCONHECIDO } });
  ok(b.status === 404 && b.texto.includes("Página não encontrada"), "GET / em host desconhecido -> 404 neutro");
  const c = await call("/api/v1/health", { jar: anon, headers: { host: HOST_DESCONHECIDO } });
  ok(c.status === 404, "GET /api/v1/health em host desconhecido -> 404");
  const d = await call("/qualquer-codigo", { jar: anon, headers: { host: HOST_DESCONHECIDO } });
  ok(d.status === 404 && d.texto.includes("Página não encontrada"), "GET /<codigo> em host desconhecido -> 404 neutro");
  const e = await call("/admin");
  ok(e.status === 200 || e.status === 307, "GET /admin em localhost com sessão -> painel");
  const f = await call("/", { jar: anon });
  ok(f.status === 302 && (f.headers.get("location") ?? "").endsWith("/admin"), "raiz no host do painel -> /admin");
}

// 5. zona curinga (sem tocar na Cloudflare) + subdomínio label.base
let wildcardId = "";
let domainWc = null;
{
  const r = await call("/api/v1/wildcards", { method: "POST", body: { base: BASE_CURINGA, provision: false } });
  ok(r.status === 201 && r.json?.wildcard?.baseHostname === BASE_CURINGA && r.json?.wildcard?.status === "pending", `zona curinga criada: *.${BASE_CURINGA}`);
  wildcardId = r.json?.wildcard?.id;
  const d = await call("/api/v1/domains", { method: "POST", body: { label: "Minha BM", base: BASE_CURINGA, provision: false } });
  ok(d.status === 400, "label inválido (com espaço) -> 400");
  const d2 = await call("/api/v1/domains", { method: "POST", body: { label: "minhabm", base: BASE_CURINGA, provision: false } });
  ok(d2.status === 201 && d2.json?.domain?.hostname === `minhabm.${BASE_CURINGA}` && d2.json?.domain?.wildcardId === wildcardId, `subdomínio via curinga: ${d2.json?.domain?.hostname}`);
  domainWc = d2.json?.domain;
  const del = await call(`/api/v1/wildcards/${wildcardId}`, { method: "DELETE" });
  ok(del.status === 409, "remover zona curinga em uso -> 409");
}

// 6. domínios A e B + clientes c1 (dono de A) e c2 (dono de B)
let domA = null;
let domB = null;
let c1 = null;
let c2 = null;
{
  const a = await call("/api/v1/domains", { method: "POST", body: { hostname: HOST_A, provision: false, pageConfig: { companyName: "Empresa A LTDA", headline: "Reunião confirmada (A)" } } });
  const b = await call("/api/v1/domains", { method: "POST", body: { hostname: HOST_B, provision: false, pageConfig: { companyName: "Empresa B LTDA", headline: "Reunião confirmada (B)" } } });
  ok(a.status === 201 && b.status === 201, `domínios criados: ${HOST_A}, ${HOST_B}`);
  domA = a.json?.domain;
  domB = b.json?.domain;
  const r1 = await call("/api/v1/clients", { method: "POST", body: { name: "Cliente Um", defaultDomainId: domA.id, defaultUrl: "https://example.org/c1" } });
  const r2 = await call("/api/v1/clients", { method: "POST", body: { name: "Cliente Dois", defaultDomainId: domB.id, defaultUrl: "https://example.org/c2" } });
  ok(r1.status === 201 && r2.status === 201, `clientes criados: ${r1.json?.client?.slug}, ${r2.json?.client?.slug}`);
  c1 = r1.json?.client;
  c2 = r2.json?.client;
  const da = await call(`/api/v1/domains/${domA.id}`);
  ok(da.status === 200 && da.json?.domain?.clientId === c1.id, "domínio padrão do cliente passou a pertencer ao cliente");
  const semDono = await call("/api/v1/domains?unassigned=1");
  ok(semDono.status === 200 && semDono.json?.domains?.some((d) => d.id === domainWc.id) && !semDono.json?.domains?.some((d) => d.id === domA.id), "lista de domínios sem dono");
}

// 7. login do cliente (senha temporária -> troca obrigatória)
let userC1 = null;
let senhaC1 = "senha-nova-c1-123";
{
  const email = `smoke-c1-${TS}@hf.local`;
  const r = await call("/api/v1/users", { method: "POST", body: { email, name: "Usuário C1", role: "client", clientId: c1.id } });
  ok(r.status === 201 && r.json?.tempPassword && r.json?.user?.mustChangePassword, `login do cliente criado (${email}) com senha temporária`);
  userC1 = r.json?.user;
  const login = await call("/api/v1/auth/login", { method: "POST", body: { email, password: r.json?.tempPassword }, jar: cliente });
  ok(login.status === 200 && login.json?.role === "client" && login.json?.mustChangePassword === true, "cliente logou com a senha temporária");
  const troca = await call("/api/v1/me/password", { method: "PATCH", body: { currentPassword: r.json?.tempPassword, newPassword: senhaC1 }, jar: cliente });
  ok(troca.status === 200, "cliente trocou a senha");
  const me = await call("/api/v1/me", { jar: cliente });
  ok(me.status === 200 && me.json?.actor?.role === "client" && me.json?.actor?.clientId === c1.id && me.json?.user?.mustChangePassword === false, "sessão continua válida após a troca (cookie re-emitido)");
  const users = await call("/api/v1/users", { jar: cliente });
  ok(users.status === 403, "cliente não lista usuários (403)");
}

// 8. escopo do cliente
let linkX1 = null;
let linkY1 = null;
{
  const ds = await call("/api/v1/domains", { jar: cliente });
  ok(ds.status === 200 && ds.json?.domains?.length === 1 && ds.json.domains[0].id === domA.id, "cliente só vê o próprio domínio");
  const db = await call(`/api/v1/domains/${domB.id}`, { jar: cliente });
  ok(db.status === 404, "domínio de outro cliente -> 404");
  const cl = await call("/api/v1/clients", { jar: cliente });
  ok(cl.status === 403, "cliente não lista clientes (403)");
  const proprio = await call(`/api/v1/clients/${c1.id}`, { jar: cliente });
  const outro = await call(`/api/v1/clients/${c2.id}`, { jar: cliente });
  ok(proprio.status === 200 && outro.status === 404, "cliente vê o próprio cadastro e não o de outro");
  const criar = await call("/api/v1/domains", { method: "POST", body: { hostname: `x-${TS}.exemplo.com.br`, provision: false }, jar: cliente });
  ok(criar.status === 403, "cliente não cria domínio (403)");
  const host = await call(`/api/v1/domains/${domA.id}`, { method: "PATCH", body: { hostname: "outro.exemplo.com.br" }, jar: cliente });
  ok(host.status === 403, "cliente não troca o hostname (403)");
  const off = await call(`/api/v1/domains/${domA.id}`, { method: "PATCH", body: { redirectsEnabled: false, fbCode: "codigoC1", pageConfig: { companyName: "Empresa A LTDA", phone: "11 99999-0000" } }, jar: cliente });
  ok(off.status === 200 && off.json?.domain?.redirectsEnabled === false && off.json?.domain?.fbCode === "codigoC1", "cliente liga/desliga o redirect e edita meta tag/página");
  await call(`/api/v1/domains/${domA.id}`, { method: "PATCH", body: { redirectsEnabled: true }, jar: cliente });
  const errado = await call("/api/v1/links", { method: "POST", body: { domainId: domB.id, destinationUrl: "https://example.org/hack" }, jar: cliente });
  ok(errado.status === 400 || errado.status === 404, "cliente não cria link em domínio de outro (400/404)");
  const x = await call("/api/v1/links", { method: "POST", body: { domainId: domA.id, destinationUrl: "https://example.org/c1-x", label: "X" }, jar: cliente });
  ok(x.status === 201 && x.json?.link?.clientId === c1.id && x.json?.link?.url === `https://${HOST_A}/${x.json?.link?.code}`, `cliente criou link: ${x.json?.link?.url}`);
  linkX1 = x.json?.link;
  const y = await call("/api/v1/links", { method: "POST", body: { destinationUrl: "https://example.org/c1-y", label: "Y" }, jar: cliente });
  ok(y.status === 201 && y.json?.link?.domainId === domA.id, "sem domainId usa o domínio padrão do cliente");
  linkY1 = y.json?.link;
  const reservado = await call("/api/v1/links", { method: "POST", body: { domainId: domA.id, code: "admin", destinationUrl: "https://x.y" }, jar: cliente });
  ok(reservado.status >= 400, "código reservado 'admin' é rejeitado");
}

// 9. mesmo código em domínios diferentes (admin)
let linkX2 = null;
{
  const r = await call("/api/v1/links", { method: "POST", body: { clientId: c2.id, domainId: domB.id, code: linkX1.code, destinationUrl: "https://example.org/c2-x" } });
  ok(r.status === 201 && r.json?.link?.domainId === domB.id, `mesmo código /${linkX1.code} criado no domínio B`);
  linkX2 = r.json?.link;
  const dup = await call("/api/v1/links", { method: "POST", body: { clientId: c1.id, domainId: domA.id, code: linkX1.code, destinationUrl: "https://x.y" } });
  ok(dup.status === 400 || dup.status === 500, "código duplicado NO MESMO domínio é rejeitado");
  const posse = await call("/api/v1/links", { method: "POST", body: { clientId: c1.id, domainId: domB.id, destinationUrl: "https://x.y" } });
  ok(posse.status === 400, "admin não cria link de c1 no domínio de c2 (400)");
}

// 10. redirect só no host certo
{
  const a = await call(`/${linkX1.code}?utm_source=whatsapp&l=5511999`, { jar: anon, headers: { host: HOST_A } });
  const la = a.headers.get("location") ?? "";
  ok(a.status === 302 && la.startsWith("https://example.org/c1-x?") && la.includes("l=5511999"), `/${linkX1.code} em A -> 302 ${la}`);
  const b = await call(`/${linkX1.code}`, { jar: anon, headers: { host: HOST_B } });
  ok(b.status === 302 && b.headers.get("location") === "https://example.org/c2-x", `/${linkX1.code} em B -> destino de c2`);
  const yb = await call(`/${linkY1.code}`, { jar: anon, headers: { host: HOST_B } });
  ok(yb.status === 404 && yb.texto.includes("Empresa B LTDA"), `/${linkY1.code} só existe em A: em B -> 404 com página white de B`);
  const ya = await call(`/${linkY1.code}`, { jar: anon, headers: { host: HOST_A } });
  ok(ya.status === 302 && ya.headers.get("location") === "https://example.org/c1-y", `/${linkY1.code} em A -> 302`);
  const raiz = await call("/", { jar: anon, headers: { host: HOST_A } });
  ok(raiz.status === 200 && raiz.texto.includes("Empresa A LTDA") && raiz.texto.includes('<meta name="facebook-domain-verification" content="codigoC1">'), "raiz de A: página white com a meta tag salva pelo cliente");
  const priv = await call("/privacidade", { jar: anon, headers: { host: HOST_A } });
  ok(priv.status === 200 && priv.texto.includes("Política de privacidade"), "/privacidade responde no domínio");
  const adm = await call("/admin", { jar: anon, headers: { host: HOST_A } });
  ok(adm.status === 404, "GET /admin num domínio de redirect -> 404");
}

// 11. escopo nos links (cliente)
{
  const g = await call(`/api/v1/links/${linkX2.id}`, { jar: cliente });
  ok(g.status === 404, "link de outro cliente -> 404");
  const p = await call(`/api/v1/links/${linkX2.id}`, { method: "PATCH", body: { destinationUrl: "https://example.org/hack" }, jar: cliente });
  ok(p.status === 404, "PATCH em link de outro cliente -> 404");
  const bulk = await call("/api/v1/links/bulk", { method: "POST", body: { clientId: c2.id, active: false }, jar: cliente });
  ok(bulk.status === 404, "bulk no cliente de outro -> 404");
  const bulkOk = await call("/api/v1/links/bulk", { method: "POST", body: { destinationUrl: "https://example.org/c1-bulk" }, jar: cliente });
  ok(bulkOk.status === 200 && bulkOk.json?.updated === 2, `bulk sem clientId usa o próprio cliente (${bulkOk.json?.updated} links)`);
  const lista = await call("/api/v1/links", { jar: cliente });
  ok(lista.status === 200 && lista.json?.items?.length === 2 && lista.json.items.every((l) => l.clientId === c1.id), "cliente lista só os próprios links");
  const porCodigo = await call(`/api/v1/links/${linkX1.code}`, { method: "PATCH", body: { destinationUrl: "https://example.org/c1-x2" }, jar: cliente });
  ok(porCodigo.status === 200 && porCodigo.json?.link?.id === linkX1.id, "PATCH pelo código resolve o link do próprio escopo");
  const red = await call(`/${linkX1.code}`, { jar: anon, headers: { host: HOST_A } });
  ok(red.status === 302 && red.headers.get("location") === "https://example.org/c1-x2", "redirect já usa o novo destino (cache invalidado por domínio+código)");
  const amb = await call(`/api/v1/resolve/${linkX1.code}`);
  ok(amb.status === 400, "admin: resolve por código ambíguo pede ?host= (400)");
  const res = await call(`/api/v1/resolve/${linkX1.code}?host=${HOST_B}`);
  ok(res.status === 200 && res.json?.link?.id === linkX2.id, "resolve com ?host= acha o link certo");
  const resC = await call(`/api/v1/resolve/${linkX1.code}`, { jar: cliente });
  ok(resC.status === 200 && resC.json?.link?.id === linkX1.id, "cliente: resolve por código sem ambiguidade no escopo");
}

// 12. pausa / modo página / cliente OFF
{
  await call(`/api/v1/links/${linkX1.id}`, { method: "PATCH", body: { active: false }, jar: cliente });
  const r1 = await call(`/${linkX1.code}`, { jar: anon, headers: { host: HOST_A } });
  ok(r1.status === 200 && r1.texto.includes("<html"), "link pausado -> página white 200");
  await call(`/api/v1/links/${linkX1.id}`, { method: "PATCH", body: { active: true, mode: "page", pageTitle: "Título do link smoke" }, jar: cliente });
  const r2 = await call(`/${linkX1.code}`, { jar: anon, headers: { host: HOST_A } });
  ok(r2.status === 200 && r2.texto.includes("Título do link smoke"), "modo página usa o título do link");
  await call(`/api/v1/links/${linkX1.id}`, { method: "PATCH", body: { mode: "redirect" }, jar: cliente });
  await call(`/api/v1/clients/${c1.id}`, { method: "PATCH", body: { active: false } });
  const r3 = await call(`/${linkX1.code}`, { jar: anon, headers: { host: HOST_A } });
  ok(r3.status === 200 && r3.texto.includes("<html"), "cliente OFF -> links do cliente mostram página white na hora");
  await call(`/api/v1/clients/${c1.id}`, { method: "PATCH", body: { active: true } });
  const r4 = await call(`/${linkX1.code}`, { jar: anon, headers: { host: HOST_A } });
  ok(r4.status === 302, "cliente ON -> volta a redirecionar");
}

// 13. opt-out escopado
{
  const body = "confirm=1&contact=%2855%29+11+99999-0000&code=" + linkX1.code + "&l=5511999990000";
  const r = await call("/opt-out", { method: "POST", raw: body, jar: anon, headers: { host: HOST_A } });
  ok(r.status === 200 && r.texto.includes("Você não receberá mais mensagens"), "POST /opt-out em A registra e confirma");
  const rb = await call("/opt-out", { method: "POST", raw: "confirm=1&code=zzz", jar: anon, headers: { host: HOST_B } });
  ok(rb.status === 200, "POST /opt-out em B registra");
  const rd = await call("/opt-out", { method: "POST", raw: "confirm=1", jar: anon, headers: { host: HOST_DESCONHECIDO } });
  ok(rd.status === 404, "POST /opt-out em host desconhecido -> 404");
  const lista = await call("/api/v1/optouts", { jar: cliente });
  ok(lista.status === 200 && lista.json?.items?.length >= 1 && lista.json.items.every((o) => o.host === HOST_A), "cliente só vê opt-outs dos próprios domínios");
  const csv = await call("/api/v1/optouts?format=csv", { jar: cliente });
  ok(csv.status === 200 && csv.texto.startsWith("ts;contact;lead;code;host") && csv.texto.includes(HOST_A) && !csv.texto.includes(HOST_B), "CSV de opt-outs escopado");
  const todos = await call("/api/v1/optouts");
  const deB = todos.json?.items?.find((o) => o.host === HOST_B);
  const delOutro = await call(`/api/v1/optouts/${deB?.id}`, { method: "DELETE", jar: cliente });
  ok(delOutro.status === 404, "cliente não apaga opt-out de outro domínio (404)");
  const meu = lista.json?.items?.[0];
  const delMeu = await call(`/api/v1/optouts/${meu?.id}`, { method: "DELETE", jar: cliente });
  ok(delMeu.status === 200, "cliente apaga o próprio opt-out");
  if (deB?.id) await call(`/api/v1/optouts/${deB.id}`, { method: "DELETE" });
}

// 14. impersonação
{
  const imp = await call("/api/v1/auth/impersonate", { method: "POST", body: { clientId: c1.id } });
  ok(imp.status === 200, "admin entrou como cliente c1");
  const me = await call("/api/v1/me");
  ok(me.json?.actor?.role === "client" && me.json?.actor?.clientId === c1.id && me.json?.actor?.impersonating?.clientId === c1.id, "GET /me mostra impersonação");
  const links = await call("/api/v1/links");
  ok(links.status === 200 && links.json?.items?.every((l) => l.clientId === c1.id), "impersonando, só vê links de c1");
  const cfg = await call("/api/v1/settings");
  ok(cfg.status === 403, "impersonando, não acessa configurações (403)");
  const volta = await call("/api/v1/auth/impersonate", { method: "DELETE" });
  const me2 = await call("/api/v1/me");
  ok(volta.status === 200 && me2.json?.actor?.role === "admin", "voltou a ser admin");
  const impKey = await call("/api/v1/auth/impersonate", { method: "POST", body: { clientId: c1.id }, jar: anon, headers: { "x-api-key": apiKey } });
  ok(impKey.status === 403, "chave de API não impersona (403)");
}

// 15. cliques, eventos com autor, stats do cliente
{
  await new Promise((r) => setTimeout(r, 1600));
  const r = await call(`/api/v1/links/${linkX1.id}`, { jar: cliente });
  ok(r.status === 200 && r.json?.link?.clicksCount >= 3, `clicks_count = ${r.json?.link?.clicksCount} (>= 3)`);
  const eventos = r.json?.events ?? [];
  ok(eventos.length >= 3 && eventos.every((e) => typeof e.actor === "string" && e.actor.startsWith("user:")), `eventos com autor (${eventos[0]?.actor})`);
  const clicks = await call(`/api/v1/links/${linkX1.id}/clicks`, { jar: cliente });
  ok(clicks.status === 200 && clicks.json?.total >= 3, `log de cliques: ${clicks.json?.total}`);
  const stats = await call("/api/v1/stats", { jar: cliente });
  ok(stats.status === 200 && stats.json?.clicksToday >= 3 && stats.json?.domainsTotal === 1, `stats do cliente: ${stats.json?.clicksToday} cliques hoje, ${stats.json?.domainsTotal} domínio`);
  const statsAdmin = await call("/api/v1/stats");
  ok(statsAdmin.status === 200 && statsAdmin.json?.domainsTotal >= 3, "stats do admin veem tudo");
}

// 16. reset de senha derruba a sessão
{
  const r = await call(`/api/v1/users/${userC1.id}/reset-password`, { method: "POST" });
  ok(r.status === 200 && r.json?.tempPassword, "reset gerou senha temporária");
  const me = await call("/api/v1/me", { jar: cliente });
  ok(me.status === 401, "sessão antiga do cliente caiu (401)");
}

// 17. reatribuição de domínio move os links
{
  const r = await call(`/api/v1/domains/${domA.id}`, { method: "PATCH", body: { clientId: c2.id } });
  ok(r.status === 200 && r.json?.domain?.clientId === c2.id, "domínio A passou para c2");
  const l = await call(`/api/v1/links/${linkX1.id}`);
  ok(l.status === 200 && l.json?.link?.clientId === c2.id, "links de A foram junto para c2");
  const c1Atual = await call(`/api/v1/clients/${c1.id}`);
  ok(c1Atual.json?.client?.defaultDomainId === null, "c1 perdeu o domínio padrão");
}

// 18. limpeza
{
  const u = await call(`/api/v1/users/${userC1.id}`, { method: "DELETE" });
  ok(u.status === 200, "login do cliente removido");
  const d1 = await call(`/api/v1/clients/${c1.id}`, { method: "DELETE" });
  const d2 = await call(`/api/v1/clients/${c2.id}`, { method: "DELETE" });
  ok(d1.status === 200 && d2.status === 200, "clientes removidos (links em cascata)");
  const da = await call(`/api/v1/domains/${domA.id}`, { method: "DELETE" });
  const db = await call(`/api/v1/domains/${domB.id}`, { method: "DELETE" });
  const dw = await call(`/api/v1/domains/${domainWc.id}`, { method: "DELETE" });
  ok(da.status === 200 && db.status === 200 && dw.status === 200, "domínios removidos");
  const w = await call(`/api/v1/wildcards/${wildcardId}`, { method: "DELETE" });
  ok(w.status === 200, "zona curinga removida");
  const r2 = await call(`/${linkX1.code}`, { jar: anon, headers: { host: HOST_A } });
  ok(r2.status === 404, "host removido -> 404");
}

console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo OK.");
process.exit(falhas ? 1 : 0);
