/**
 * Client-side API helper. Calls the API through the same origin so cookies
 * and CORS never get in the way. In dev the Next dev server proxies `/api/*`
 * to the Fastify backend (see rewrites in next.config); in production Caddy
 * routes `/api/*` to the API process.
 */
export async function clientApi<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    let payload: any = {};
    try {
      payload = await res.json();
    } catch {
      // ignore
    }
    const err: any = new Error(payload.error ?? `request_failed_${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const client = {
  get: <T = any>(path: string) => clientApi<T>(path, { method: "GET" }),
  post: <T = any>(path: string, body?: unknown) =>
    clientApi<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T = any>(path: string, body?: unknown) =>
    clientApi<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T = any>(path: string, body?: unknown) =>
    clientApi<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T = any>(path: string) => clientApi<T>(path, { method: "DELETE" }),
};

export function uploadFile<T = any>(path: string, file: File, extraFields?: Record<string, string>): Promise<T> {
  const fd = new FormData();
  fd.append("file", file);
  if (extraFields) {
    for (const [k, v] of Object.entries(extraFields)) fd.append(k, v);
  }
  return clientApi<T>(path, { method: "POST", body: fd });
}