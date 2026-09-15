import path from "node:path";

/** Pasta de dados: banco SQLite + segredo. Em Docker é um volume (/data). */
export const HF_DATA_DIR = path.resolve(
  process.env.HF_DATA_DIR?.trim() || path.join(process.cwd(), "data")
);

export const HF_DB_PATH = path.join(HF_DATA_DIR, "hf.db");
export const HF_SECRET_PATH = path.join(HF_DATA_DIR, ".secret");

export const HF_VERSION = "0.1.0";
