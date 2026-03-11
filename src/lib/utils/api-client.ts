/**
 * Lightweight fetch utility for client-side API calls.
 * Handles response checking, JSON parsing, and error extraction.
 */
export async function apiGet<T>(url: string, signal?: AbortSignal): Promise<T | undefined> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    const message = body?.error ?? `Request failed: ${res.status}`;
    throw new Error(message);
  }
  const json = (await res.json()) as { data?: T };
  return json.data as T;
}
