export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
let csrfToken = "";
export function setCsrf(token: string) {
  csrfToken = token;
}
/** All writes share the session CSRF token; personal data stays on the server. */
export async function api<T>(
  path: string,
  options: RequestInit = {},
  csrfRetried = false,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET")
    headers.set("X-CSRF-Token", csrfToken);
  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => ({}));
  // This exact rejection occurs in the backend before a write can run.
  if (
    response.status === 400 &&
    data.error === "CSRF-Token fehlt oder ist ungültig." &&
    !csrfRetried
  ) {
    const session = await api<{ csrf_token: string; authenticated: boolean }>(
      "/session",
    );
    setCsrf(session.csrf_token);
    return api<T>(path, options, true);
  }
  if (response.status === 401 && typeof window !== "undefined")
    window.dispatchEvent(new Event("session-expired"));
  if (!response.ok)
    throw new ApiError(
      data.error || `Anfrage fehlgeschlagen (${response.status})`,
      response.status,
      data.details,
    );
  return data as T;
}
export function write<T>(path: string, body: unknown, method = "POST") {
  return api<T>(path, { method, body: JSON.stringify(body) });
}
export const money = (value: unknown) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    Number(value || 0),
  );
export const decimal = (value: unknown) =>
  value == null
    ? "–"
    : new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 }).format(
        Number(value),
      );
