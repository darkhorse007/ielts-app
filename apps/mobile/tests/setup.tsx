import React from "react";
import { vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as typeof globalThis & { __DEV__: boolean }).__DEV__ = true;

const normalizeDomProps = (props: Record<string, unknown> | null | undefined): Record<string, unknown> | null | undefined => {
  if (!props) {
    return props;
  }

  const nextProps: Record<string, unknown> = { ...props };
  if (typeof props.testID === "string") {
    nextProps["data-testid"] = props.testID;
    delete nextProps.testID;
  }
  if (typeof props.editable === "boolean") {
    delete nextProps.editable;
  }
  return nextProps;
};

const originalCreateElement = React.createElement;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const appStateListeners = new Set<(state: "active" | "background" | "inactive") => void>();
const secureStoreValues = new Map<string, string>();
const notificationResponseListeners = new Set<(response: any) => void>();
const audioStatusListeners = new Set<(status: any) => void>();
const speechRecognitionListeners = new Map<string, Set<(event: any) => void>>();
const scheduledNotifications: Array<{
  identifier: string;
  content: Record<string, unknown>;
  trigger: Record<string, unknown> | null;
}> = [];
const mockConstants = {
  appOwnership: null as string | null,
  executionEnvironment: "standalone",
  expoConfig: {
    version: "1.0.0-test",
    ios: {
      buildNumber: "1",
      bundleIdentifier: "com.darkhorse.ieltsmobile"
    },
    android: {
      versionCode: 1,
      package: "com.darkhorse.ieltsmobile"
    }
  }
};
let notificationHandler: Record<string, unknown> | null = null;
let notificationCounter = 0;
let lastNotificationResponse: Record<string, unknown> | null = null;
let mockDevicePushToken = {
  type: "ios",
  data: "native-token-1234567890"
};
const createMockAudioStatus = () => ({
  id: "mock-audio-player",
  currentTime: 0,
  playbackState: "idle",
  timeControlStatus: "paused",
  reasonForWaitingToPlay: "",
  mute: false,
  duration: 68,
  playing: false,
  loop: false,
  didJustFinish: false,
  isBuffering: false,
  isLoaded: true,
  playbackRate: 1,
  shouldCorrectPitch: true,
  mediaServicesDidReset: false
});
let mockAudioSource: unknown = null;
let mockAudioStatus = createMockAudioStatus();
let speechRecognitionPermissionState = {
  status: "granted",
  granted: true,
  canAskAgain: true,
  expires: "never",
  restricted: false
};
let speechRecognitionAvailable = true;
let notificationPermissionState = {
  granted: true,
  canAskAgain: true,
  expires: "never",
  status: "granted",
  ios: {
    status: 2
  }
};

const addSpeechRecognitionListener = (eventName: string, listener: (event: any) => void) => {
  const existing = speechRecognitionListeners.get(eventName) ?? new Set<(event: any) => void>();
  existing.add(listener);
  speechRecognitionListeners.set(eventName, existing);

  return {
    remove: () => {
      existing.delete(listener);
      if (existing.size === 0) {
        speechRecognitionListeners.delete(eventName);
      }
    }
  };
};

const emitSpeechRecognitionEvent = (eventName: string, payload: any) => {
  const listeners = speechRecognitionListeners.get(eventName);
  if (!listeners) {
    return;
  }

  listeners.forEach((listener) => listener(payload));
};

const useMockSpeechRecognitionEvent = (eventName: string, listener: (event: any) => void) => {
  React.useEffect(() => {
    const subscription = addSpeechRecognitionListener(eventName, listener);
    return () => {
      subscription.remove();
    };
  }, [eventName, listener]);
};

