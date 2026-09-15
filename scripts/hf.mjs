/**
 * Lançador único do HF: sobe o servidor (admin + redirects) e o túnel da
 * Cloudflare na mesma janela, reinicia o que cair, abre o painel no navegador
 * e encerra tudo quando a janela é fechada (ou Ctrl+C).
 *
 *   node scripts/hf.mjs          (ou dê dois cliques em HF.bat)
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const PORTA = process.env.PORT || "3100";
const TUNEL = process.env.HF_TUNNEL || "hf";
const URL_PAINEL = `http://localhost:${PORTA}/admin`;

const cor = { hf: "\x1b[36m", tunel: "\x1b[33m", ok: "\x1b[32m", erro: "\x1b[31m", dim: "\x1b[90m", fim: "\x1b[0m" };
const log = (tag, msg, c = cor.dim) => console.log(`${c}[${tag}]${cor.fim} ${msg}`);

let encerrando = false;
const filhos = new Set();

// ----------------------------------------------------------------- utilidades
function acharCloudflared() {
  const cands = [
    "cloudflared",
    path.join(process.env.LOCALAPPDATA ?? "", "Microsoft/WinGet/Packages/Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe/cloudflared.exe"),
    path.join(process.env.ProgramFiles ?? "", "Cloudflare/cloudflared.exe"),
  ];
  for (const c of cands) {
    if (c === "cloudflared") {
      const r = spawnSync(c, ["--version"], { stdio: "ignore", shell: false });
      if (!r.error) return c;
    } else if (existsSync(c)) return c;
  }
  return null;
}

async function saude() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORTA}/api/v1/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

function abrirNavegador(url) {
  try {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } catch {
    /* sem navegador, sem problema */
  }
}

/** Roda um processo filho, reiniciando quando cai (backoff até 30s). */
function supervisionar(tag, cmd, args, opts, filtro) {
  let tentativas = 0;
  const iniciar = () => {
    if (encerrando) return;
    const p = spawn(cmd, args, { cwd: raiz, windowsHide: true, ...opts, stdio: ["ignore", "pipe", "pipe"] });
    filhos.add(p);
    const tratar = (chunk) => {
      for (const linha of String(chunk).split(/\r?\n/)) {
        if (!linha.trim()) continue;
        const saida = filtro(linha);
        if (saida) log(tag, saida, tag === "hf" ? cor.hf : cor.tunel);
      }
    };
    p.stdout.on("data", tratar);
    p.stderr.on("data", tratar);
    p.on("exit", (code) => {
      filhos.delete(p);
      if (encerrando) return;
      tentativas++;
      const espera = Math.min(30_000, 2_000 * tentativas);
      log(tag, `parou (código ${code}); reiniciando em ${espera / 1000}s…`, cor.erro);
      setTimeout(iniciar, espera);
    });
    p.on("spawn", () => setTimeout(() => (tentativas = 0), 60_000));
  };
  iniciar();
}

// ----------------------------------------------------------------- encerramento
function encerrar() {
  if (encerrando) return;
  encerrando = true;
  console.log("");
  log("hf", "encerrando…");
  for (const p of filhos) {
    try {
      p.kill();
    } catch {
      /* já morreu */
    }
  }
  setTimeout(() => process.exit(0), 800);
}
process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);
process.on("SIGHUP", encerrar);

// ----------------------------------------------------------------- início
console.log(`${cor.ok}HF Redirects${cor.fim}  ${cor.dim}(${raiz})${cor.fim}`);
console.log(`${cor.dim}Feche esta janela (ou Ctrl+C) para parar o servidor e o túnel.${cor.fim}\n`);

// 1) build, se ainda não existe
if (!existsSync(path.join(raiz, ".next", "standalone", ".hf-ready"))) {
  log("hf", "primeira execução: gerando o build (1–2 min)…");
  const r = spawnSync(os.platform() === "win32" ? "npm.cmd" : "npm", ["run", "build"], { cwd: raiz, stdio: "inherit", shell: true });
  if (r.status !== 0) {
    log("hf", "o build falhou. Rode `npm run build` para ver o erro.", cor.erro);
    process.exit(1);
  }
}

// 2) servidor HF (a menos que já esteja rodando)
if (await saude()) {
  log("hf", `já existe um HF respondendo na porta ${PORTA}; não vou subir outro.`);
} else {
  supervisionar(
    "hf",
    process.execPath,
    [path.join(raiz, "scripts", "start.mjs")],
    { env: { ...process.env, PORT: PORTA, NODE_NO_WARNINGS: "1" } },
    (l) => (/ExperimentalWarning|trace-warnings|Running next.config|Network:/.test(l) ? null : l)
  );
}

// 3) túnel
const cf = acharCloudflared();
const configTunel = path.join(os.homedir(), ".cloudflared", "config.yml");
if (!cf) {
  log("tunel", "cloudflared não encontrado. Instale com: winget install --id Cloudflare.cloudflared", cor.erro);
} else if (!existsSync(configTunel)) {
  log("tunel", "túnel ainda não configurado. Rode uma vez: npm run tunnel:setup", cor.erro);
} else {
  supervisionar("tunel", cf, ["tunnel", "run", TUNEL], {}, (l) => {
    if (/Registered tunnel connection/.test(l)) {
      const loc = /location=(\S+)/.exec(l)?.[1] ?? "";
      return `conectado à Cloudflare (${loc})`;
    }
    if (/Starting tunnel/.test(l)) return "iniciando…";
    if (/ ERR /.test(l) || /"level":"error"/.test(l)) return l.replace(/^\S+\s+ERR\s+/, "erro: ");
    if (/outdated/.test(l)) return "há versão nova do cloudflared (winget upgrade Cloudflare.cloudflared)";
    return null; // esconde o resto do log INF
  });
}

// 4) abre o painel quando o servidor responder
for (let i = 0; i < 60; i++) {
  if (await saude()) {
    log("hf", `painel: ${URL_PAINEL}`, cor.ok);
    abrirNavegador(URL_PAINEL);
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}
