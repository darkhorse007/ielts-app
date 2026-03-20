import { TokenStorage } from "./token-storage";
import type { SessionManager } from "./session-manager";

export type HttpClientOptions = {
  baseUrl: string;
  fetchFn?: typeof fetch;
  tokenStorage: TokenStorage;
  sessionManager: SessionManager;
};

export class HttpClient {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: HttpClientOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const accessToken = this.options.tokenStorage.getAccessToken();

    const response = await this.fetchFn(`${this.options.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(init.headers ?? {})
      }
    });

    if (response.status === 401 && retry) {
      const refreshed = await this.options.sessionManager.refreshSession();
      if (refreshed) {
        return this.request<T>(path, init, false);
      }
      throw new Error("SESSION_EXPIRED");
    }

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const message = typeof body.message === "string" ? body.message : "Request failed";
      throw new Error(message);
    }

    return body as T;
  }
}
