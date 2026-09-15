import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // standalone: gera <distDir>/standalone/server.js autocontido (Docker / EasyPanel).
  output: "standalone",
  // NEXT_DIST_DIR permite buildar numa pasta paralela (ex.: .next-v3) sem
  // derrubar o servidor que está servindo .next/standalone.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: path.resolve(import.meta.dirname),
  // O tracing puxa a pasta inteira (HF_DATA_DIR usa process.cwd()); tira o que
  // não é necessário em runtime para o standalone ficar enxuto.
  outputFileTracingExcludes: {
    "*": [
      "./data/**/*",
      "./data-smoke/**/*",
      "./docs/**/*",
      "./src/**/*",
      "./scripts/**/*",
      "./supabase/**/*",
      "./*.log",
      "./*.md",
      "./Dockerfile",
      "./docker-compose.yml",
    ],
  },
  // Sem header "x-powered-by" — o domínio de redirect deve parecer um site comum.
  poweredByHeader: false,
};

export default nextConfig;
