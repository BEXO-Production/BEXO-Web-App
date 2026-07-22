import { apiUrl } from "./api";

const SESSION_KEY = "bexo_analytics_sid";

function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `s_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `s_anon_${Date.now().toString(36)}`;
  }
}

/** Fire-and-forget product analytics for BEXO ops (not shown on owner dashboards). */
export function track(eventName: string, props: Record<string, unknown> = {}): void {
  if (!eventName || typeof window === "undefined") return;
  try {
    const token = localStorage.getItem("token");
    const body = JSON.stringify({
      eventName: String(eventName).slice(0, 80),
      sessionId: sessionId(),
      props,
    });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    // Prefer fetch so Authorization is sent; beacon cannot set custom headers.
    fetch(apiUrl("/api/analytics/app"), {
      method: "POST",
      headers,
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // ignore
  }
}
