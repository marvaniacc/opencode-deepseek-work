import { API_URL } from "./env";
import { cookies } from "next/headers";

export interface ApiErrorPayload {
  error?: string;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: ApiErrorPayload
  ) {
    super(payload.error ?? `request_failed_${status}`);
  }
}

/**
 * Server-side API client. Always attaches the session cookie so SSR pages
 * can render authenticated state.
 */
export async function apiFetch<T = any>(
  path: string,
  init: RequestInit = {},
  opts: { withAuth?: boolean } = { withAuth: true }
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (opts.withAuth) {
    const store = await cookies();
    const token = store.get("wishubest_session")?.value;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await res.json()) as ApiErrorPayload;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, payload);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T = any>(path: string, opts?: { withAuth?: boolean }) =>
    apiFetch<T>(path, { method: "GET" }, opts),
  post: <T = any>(path: string, body?: unknown, opts?: { withAuth?: boolean }) =>
    apiFetch<T>(
      path,
      { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) },
      opts
    ),
  put: <T = any>(path: string, body?: unknown, opts?: { withAuth?: boolean }) =>
    apiFetch<T>(
      path,
      { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) },
      opts
    ),
  patch: <T = any>(path: string, body?: unknown, opts?: { withAuth?: boolean }) =>
    apiFetch<T>(
      path,
      { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) },
      opts
    ),
  del: <T = any>(path: string, opts?: { withAuth?: boolean }) =>
    apiFetch<T>(path, { method: "DELETE" }, opts),
};