const speechRecognitionModule = {
  addListener: vi.fn(addSpeechRecognitionListener),
  start: vi.fn(),
  stop: vi.fn(),
  abort: vi.fn(),
  requestPermissionsAsync: vi.fn(async () => speechRecognitionPermissionState),
  getPermissionsAsync: vi.fn(async () => speechRecognitionPermissionState),
  getMicrophonePermissionsAsync: vi.fn(async () => ({
    status: speechRecognitionPermissionState.status,
    granted: speechRecognitionPermissionState.granted,
    canAskAgain: speechRecognitionPermissionState.canAskAgain,
    expires: speechRecognitionPermissionState.expires
  })),
  requestMicrophonePermissionsAsync: vi.fn(async () => ({
    status: speechRecognitionPermissionState.status,
    granted: speechRecognitionPermissionState.granted,
    canAskAgain: speechRecognitionPermissionState.canAskAgain,
    expires: speechRecognitionPermissionState.expires
  })),
  getSpeechRecognizerPermissionsAsync: vi.fn(async () => speechRecognitionPermissionState),
  requestSpeechRecognizerPermissionsAsync: vi.fn(async () => speechRecognitionPermissionState),
  isRecognitionAvailable: vi.fn(() => speechRecognitionAvailable),
  supportsRecording: vi.fn(() => true),
  supportsOnDeviceRecognition: vi.fn(() => true),
  getStateAsync: vi.fn(async () => "inactive"),
  __emitMockEvent: emitSpeechRecognitionEvent,
  __resetMockSpeechRecognition: () => {
    speechRecognitionListeners.clear();
    speechRecognitionPermissionState = {
      status: "granted",
      granted: true,
      canAskAgain: true,
      expires: "never",
      restricted: false
    };
    speechRecognitionAvailable = true;
    speechRecognitionModule.addListener.mockClear();
    speechRecognitionModule.start.mockClear();
    speechRecognitionModule.stop.mockClear();
    speechRecognitionModule.abort.mockClear();
    speechRecognitionModule.requestPermissionsAsync.mockClear();
    speechRecognitionModule.getPermissionsAsync.mockClear();
    speechRecognitionModule.getMicrophonePermissionsAsync.mockClear();
    speechRecognitionModule.requestMicrophonePermissionsAsync.mockClear();
    speechRecognitionModule.getSpeechRecognizerPermissionsAsync.mockClear();
    speechRecognitionModule.requestSpeechRecognizerPermissionsAsync.mockClear();
    speechRecognitionModule.isRecognitionAvailable.mockClear();
    speechRecognitionModule.supportsRecording.mockClear();
    speechRecognitionModule.supportsOnDeviceRecognition.mockClear();
    speechRecognitionModule.getStateAsync.mockClear();
  },
  __setMockPermissionState: (
    overrides: Partial<{
      status: string;
      granted: boolean;
      canAskAgain: boolean;
      expires: string;
      restricted: boolean;
    }>
  ) => {
    speechRecognitionPermissionState = {
      ...speechRecognitionPermissionState,
      ...overrides
    };
  },
  __setMockRecognitionAvailable: (value: boolean) => {
    speechRecognitionAvailable = value;
  }
};

(React as typeof React & {
  createElement: typeof React.createElement;
}).createElement = ((type: unknown, props: Record<string, unknown> | null | undefined, ...children: React.ReactNode[]) =>
  originalCreateElement(
    type as Parameters<typeof React.createElement>[0],
    typeof type === "string" ? normalizeDomProps(props) : props,
    ...children
  )) as typeof React.createElement;

const shouldIgnoreTestIdWarning = (args: unknown[]): boolean => {
  const message = args.map((part) => String(part)).join(" ");
  return message.includes("testID") && message.includes("DOM element");
};

console.error = (...args: unknown[]) => {
  if (shouldIgnoreTestIdWarning(args)) {
    return;
  }

  originalConsoleError(...args);
};

console.warn = (...args: unknown[]) => {
  if (shouldIgnoreTestIdWarning(args)) {
    return;
  }

  originalConsoleWarn(...args);
};

