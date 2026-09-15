"use client";

/** Cliente HTTP do painel: mesma origem, cookie de sessão, erro vira Error(message). */
export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: { "content-type": "application/json" },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  const texto = await res.text();
  let data: unknown = null;
  try {
    data = texto ? JSON.parse(texto) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
    if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/admin/login")) {
      location.href = "/admin/login";
    }
    throw new Error(msg);
  }
  return data as T;
}
