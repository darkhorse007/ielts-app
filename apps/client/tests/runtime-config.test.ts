import { describe, expect, test } from "vitest";
import { resolveRuntimeConfig } from "../src/lib/runtime-config";

describe("S28 runtime config resolution", () => {
  test("uses same-origin defaults when runtime env is empty", () => {
    const config = resolveRuntimeConfig({}, "http://127.0.0.1:5173");

    expect(config).toEqual({
      apiBaseUrl: "",
      wsBaseUrl: "ws://127.0.0.1:5173"
    });
  });

  test("derives websocket base url from api base url when api base is absolute", () => {
    const config = resolveRuntimeConfig(
      {
        VITE_API_BASE_URL: "https://api.example.com/platform/"
      },
      "http://127.0.0.1:5173"
    );

    expect(config).toEqual({
      apiBaseUrl: "https://api.example.com/platform",
      wsBaseUrl: "wss://api.example.com/platform"
    });
  });

  test("prefers explicit websocket base url over derived values", () => {
    const config = resolveRuntimeConfig(
      {
        VITE_API_BASE_URL: "https://api.example.com",
        VITE_WS_BASE_URL: "wss://ws.example.com/realtime/"
      },
      "http://127.0.0.1:5173"
    );

    expect(config).toEqual({
      apiBaseUrl: "https://api.example.com",
      wsBaseUrl: "wss://ws.example.com/realtime"
    });
  });

  test("derives websocket base url from relative api base using page origin", () => {
    const config = resolveRuntimeConfig(
      {
        VITE_API_BASE_URL: "/gateway"
      },
      "https://app.example.com"
    );

    expect(config).toEqual({
      apiBaseUrl: "/gateway",
      wsBaseUrl: "wss://app.example.com/gateway"
    });
  });

  test("fails fast when api base url uses unsupported protocol", () => {
    expect(() =>
      resolveRuntimeConfig(
        {
          VITE_API_BASE_URL: "ftp://api.example.com"
        },
        "https://app.example.com"
      )
    ).toThrow(/VITE_API_BASE_URL must use one of: http:, https:/);
  });

  test("fails fast when websocket base url is neither absolute nor root-relative", () => {
    expect(() =>
      resolveRuntimeConfig(
        {
          VITE_WS_BASE_URL: "ws.example.com/socket"
        },
        "https://app.example.com"
      )
    ).toThrow(/VITE_WS_BASE_URL must be an absolute URL or root-relative path/);
  });
});
