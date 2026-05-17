import Constants from "expo-constants";
import { useEffect } from "react";

export type SpeechRecognitionPermissionSnapshot = {
  status: string;
  granted: boolean;
  canAskAgain: boolean;
  expires: string;
  restricted?: boolean;
};

export type SpeechRecognitionStartOptions = {
  lang?: string;
  interimResults?: boolean;
  continuous?: boolean;
  addsPunctuation?: boolean;
  iosTaskHint?: string;
  iosVoiceProcessingEnabled?: boolean;
  contextualStrings?: string[];
  androidIntentOptions?: Record<string, number>;
  recordingOptions?: {
    persist?: boolean;
    outputFileName?: string;
  };
  volumeChangeEventOptions?: {
    enabled?: boolean;
    intervalMillis?: number;
  };
};

export type SpeechRecognitionModuleLike = {
  abort: () => void;
  start: (options: SpeechRecognitionStartOptions) => void;
  stop: () => void;
  getPermissionsAsync: () => Promise<SpeechRecognitionPermissionSnapshot>;
  requestPermissionsAsync: () => Promise<SpeechRecognitionPermissionSnapshot>;
  isRecognitionAvailable: () => boolean;
};

export type SpeechRecognitionEventName =
  | "start"
  | "audiostart"
  | "result"
  | "error"
  | "end"
  | "audioend"
  | "volumechange";

type SpeechRecognitionEventListener = (event: any) => void;

type SpeechRecognitionRuntime = {
  module: SpeechRecognitionModuleLike;
  useSpeechRecognitionEvent: (eventName: SpeechRecognitionEventName, listener: SpeechRecognitionEventListener) => void;
  unavailableReason: string | null;
};

declare global {
  var __IELTS_EXPO_SPEECH_RECOGNITION_RUNTIME__:
    | {
        module: SpeechRecognitionModuleLike;
        useSpeechRecognitionEvent: (eventName: SpeechRecognitionEventName, listener: SpeechRecognitionEventListener) => void;
      }
    | undefined;
}

const unavailablePermissions: SpeechRecognitionPermissionSnapshot = {
  status: "unavailable",
  granted: false,
  canAskAgain: false,
  expires: "never",
  restricted: false
};

const resolveUnavailableReason = (): string => {
  if (Constants.appOwnership === "expo") {
    return "当前运行环境不支持原生语音识别，请使用 development build 或正式安装包";
  }

  return "当前运行环境缺少原生语音识别模块，请使用 development build 或正式安装包";
};

const createUnavailableRuntime = (reason: string): SpeechRecognitionRuntime => ({
  module: {
    abort: () => undefined,
    start: () => {
      throw new Error(reason);
    },
    stop: () => undefined,
    getPermissionsAsync: async () => unavailablePermissions,
    requestPermissionsAsync: async () => unavailablePermissions,
    isRecognitionAvailable: () => false
  },
  useSpeechRecognitionEvent: (_eventName, _listener) => {
    useEffect(() => undefined, [_eventName, _listener]);
  },
  unavailableReason: reason
});

let speechRecognitionRuntime: SpeechRecognitionRuntime | null = null;

const loadSpeechRecognitionRuntimeOverride = (): SpeechRecognitionRuntime | null => {
  const runtimeOverride = globalThis.__IELTS_EXPO_SPEECH_RECOGNITION_RUNTIME__;
  if (!runtimeOverride) {
    return null;
  }

  return {
    module: runtimeOverride.module,
    useSpeechRecognitionEvent: runtimeOverride.useSpeechRecognitionEvent,
    unavailableReason: null
  };
};

const loadSpeechRecognitionRuntime = (): SpeechRecognitionRuntime => {
  if (speechRecognitionRuntime) {
    return speechRecognitionRuntime;
  }

  const runtimeOverride = loadSpeechRecognitionRuntimeOverride();
  if (runtimeOverride) {
    speechRecognitionRuntime = runtimeOverride;
    return speechRecognitionRuntime;
  }

  // Expo Go cannot provide the native speech module, so fall back before trying to load it.
  if (Constants.appOwnership === "expo") {
    speechRecognitionRuntime = createUnavailableRuntime(resolveUnavailableReason());
    return speechRecognitionRuntime;
  }

  try {
    if (typeof require !== "function") {
      throw new Error("require is unavailable");
    }

    const module = require("expo-speech-recognition") as {
      ExpoSpeechRecognitionModule: SpeechRecognitionModuleLike;
      useSpeechRecognitionEvent: (
        eventName: SpeechRecognitionEventName,
        listener: SpeechRecognitionEventListener
      ) => void;
    };

    speechRecognitionRuntime = {
      module: module.ExpoSpeechRecognitionModule,
      useSpeechRecognitionEvent: module.useSpeechRecognitionEvent,
      unavailableReason: null
    };
  } catch {
    speechRecognitionRuntime = createUnavailableRuntime(resolveUnavailableReason());
  }

  return speechRecognitionRuntime;
};

export const ExpoSpeechRecognitionModule: SpeechRecognitionModuleLike = loadSpeechRecognitionRuntime().module;

export const useSpeechRecognitionEvent = (eventName: SpeechRecognitionEventName, listener: SpeechRecognitionEventListener): void =>
  loadSpeechRecognitionRuntime().useSpeechRecognitionEvent(eventName, listener);

export const getSpeechRecognitionUnsupportedReason = (): string | null => loadSpeechRecognitionRuntime().unavailableReason;
