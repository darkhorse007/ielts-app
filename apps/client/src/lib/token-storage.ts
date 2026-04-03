import { clearCachedSessionProfile } from "./session-profile-cache";

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
};

export class TokenStorage {
  private static readonly ACCESS_TOKEN_KEY = "ielts.access_token";
  private static readonly REFRESH_TOKEN_KEY = "ielts.refresh_token";
  private static readonly EXPIRES_AT_KEY = "ielts.expires_at";
  private static readonly USER_ID_KEY = "ielts.user_id";

  save(tokens: SessionTokens): void {
    const previousAccessToken = this.getAccessToken();
    const expiresAtEpochSeconds = Math.floor(Date.now() / 1000) + tokens.expiresIn;
    if (previousAccessToken && previousAccessToken !== tokens.accessToken) {
      clearCachedSessionProfile(previousAccessToken);
    }
    localStorage.setItem(TokenStorage.ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(TokenStorage.REFRESH_TOKEN_KEY, tokens.refreshToken);
    localStorage.setItem(TokenStorage.EXPIRES_AT_KEY, String(expiresAtEpochSeconds));
    localStorage.setItem(TokenStorage.USER_ID_KEY, tokens.userId);
  }

  getAccessToken(): string | null {
    return localStorage.getItem(TokenStorage.ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(TokenStorage.REFRESH_TOKEN_KEY);
  }

  getUserId(): string | null {
    return localStorage.getItem(TokenStorage.USER_ID_KEY);
  }

  clear(): void {
    clearCachedSessionProfile(this.getAccessToken());
    localStorage.removeItem(TokenStorage.ACCESS_TOKEN_KEY);
    localStorage.removeItem(TokenStorage.REFRESH_TOKEN_KEY);
    localStorage.removeItem(TokenStorage.EXPIRES_AT_KEY);
    localStorage.removeItem(TokenStorage.USER_ID_KEY);
  }

  hasSession(): boolean {
    return Boolean(this.getAccessToken() && this.getRefreshToken());
  }
}
