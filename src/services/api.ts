/**
 * Unified API adapter — seamlessly switches between Tauri IPC and HTTP fetch.
 *
 * In Tauri desktop mode, delegates to `@tauri-apps/api/core` invoke().
 * In WebUI server mode, POSTs JSON to the Axum `/api/{command}` endpoint.
 *
 * Usage:
 *   import { api } from "@/services/api";
 *   const result = await api<MyType>("command_name", { key: "value" });
 */

import {
  isTauri,
  getApiBase,
  getAuthToken,
  getCsrfToken,
  setAuthToken,
  clearAuthToken,
  clearAuthCookie,
} from "@/utils/platform";

/** Validate command name to prevent path traversal in URL. */
const COMMAND_RE = /^[a-zA-Z0-9_]+$/;

/**
 * Thrown when the WebUI rejects a request with 401 and no retry is left.
 * Callers that poll (e.g. read-aloud) stop on it instead of retrying.
 */
export class AuthRequiredError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export interface ApiOptions {
  /** Aborts the request. Desktop `invoke()` cannot be cancelled; its result is then ignored. */
  signal?: AbortSignal;
}

const abortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException("Aborted", "AbortError");

/** Reject as soon as `signal` aborts, even if `promise` never settles. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

/**
 * Call a backend command regardless of runtime environment.
 *
 * @param command  Tauri command name (also used as the REST endpoint name)
 * @param args     Optional arguments object (serialised as JSON body in web mode)
 * @param options  Optional request options (abort signal)
 * @returns        The deserialised response from the backend
 */
export function api<T>(
  command: string,
  args?: Record<string, unknown>,
  options: ApiOptions = {},
): Promise<T> {
  return request<T>(command, args, options, false);
}

/** @param retried Internal flag to prevent infinite retry on 401 */
async function request<T>(
  command: string,
  args: Record<string, unknown> | undefined,
  { signal }: ApiOptions,
  retried: boolean,
): Promise<T> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const call = args != null ? invoke<T>(command, args) : invoke<T>(command);
    return signal ? raceAbort(call, signal) : call;
  }

  if (!COMMAND_RE.test(command)) {
    throw new Error(`Invalid command name: ${command}`);
  }

  const base = getApiBase();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const response = await fetch(`${base}/api/${command}`, {
    method: "POST",
    headers,
    credentials: "same-origin",
    body: JSON.stringify(args ?? {}),
    signal,
  });

  // On 401, try to extract token from URL params and retry once.
  // If no token is available, redirect to force re-authentication.
  if (response.status === 401 && !retried) {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      setAuthToken(urlToken);
      return request<T>(command, args, { signal }, true);
    }

    // Avoid redirect loops when already on an auth error page.
    if (params.get("auth_error") === "1") {
      clearAuthToken();
      await clearAuthCookie();
      throw new AuthRequiredError("Authentication required.");
    }

    // Clear stale token and redirect once to an explicit auth-error URL.
    clearAuthToken();
    await clearAuthCookie();
    params.set("auth_error", "1");
    const query = params.toString();
    window.location.replace(
      query ? `${window.location.pathname}?${query}` : window.location.pathname,
    );
    throw new AuthRequiredError();
  }

  if (!response.ok) {
    const errorBody = await response.text();
    let message: string;
    try {
      const parsed = JSON.parse(errorBody) as { error?: string };
      message = parsed.error ?? "Request failed";
    } catch {
      message = "Request failed";
    }
    // Log full error for debugging, show sanitized message to user
    console.error(`API error [${command}]:`, errorBody);
    // A 401 here is the retried request: nothing is left to try.
    throw response.status === 401 ? new AuthRequiredError(message) : new Error(message);
  }

  return response.json() as Promise<T>;
}
