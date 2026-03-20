import type { ApiClient } from "./api-client";
import { TokenStorage } from "./token-storage";

export class SessionManager {
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(
    private readonly apiClient: ApiClient,
    private readonly tokenStorage: TokenStorage
  ) {}

  async refreshSession(): Promise<boolean> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    const refreshToken = this.tokenStorage.getRefreshToken();
    if (!refreshToken) {
      this.tokenStorage.clear();
      return false;
    }

    this.refreshInFlight = this.apiClient
      .refresh(refreshToken)
      .then((tokens) => {
        this.tokenStorage.save({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresIn: tokens.expires_in,
          userId: tokens.user_id
        });
        return true;
      })
      .catch(() => {
        this.tokenStorage.clear();
        return false;
      })
      .finally(() => {
        this.refreshInFlight = null;
      });

    return this.refreshInFlight;
  }
}
