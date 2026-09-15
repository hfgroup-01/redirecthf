/**
 * Página white (informativa) servida na raiz do domínio de redirect, em links
 * no modo "page" e em códigos desconhecidos. HTML puro (sem React) para ser
 * barato no hot path e idêntico em qualquer host.
 *
 * Sempre inclui: meta tag de verificação do Facebook (se o domínio tiver
 * código) e o bloco de opt-out ("não quero mais receber mensagens").
 */
import type { PageConfig } from "@/lib/types";

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragrafos(texto: string): string {
  return texto
    .split(/\n{2,}|\r\n\r\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function corValida(c: string | undefined): string {
  return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#1f6feb";
}

/** "abc, def" -> ["abc","def"] (a BM pode pedir mais de um código por domínio). */
export function fbCodes(fbCode: string | null | undefined): string[] {
  return (fbCode ?? "")
    .split(/[\s,;]+/)
    .map((c) => c.trim())
    .filter(Boolean);
}

function fbMetaTags(fbCode: string | null | undefined): string {
  return fbCodes(fbCode)
    .map((c) => `<meta name="facebook-domain-verification" content="${esc(c)}">`)
    .join("\n");
}

export interface RenderOpts {
  titleOverride?: string | null;
  bodyOverride?: string | null;
  hostname?: string;
  fbCode?: string | null;
  /** Código do link aberto (vai escondido no formulário de opt-out). */
  code?: string | null;
  /** Identificador do lead vindo de ?l= (idem). */
  lead?: string | null;
}

function estilo(cor: string): string {
  return `
  :root{--p:${cor};--bg:#f6f7f9;--card:#ffffff;--tx:#1a1f2b;--mu:#5b6472;--bd:#e5e8ee}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,Arial,sans-serif;background:var(--bg);color:var(--tx);line-height:1.6;-webkit-font-smoothing:antialiased}
  a{color:var(--p)}
  header{background:var(--card);border-bottom:1px solid var(--bd)}
  .wrap{max-width:860px;margin:0 auto;padding:0 20px}
  .top{display:flex;align-items:center;justify-content:space-between;height:64px}
  .brand{font-weight:700;font-size:18px;letter-spacing:-.01em;display:flex;align-items:center;gap:10px}
  .brand i{display:inline-block;width:12px;height:12px;border-radius:3px;background:var(--p)}
  .hero{padding:56px 0 32px}
  .badge{display:inline-flex;align-items:center;gap:8px;background:color-mix(in srgb,var(--p) 12%,white);color:var(--p);border-radius:999px;padding:6px 14px;font-weight:600;font-size:13px}
  .badge b{width:8px;height:8px;border-radius:50%;background:var(--p);display:inline-block}
  h1{font-size:clamp(28px,5vw,40px);line-height:1.15;margin:18px 0 12px;letter-spacing:-.02em}
  .lead{font-size:18px;color:var(--mu);max-width:640px;margin:0}
  .card{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:24px;margin:18px 0}
  .card h2{margin:0 0 12px;font-size:18px}
  ol.steps{margin:0;padding-left:0;list-style:none;counter-reset:s}
  ol.steps li{position:relative;padding-left:44px;margin:12px 0;counter-increment:s}
  ol.steps li::before{content:counter(s);position:absolute;left:0;top:0;width:30px;height:30px;border-radius:50%;background:var(--p);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  @media(max-width:640px){.grid{grid-template-columns:1fr}}
  .contact dt{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--mu);margin-top:10px}
  .contact dd{margin:2px 0 0;font-weight:500}
  .optout{border-color:color-mix(in srgb,var(--p) 25%,var(--bd))}
  .optout p{margin:0 0 12px;color:var(--mu)}
  .optout label.chk{display:flex;align-items:flex-start;gap:10px;font-weight:500;margin:10px 0 14px;cursor:pointer}
  .optout label.chk input{width:18px;height:18px;margin-top:3px;accent-color:var(--p)}
  .optout .row{display:flex;gap:10px;flex-wrap:wrap}
  .optout input[type=tel]{flex:1;min-width:220px;padding:10px 12px;border:1px solid var(--bd);border-radius:8px;font-size:15px}
  .optout button{padding:10px 18px;border:0;border-radius:8px;background:var(--p);color:#fff;font-weight:600;font-size:15px;cursor:pointer}
  .optout small{display:block;margin-top:10px;color:var(--mu)}
  .done{padding:64px 0;text-align:center}
  footer{border-top:1px solid var(--bd);padding:26px 0;color:var(--mu);font-size:13px;margin-top:36px}
  footer .row{display:flex;flex-wrap:wrap;gap:10px 24px;justify-content:space-between}
  `;
}

function cabecalho(cfg: PageConfig, empresa: string): string {
  return `<header><div class="wrap top"><div class="brand"><i></i>${esc(empresa)}</div>${
    cfg.phone ? `<div style="font-size:14px;color:var(--mu)">${esc(cfg.phone)}</div>` : ""
  }</div></header>`;
}

function rodape(cfg: PageConfig, empresa: string): string {
  const ano = new Date().getFullYear();
  return `<footer><div class="wrap"><div class="row">
  <div>© ${ano} ${esc(empresa)}${cfg.cnpj ? ` · CNPJ ${esc(cfg.cnpj)}` : ""}</div>
  <div><a href="/privacidade">Política de privacidade</a> · <a href="/#sair">Não receber mensagens</a></div>
</div>${cfg.footerNote ? `<div style="margin-top:8px">${esc(cfg.footerNote)}</div>` : ""}</div></footer>`;
}

function blocoOptOut(opts: RenderOpts): string {
  return `<section class="card optout" id="sair">
    <h2>Não quer mais receber mensagens?</h2>
    <p>Se você não deseja receber comunicações deste canal no WhatsApp, marque a opção abaixo e confirme. Seu número sai da nossa lista de envios.</p>
    <form method="post" action="/opt-out">
      <input type="hidden" name="code" value="${esc(opts.code ?? "")}">
      <input type="hidden" name="l" value="${esc(opts.lead ?? "")}">
      <label class="chk"><input type="checkbox" name="confirm" value="1" required> Não desejo mais receber mensagens</label>
      <div class="row">
        <input type="tel" name="contact" inputmode="tel" maxlength="40" placeholder="Seu WhatsApp com DDD (opcional)">
        <button type="submit">Confirmar</button>
      </div>
      <small>Você pode voltar a receber mensagens entrando em contato pelos canais acima.</small>
    </form>
  </section>`;
}

export function renderWhitePage(cfg: PageConfig, opts: RenderOpts = {}): string {
  const cor = corValida(cfg.primaryColor);
  const empresa = cfg.companyName || "Central de Agendamentos";
  const titulo = opts.titleOverride?.trim() || cfg.headline || "Reunião confirmada";
  const sub = opts.bodyOverride?.trim() || cfg.subheadline || "";
  const passos = (cfg.steps ?? []).filter((s) => s && s.trim());
  const contato: [string, string][] = [];
  if (cfg.phone) contato.push(["Telefone / WhatsApp", cfg.phone]);
  if (cfg.email) contato.push(["E-mail", cfg.email]);
  if (cfg.address) contato.push(["Endereço", cfg.address]);
  if (cfg.website) contato.push(["Site", cfg.website]);

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)} · ${esc(empresa)}</title>
<meta name="description" content="${esc(sub.slice(0, 160))}">
<meta name="robots" content="noindex,nofollow">
${fbMetaTags(opts.fbCode)}
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(sub.slice(0, 200))}">
<meta property="og:type" content="website">
<style>${estilo(cor)}</style>
</head>
<body>
${cabecalho(cfg, empresa)}
<main class="wrap">
  <section class="hero">
    <span class="badge"><b></b>Agendamento</span>
    <h1>${esc(titulo)}</h1>
    ${sub ? `<div class="lead">${paragrafos(sub)}</div>` : ""}
  </section>
  ${
    passos.length
      ? `<section class="card"><h2>Próximos passos</h2><ol class="steps">${passos
          .map((p) => `<li>${esc(p)}</li>`)
          .join("")}</ol></section>`
      : ""
  }
  <div class="grid">
    ${
      cfg.aboutText
        ? `<section class="card"><h2>${esc(cfg.aboutTitle || "Sobre nós")}</h2>${paragrafos(cfg.aboutText)}</section>`
        : ""
    }
    ${
      contato.length
        ? `<section class="card"><h2>Contato</h2><dl class="contact">${contato
            .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
            .join("")}</dl></section>`
        : ""
    }
  </div>
  ${blocoOptOut(opts)}
