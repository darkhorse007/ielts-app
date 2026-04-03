import type { ApiClient } from "./api-client";
import type { UserProfileResponse } from "./api-types";

const cachedProfileByAccessToken = new Map<string, UserProfileResponse>();
const inFlightProfileByAccessToken = new Map<string, Promise<UserProfileResponse>>();

export const loadCachedSessionProfile = async (
  apiClient: Pick<ApiClient, "getProfile">,
  accessToken: string
): Promise<UserProfileResponse> => {
  const cached = cachedProfileByAccessToken.get(accessToken);
  if (cached) {
    return cached;
  }

  const inFlight = inFlightProfileByAccessToken.get(accessToken);
  if (inFlight) {
    return inFlight;
  }

  const request = apiClient
    .getProfile(accessToken)
    .then((profile) => {
      cachedProfileByAccessToken.set(accessToken, profile);
      return profile;
    })
    .finally(() => {
      inFlightProfileByAccessToken.delete(accessToken);
    });

  inFlightProfileByAccessToken.set(accessToken, request);
  return request;
};

export const clearCachedSessionProfile = (accessToken?: string | null): void => {
  if (accessToken) {
    cachedProfileByAccessToken.delete(accessToken);
    inFlightProfileByAccessToken.delete(accessToken);
    return;
  }

  cachedProfileByAccessToken.clear();
  inFlightProfileByAccessToken.clear();
};
