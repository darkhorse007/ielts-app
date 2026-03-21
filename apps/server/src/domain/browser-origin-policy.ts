const BROWSER_ORIGIN_PROTOCOLS = new Set(["http:", "https:"]);

type BrowserHeaders = {
  origin?: string | string[];
  host?: string | undefined;
  "x-forwarded-host"?: string | string[] | undefined;
};

const readHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value[0]?.trim() || undefined;
  }
  return value?.trim() || undefined;
};

const readForwardedHost = (value: string | string[] | undefined): string | undefined => {
  const raw = readHeaderValue(value);
  if (!raw) {
    return undefined;
  }
  return raw.split(",")[0]?.trim() || undefined;
};

export const normalizeBrowserOrigin = (value: string): string | null => {
  try {
    const parsed = new URL(value.trim());
    if (!BROWSER_ORIGIN_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
};

export const getBrowserOrigin = (headers: BrowserHeaders): string | undefined => readHeaderValue(headers.origin);

export const isBrowserOriginAllowed = (headers: BrowserHeaders, allowedOrigins: string[]): boolean => {
  const rawOrigin = getBrowserOrigin(headers);
  if (!rawOrigin) {
    return true;
  }

  const normalizedOrigin = normalizeBrowserOrigin(rawOrigin);
  if (!normalizedOrigin) {
    return false;
  }

  if (allowedOrigins.includes(normalizedOrigin)) {
    return true;
  }

  const originHost = new URL(normalizedOrigin).host;
  const forwardedHost = readForwardedHost(headers["x-forwarded-host"]);
  if (forwardedHost && forwardedHost === originHost) {
    return true;
  }

  const host = headers.host?.trim();
  if (host && host === originHost) {
    return true;
  }

  return false;
};
