// Sobe o servidor standalone (admin + redirects) com defaults do HF.
// Variáveis: PORT (3100), HOSTNAME (0.0.0.0), HF_DATA_DIR (./data), HF_SECRET, HF_ADMIN_PASSWORD, HF_ADMIN_HOST,
// DATABASE_URL (Supabase/Postgres; vazio = SQLite).
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const raiz = path.resolve(import.meta.dirname, "..");
// HF_DIST_DIR/NEXT_DIST_DIR: servir um build paralelo (ex.: .next-v3) para testes.
const dist = process.env.HF_DIST_DIR || process.env.NEXT_DIST_DIR || ".next";
const server = path.join(raiz, dist, "standalone", "server.js");

// .env da RAIZ do projeto. O servidor standalone roda dentro de .next/standalone e
// só procuraria um .env lá (que o build apaga), então carregamos aqui, antes de
// importar o servidor. Variáveis já definidas no ambiente têm prioridade.
const envFile = path.join(raiz, ".env");
if (existsSync(envFile)) {
  for (const linha of readFileSync(envFile, "utf-8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linha);
    if (!m || m[1] in process.env) continue; // ambiente (mesmo vazio) vence o arquivo
    process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

// .hf-ready é gravado pelo postbuild no fim: sem ele o build ainda está em
// andamento (ou falhou) e subir agora serviria um servidor pela metade.
if (!existsSync(server) || !existsSync(path.join(raiz, dist, "standalone", ".hf-ready"))) {
  console.error("Build incompleto: rode `npm run build` (ou aguarde o build terminar).");
  process.exit(1);
}

process.env.PORT ||= "3100";
process.env.HOSTNAME ||= "0.0.0.0";
// Sempre absoluto: o server.js do standalone faz chdir para dentro do build, e um
// "./data" relativo criaria outro data/.secret lá (tokens salvos ficariam ilegíveis).
process.env.HF_DATA_DIR = path.resolve(raiz, process.env.HF_DATA_DIR?.trim() || "data");
process.env.NODE_ENV ||= "production";

await import(pathToFileURL(server).href);

// O Next imprime "Network: http://0.0.0.0:3100" — 0.0.0.0 é o endereço em que o
// servidor escuta, não um endereço para abrir no navegador. Deixa claro o certo.
{
  const porta = process.env.PORT;
  const rede = Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal)?.address;
  console.log(`\nPainel:  http://localhost:${porta}/admin`);
  if (rede) console.log(`Na rede: http://${rede}:${porta}/admin   (outros aparelhos desta rede)`);
  console.log("Não use o endereço 0.0.0.0: ele não abre no navegador.\n");
}
