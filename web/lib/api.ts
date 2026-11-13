// One door to the Python API. Same origin, cookie session, and a header browsers
// can't send cross-site, which the server requires for every write.
export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const TIMEOUT = 20_000;

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      signal: init.signal ?? controller.signal,
      ...rest,
      headers: {
        "X-HR-Dashboard": "1",
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw new ApiError("The server took too long to answer. Try again.", 0);
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401 && !path.startsWith("/api/public/")) {
    window.location.href = "/login";
    throw new ApiError("Log in again.", 401);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || `The server answered ${response.status}.`, response.status);
  return data as T;
}

export function reportError(message: string, where = "") {
  try {
    fetch("/api/client-error", {
      method: "POST",
      keepalive: true,
      credentials: "same-origin",
      headers: { "X-HR-Dashboard": "1", "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.slice(0, 300), where: where.slice(0, 200), page: location.pathname + location.search }),
    });
  } catch {
    /* reporting must never throw */
  }
}

/** Builds a query string, dropping empty values and repeating arrays. */
export function qs(params: Record<string, string | number | undefined | null | (string | number)[]>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, String(item)));
    else if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