</main>
${rodape(cfg, empresa)}
</body>
</html>`;
}

/** Confirmação depois do opt-out. */
export function renderOptOutDone(cfg: PageConfig, fbCode?: string | null): string {
  const cor = corValida(cfg.primaryColor);
  const empresa = cfg.companyName || "Central de Agendamentos";
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preferência registrada · ${esc(empresa)}</title><meta name="robots" content="noindex,nofollow">
${fbMetaTags(fbCode)}
<style>${estilo(cor)}</style></head>
<body>${cabecalho(cfg, empresa)}
<main class="wrap"><section class="done">
<span class="badge"><b></b>Preferência registrada</span>
<h1>Você não receberá mais mensagens</h1>
<p class="lead" style="margin:0 auto">Seu pedido foi registrado. Se mudar de ideia, é só entrar em contato pelos canais da ${esc(empresa)}.</p>
<p style="margin-top:28px"><a href="/">Voltar ao início</a></p>
</section></main>
${rodape(cfg, empresa)}
</body></html>`;
}

export function renderPrivacyPage(cfg: PageConfig, fbCode?: string | null): string {
  const cor = corValida(cfg.primaryColor);
  const empresa = cfg.companyName || "Central de Agendamentos";
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Política de privacidade · ${esc(empresa)}</title><meta name="robots" content="noindex,nofollow">
${fbMetaTags(fbCode)}
<style>${estilo(cor)}</style></head>
<body>${cabecalho(cfg, empresa)}
<main class="wrap"><section class="hero"><h1>Política de privacidade</h1>
<p class="lead">Como tratamos os dados de quem acessa este endereço.</p></section>
<section class="card">
<p><strong>Quais dados coletamos.</strong> Ao abrir um link enviado por ${esc(empresa)}, registramos informações técnicas do acesso: data e hora, país aproximado, tipo de navegador e o identificador do link. Não coletamos nome, telefone ou qualquer dado pessoal a partir desta página, exceto o que você mesmo informar ao pedir para não receber mensagens.</p>
<p><strong>Para que usamos.</strong> Esses registros servem apenas para medir se as mensagens estão sendo recebidas, atender pedidos de descadastramento e proteger o serviço contra abusos.</p>
<p><strong>Compartilhamento.</strong> Não vendemos nem compartilhamos esses dados com terceiros, exceto quando exigido por lei.</p>
<p><strong>Retenção.</strong> Os registros de acesso são apagados automaticamente após um período limitado.</p>
<p><strong>Seus direitos.</strong> Você pode pedir informações, a exclusão de dados ou parar de receber mensagens a qualquer momento: use a opção <a href="/#sair">Não receber mensagens</a> ou os canais informados na página inicial.</p>
</section></main>
${rodape(cfg, empresa)}
</body></html>`;
}

/** 404 neutro (sem marca do HF): host desconhecido, ou caminho do painel fora do host do painel. */
export function renderNeutral404(): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Página não encontrada</title><meta name="robots" content="noindex,nofollow">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:#fff;color:#374151;text-align:center;padding:24px}h1{font-size:24px;margin:0 0 8px}p{margin:0;color:#6b7280;font-size:14px}</style>
</head><body><div><h1>Página não encontrada</h1><p>O endereço que você acessou não existe.</p></div></body></html>`;
}

/** Junta padrão global + config do domínio (campos vazios não sobrescrevem). */
export function mergePageConfig(base: PageConfig, over: PageConfig | undefined): PageConfig {
  const out: PageConfig = { ...base };
  if (!over) return out;
  for (const [k, v] of Object.entries(over) as [keyof PageConfig, unknown][]) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && !v.trim()) continue;
    if (Array.isArray(v) && !v.filter((s) => String(s).trim()).length) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
