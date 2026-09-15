import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HF — Redirects",
  description: "CRM de redirects para links de templates WhatsApp",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
