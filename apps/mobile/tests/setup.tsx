import React from "react";
import { vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const normalizeDomProps = (props: Record<string, unknown> | null | undefined): Record<string, unknown> | null | undefined => {
  if (!props || typeof props.testID !== "string") {
    return props;
  }

  const nextProps: Record<string, unknown> = { ...props, "data-testid": props.testID };
  delete nextProps.testID;
  return nextProps;
};

const originalCreateElement = React.createElement;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const appStateListeners = new Set<(state: "active" | "background" | "inactive") => void>();

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
      children,
      onChangeText,
      placeholderTextColor: _placeholderTextColor,
      keyboardType: _keyboardType,
      ...props
    }: {
      children?: React.ReactNode;
      onChangeText?: (value: string) => void;
      placeholderTextColor?: string;
      keyboardType?: string;
      value?: string;
      style?: Record<string, unknown>;
    }) =>
      React.createElement("input", {
        ...normalizeDomProps(props),
        onChange: onChangeText ? (event: { target: { value: string } }) => onChangeText(event.target.value) : undefined,
        readOnly: !onChangeText
      }, children),
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
    AppState: {
      currentState: "active",
      addEventListener: (_type: "change", listener: (state: "active" | "background" | "inactive") => void) => {
        appStateListeners.add(listener);
        return {
          remove: () => {
            appStateListeners.delete(listener);
          }
        };
      }
    },
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

vi.mock("expo-audio", () => ({
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
  setIsAudioActiveAsync: vi.fn().mockResolvedValue(undefined)
}));