vi.mock("react-native", () => {
  const createHost =
    (name: string) =>
    ({ children, ...props }: { children?: React.ReactNode; style?: Record<string, unknown> }) =>
      React.createElement(name, normalizeDomProps(props), children);

  const appState = {
    currentState: "active" as "active" | "background" | "inactive",
    addEventListener: (_type: "change", listener: (state: "active" | "background" | "inactive") => void) => {
      appStateListeners.add(listener);
      return {
        remove: () => {
          appStateListeners.delete(listener);
        }
      };
    },
    __emitMockStateChange: (nextState: "active" | "background" | "inactive") => {
      appState.currentState = nextState;
      appStateListeners.forEach((listener) => listener(nextState));
    }
  };

  return {
    View: createHost("div"),
    Text: createHost("span"),
    ScrollView: ({
      children,
      contentContainerStyle: _contentContainerStyle,
      keyboardShouldPersistTaps: _keyboardShouldPersistTaps,
      ...props
    }: {
      children?: React.ReactNode;
      contentContainerStyle?: Record<string, unknown>;
      keyboardShouldPersistTaps?: string;
      style?: Record<string, unknown>;
    }) => React.createElement("div", normalizeDomProps(props), children),
    TextInput: ({
      onChangeText,
      placeholderTextColor: _placeholderTextColor,
      keyboardType: _keyboardType,
      autoCorrect: _autoCorrect,
      autoCapitalize: _autoCapitalize,
      autoComplete: _autoComplete,
      multiline,
      numberOfLines: _numberOfLines,
      secureTextEntry: _secureTextEntry,
      textContentType: _textContentType,
      textAlignVertical: _textAlignVertical,
      ...props
    }: {
      onChangeText?: (value: string) => void;
      placeholderTextColor?: string;
      keyboardType?: string;
      autoCorrect?: boolean;
      autoCapitalize?: string;
      autoComplete?: string;
      multiline?: boolean;
      numberOfLines?: number;
      secureTextEntry?: boolean;
      textContentType?: string;
      textAlignVertical?: string;
      value?: string;
      style?: Record<string, unknown>;
    }) =>
      React.createElement(multiline ? "textarea" : "input", {
        ...normalizeDomProps(props),
        onChange: onChangeText ? (event: { target: { value: string } }) => onChangeText(event.target.value) : undefined,
        readOnly: !onChangeText
      }),
    Pressable: ({
      children,
      onPress,
      style,
      ...props
    }: {
      children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
      onPress?: () => void;
      style?: Record<string, unknown> | ((state: { pressed: boolean }) => Record<string, unknown>);
    }) =>
      React.createElement(
        "button",
        {
          ...normalizeDomProps(props),
          type: "button",
          onClick: onPress,
          style: typeof style === "function" ? style({ pressed: false }) : style
        },
        typeof children === "function" ? children({ pressed: false }) : children
      ),
    Platform: {
      OS: "ios"
    },
    Linking: {
      openSettings: vi.fn().mockResolvedValue(undefined)
    },
    AppState: appState,
    Share: {
      share: vi.fn().mockResolvedValue({
        action: "sharedAction"
      })
    }
  };
});

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

