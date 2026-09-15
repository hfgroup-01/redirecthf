"use client";

import { Field } from "@/components/ui";
import type { PageConfig } from "@/lib/types";

interface Props {
  value: PageConfig;
  onChange: (v: PageConfig) => void;
  /** Valores herdados (mostrados como placeholder). */
  placeholders?: PageConfig;
}

export function PageConfigFields({ value, onChange, placeholders = {} }: Props) {
  const set = (k: keyof PageConfig, v: string) => onChange({ ...value, [k]: v });
  const ph = (k: keyof PageConfig) => {
    const p = placeholders[k];
    return Array.isArray(p) ? p.join("\n") : (p as string | undefined) ?? "";
  };
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Nome da empresa">
        <input className="input" value={value.companyName ?? ""} placeholder={ph("companyName")} onChange={(e) => set("companyName", e.target.value)} />
      </Field>
      <Field label="Cor principal" hint="Hex, ex.: #1f6feb">
        <input className="input" value={value.primaryColor ?? ""} placeholder={ph("primaryColor")} onChange={(e) => set("primaryColor", e.target.value)} />
      </Field>
      <Field label="Título (headline)">
        <input className="input" value={value.headline ?? ""} placeholder={ph("headline")} onChange={(e) => set("headline", e.target.value)} />
      </Field>
      <Field label="Site">
        <input className="input" value={value.website ?? ""} placeholder={ph("website")} onChange={(e) => set("website", e.target.value)} />
      </Field>
      <div className="md:col-span-2">
        <Field label="Subtítulo / texto de abertura">
          <textarea className="input" rows={3} value={value.subheadline ?? ""} placeholder={ph("subheadline")} onChange={(e) => set("subheadline", e.target.value)} />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field label="Próximos passos" hint="Um passo por linha.">
          <textarea
            className="input"
            rows={3}
            value={(value.steps ?? []).join("\n")}
            placeholder={ph("steps")}
            onChange={(e) => onChange({ ...value, steps: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
        </Field>
      </div>
      <Field label="Título da seção 'Sobre'">
        <input className="input" value={value.aboutTitle ?? ""} placeholder={ph("aboutTitle")} onChange={(e) => set("aboutTitle", e.target.value)} />
      </Field>
      <Field label="CNPJ">
        <input className="input" value={value.cnpj ?? ""} placeholder={ph("cnpj")} onChange={(e) => set("cnpj", e.target.value)} />
      </Field>
      <div className="md:col-span-2">
        <Field label="Texto 'Sobre a empresa'">
          <textarea className="input" rows={4} value={value.aboutText ?? ""} placeholder={ph("aboutText")} onChange={(e) => set("aboutText", e.target.value)} />
        </Field>
      </div>
      <Field label="Telefone / WhatsApp">
        <input className="input" value={value.phone ?? ""} placeholder={ph("phone")} onChange={(e) => set("phone", e.target.value)} />
      </Field>
      <Field label="E-mail">
        <input className="input" value={value.email ?? ""} placeholder={ph("email")} onChange={(e) => set("email", e.target.value)} />
      </Field>
      <div className="md:col-span-2">
        <Field label="Endereço">
          <input className="input" value={value.address ?? ""} placeholder={ph("address")} onChange={(e) => set("address", e.target.value)} />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field label="Nota do rodapé">
          <input className="input" value={value.footerNote ?? ""} placeholder={ph("footerNote")} onChange={(e) => set("footerNote", e.target.value)} />
        </Field>
      </div>
    </div>
  );
}
