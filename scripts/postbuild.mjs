// Completa o build standalone: copia .next/static e public/ para dentro de
// .next/standalone, que é o que `node .next/standalone/server.js` serve.
import { cpSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const dist = process.env.NEXT_DIST_DIR || ".next";
const standalone = path.join(raiz, dist, "standalone");

if (!existsSync(path.join(standalone, "server.js"))) {
  console.error(`postbuild: ${dist}/standalone/server.js não existe (o build falhou?)`);
  process.exit(1);
}

// O server.js do standalone procura os assets em <distDir>/static dentro dele.
cpSync(path.join(raiz, dist, "static"), path.join(standalone, dist, "static"), { recursive: true });
if (existsSync(path.join(raiz, "public"))) {
  cpSync(path.join(raiz, "public"), path.join(standalone, "public"), { recursive: true });
}
// Marcador: só existe quando o standalone está COMPLETO (o `next build` apaga a
// pasta no início, então o lançador não sobe um servidor pela metade).
writeFileSync(path.join(standalone, ".hf-ready"), new Date().toISOString(), "utf-8");
console.log(`postbuild: standalone completo em ${dist}/standalone`);