vi.mock("expo-audio", () => {
  const syncMockAudioPlayerState = () => {
    mockAudioPlayer.currentStatus = mockAudioStatus;
    mockAudioPlayer.playing = mockAudioStatus.playing;
    mockAudioPlayer.paused = !mockAudioStatus.playing;
    mockAudioPlayer.isLoaded = mockAudioStatus.isLoaded;
    mockAudioPlayer.isBuffering = mockAudioStatus.isBuffering;
    mockAudioPlayer.currentTime = mockAudioStatus.currentTime;
    mockAudioPlayer.duration = mockAudioStatus.duration;
    mockAudioPlayer.playbackRate = mockAudioStatus.playbackRate;
  };

  const emitAudioStatus = () => {
    syncMockAudioPlayerState();
    audioStatusListeners.forEach((listener) => listener(mockAudioStatus));
  };

  const setMockAudioStatus = (overrides: Partial<typeof mockAudioStatus>) => {
    mockAudioStatus = {
      ...mockAudioStatus,
      ...overrides
    };
    emitAudioStatus();
  };

  const mockAudioPlayer = {
    id: "mock-audio-player",
    currentStatus: mockAudioStatus,
    playing: false,
    muted: false,
    loop: false,
    paused: true,
    isLoaded: true,
    isAudioSamplingSupported: false,
    isBuffering: false,
    currentTime: 0,
    duration: 68,
    volume: 1,
    playbackRate: 1,
    shouldCorrectPitch: true,
    play: vi.fn(() => {
      setMockAudioStatus({
        playing: true,
        playbackState: "ready",
        timeControlStatus: "playing",
        didJustFinish: false
      });
    }),
    pause: vi.fn(() => {
      setMockAudioStatus({
        playing: false,
        timeControlStatus: "paused"
      });
    }),
    replace: vi.fn((source: unknown) => {
      mockAudioSource = source;
      setMockAudioStatus({
        currentTime: 0,
        duration: 68,
        playing: false,
        didJustFinish: false,
        isLoaded: source !== null,
        playbackState: source !== null ? "ready" : "idle",
        timeControlStatus: "paused"
      });
    }),
    seekTo: vi.fn(async (seconds: number) => {
      setMockAudioStatus({
        currentTime: seconds,
        didJustFinish: false
      });
    }),
    setPlaybackRate: vi.fn((rate: number) => {
      setMockAudioStatus({
        playbackRate: rate
      });
    }),
    setActiveForLockScreen: vi.fn(),
    updateLockScreenMetadata: vi.fn(),
    removeFromLockScreen: vi.fn()
  };

  syncMockAudioPlayerState();

  return {
    getRecordingPermissionsAsync: vi.fn().mockResolvedValue({
      status: "granted",
      granted: true,
      canAskAgain: true,
      expires: "never"
    }),
    requestRecordingPermissionsAsync: vi.fn().mockResolvedValue({
      status: "granted",
      granted: true,
      canAskAgain: true,
      expires: "never"
    }),
    setAudioModeAsync: vi.fn().mockResolvedValue(undefined),
    setIsAudioActiveAsync: vi.fn().mockResolvedValue(undefined),
    useAudioPlayer: (source: unknown) => {
      React.useEffect(() => {
        if (source === undefined) {
          return;
        }

        mockAudioPlayer.replace(source);
      }, [source]);

      return mockAudioPlayer;
    },
    useAudioPlayerStatus: () => {
      const [status, setStatus] = React.useState(mockAudioStatus);

      React.useEffect(() => {
        audioStatusListeners.add(setStatus);
        return () => {
          audioStatusListeners.delete(setStatus);
        };
      }, []);

      return status;
    },
    __getMockAudioPlayer: () => mockAudioPlayer,
    __getMockAudioSource: () => mockAudioSource,
    __setMockAudioStatus: setMockAudioStatus,
    __resetMockAudioPlayer: () => {
      audioStatusListeners.clear();
      mockAudioSource = null;
      mockAudioStatus = createMockAudioStatus();
      mockAudioPlayer.play.mockClear();
      mockAudioPlayer.pause.mockClear();
      mockAudioPlayer.replace.mockClear();
      mockAudioPlayer.seekTo.mockClear();
      mockAudioPlayer.setPlaybackRate.mockClear();
      mockAudioPlayer.setActiveForLockScreen.mockClear();
      mockAudioPlayer.updateLockScreenMetadata.mockClear();
      mockAudioPlayer.removeFromLockScreen.mockClear();
      syncMockAudioPlayerState();
    }
  };
});

vi.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: speechRecognitionModule,
  useSpeechRecognitionEvent: useMockSpeechRecognitionEvent
}));

globalThis.__IELTS_EXPO_SPEECH_RECOGNITION_RUNTIME__ = {
  module: speechRecognitionModule,
  useSpeechRecognitionEvent: useMockSpeechRecognitionEvent
};

vi.mock("expo-constants", () => ({
  default: mockConstants,
  __resetMockConstants: () => {
    mockConstants.appOwnership = null;
    mockConstants.executionEnvironment = "standalone";
    mockConstants.expoConfig = {
      version: "1.0.0-test",
      ios: {
        buildNumber: "1",
        bundleIdentifier: "com.darkhorse.ieltsmobile"
      },
      android: {
        versionCode: 1,
        package: "com.darkhorse.ieltsmobile"
      }
    };
  },
  __setMockConstants: (
    overrides: Partial<{
      appOwnership: string | null;
      executionEnvironment: string;
      expoConfig: {
        version?: string;
        ios?: {
          buildNumber?: string;
          bundleIdentifier?: string;
        };
        android?: {
          versionCode?: number;
          package?: string;
        };
      };
    }>
  ) => {
    if (Object.prototype.hasOwnProperty.call(overrides, "appOwnership")) {
      mockConstants.appOwnership = overrides.appOwnership ?? null;
    }
    if (typeof overrides.executionEnvironment === "string") {
      mockConstants.executionEnvironment = overrides.executionEnvironment;
    }
    if (overrides.expoConfig) {
      mockConstants.expoConfig = {
        ...mockConstants.expoConfig,
        ...overrides.expoConfig,
        ios: {
          ...mockConstants.expoConfig.ios,
          ...overrides.expoConfig.ios
        },
        android: {
          ...mockConstants.expoConfig.android,
          ...overrides.expoConfig.android
        }
      };
    }
  }
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => secureStoreValues.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStoreValues.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStoreValues.delete(key);
  }),
  __resetMockStorage: () => {
    secureStoreValues.clear();
  },
  __setMockItem: (key: string, value: string) => {
    secureStoreValues.set(key, value);
  },
  __getMockItem: (key: string) => secureStoreValues.get(key) ?? null
}));

