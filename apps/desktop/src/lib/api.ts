const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {}

export async function apiRequest<T>(path: string, init: RequestInit = {}, idempotencyKey?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json", "idempotency-key": idempotencyKey ?? crypto.randomUUID() } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as { message?: string } | undefined;
    throw new ApiError(body?.message ?? `The API request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}
