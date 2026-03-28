import React from "react";
import { vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", () => {
  const createHost =
    (name: string) =>
    ({ children, ...props }: { children?: React.ReactNode; style?: Record<string, unknown> }) =>
      React.createElement(name, props, children);

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
    }) => React.createElement("div", props, children),
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
        ...props,
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
          ...props,
          type: "button",
          onClick: onPress,
          style: typeof style === "function" ? style({ pressed: false }) : style
        },
        typeof children === "function" ? children({ pressed: false }) : children
      ),
    Platform: {
      OS: "ios"
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