vi.mock("expo-notifications", () => ({
  AndroidImportance: {
    HIGH: "high"
  },
  AndroidNotificationPriority: {
    HIGH: "high"
  },
  IosAuthorizationStatus: {
    AUTHORIZED: 2,
    PROVISIONAL: 3,
    EPHEMERAL: 4
  },
  SchedulableTriggerInputTypes: {
    DATE: "date"
  },
  setNotificationHandler: vi.fn((handler: Record<string, unknown>) => {
    notificationHandler = handler;
  }),
  getPermissionsAsync: vi.fn(async () => ({ ...notificationPermissionState })),
  requestPermissionsAsync: vi.fn(async () => {
    notificationPermissionState = {
      granted: true,
      canAskAgain: true,
      expires: "never",
      status: "granted",
      ios: {
        status: 2
      }
    };
    return { ...notificationPermissionState };
  }),
  getDevicePushTokenAsync: vi.fn(async () => ({ ...mockDevicePushToken })),
  setNotificationChannelAsync: vi.fn(async () => null),
  getAllScheduledNotificationsAsync: vi.fn(async () => scheduledNotifications.map((item) => ({ ...item }))),
  scheduleNotificationAsync: vi.fn(async (request: { content: Record<string, unknown>; trigger: Record<string, unknown> | null }) => {
    notificationCounter += 1;
    const identifier = `notification-${notificationCounter}`;
    scheduledNotifications.push({
      identifier,
      content: request.content,
      trigger: request.trigger
    });
    return identifier;
  }),
  cancelScheduledNotificationAsync: vi.fn(async (identifier: string) => {
    const index = scheduledNotifications.findIndex((item) => item.identifier === identifier);
    if (index >= 0) {
      scheduledNotifications.splice(index, 1);
    }
  }),
  addNotificationResponseReceivedListener: vi.fn((listener: (response: Record<string, unknown>) => void) => {
    notificationResponseListeners.add(listener);
    return {
      remove: () => {
        notificationResponseListeners.delete(listener);
      }
    };
  }),
  getLastNotificationResponse: vi.fn(() => lastNotificationResponse),
  clearLastNotificationResponse: vi.fn(() => {
    lastNotificationResponse = null;
  }),
  __resetMockNotifications: () => {
    notificationHandler = null;
    notificationCounter = 0;
    lastNotificationResponse = null;
    mockDevicePushToken = {
      type: "ios",
      data: "native-token-1234567890"
    };
    scheduledNotifications.splice(0, scheduledNotifications.length);
    notificationResponseListeners.clear();
    notificationPermissionState = {
      granted: true,
      canAskAgain: true,
      expires: "never",
      status: "granted",
      ios: {
        status: 2
      }
    };
  },
  __getMockScheduledNotifications: () => scheduledNotifications.map((item) => ({ ...item })),
  __setMockNotificationPermission: (overrides: Partial<typeof notificationPermissionState>) => {
    notificationPermissionState = {
      ...notificationPermissionState,
      ...overrides,
      ios: {
        ...notificationPermissionState.ios,
        ...overrides.ios
      }
    };
  },
  __setMockDevicePushToken: (token: { type: string; data: string }) => {
    mockDevicePushToken = {
      ...token
    };
  },
  __emitMockNotificationResponse: (response: Record<string, unknown>) => {
    lastNotificationResponse = response;
    notificationResponseListeners.forEach((listener) => listener(response));
  }
}));
