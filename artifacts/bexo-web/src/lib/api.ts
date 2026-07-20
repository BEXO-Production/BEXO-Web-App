/**
 * Same-origin API helper.
 *
 * Production (mybexo.cyou) must never call http://localhost — that only works on the
 * developer machine and causes Safari/iOS "Load failed" on phones.
 * Prefer relative `/api/...` so Firebase Hosting rewrites (prod) and Vite proxy (dev) both work.
 */
export function apiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1") {
      return "";
    }
  }

  const fromEnv = String(import.meta.env.VITE_API_URL || "")
    .trim()
    .replace(/\/$/, "");

  if (!fromEnv) return "";
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(fromEnv)) return "";
  return fromEnv;
}

/** Build an absolute-or-relative API URL from a path starting with `/api/...`. */
export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${apiBaseUrl()}${normalized}`;
}
