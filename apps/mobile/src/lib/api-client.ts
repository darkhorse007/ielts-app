import {
  ApiClient as SharedApiClient,
  ApiNetworkError,
  ApiRequestError
} from "@ielts/shared-client/api-client";
import type { HealthResponse } from "./api-types";

export { ApiNetworkError, ApiRequestError };

export class ApiClient extends SharedApiClient {
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("/health", {
      method: "GET"
    });
  }
}

const safeParseJson = (value: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const runSpeakingWebSocketSmoke = async (input: {
  wsBaseUrl: string;
  sessionId: string;
  resumeToken: string;
}): Promise<{
  type: string;
  currentPart: 1 | 2 | 3;
}> =>
  new Promise((resolve, reject) => {
    const query = new URLSearchParams({
      session_id: input.sessionId,
      resume_token: input.resumeToken
    });
    const socket = new WebSocket(`${input.wsBaseUrl}/v1/realtime/speaking?${query.toString()}`);
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      socket.close();
      reject(new Error("WebSocket 握手超时"));
    }, 8000);

    socket.onerror = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(new Error("WebSocket 连接失败"));
    };

    socket.onmessage = (event) => {
      if (settled) {
        return;
      }

      const payload = typeof event.data === "string" ? safeParseJson(event.data) : null;
      if (!payload) {
        return;
      }

      if (payload.type === "heartbeat") {
        socket.send(JSON.stringify({ type: "heartbeat" }));
        return;
      }

      if (typeof payload.type !== "string") {
        return;
      }

      if (payload.type === "error") {
        settled = true;
        clearTimeout(timeout);
        socket.close();
        reject(new Error(typeof payload.message === "string" ? payload.message : "WebSocket 返回错误"));
        return;
      }

      settled = true;
      clearTimeout(timeout);
      socket.close();
      resolve({
        type: payload.type,
        currentPart: typeof payload.current_part === "number" ? (payload.current_part as 1 | 2 | 3) : 1
      });
    };

    socket.onclose = (event) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`WebSocket 提前关闭 (${event.code})`));
    };
  });
