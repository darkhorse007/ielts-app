import { ScrollView, Text, TextInput, type TextInputProps, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radii, spacing } from "./theme";

export const AppScreen = ({
  eyebrow,
  title,
  subtitle,
  children
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) => (
  <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["bottom"]}>
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.xxl,
        gap: spacing.md
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: 8, marginBottom: 8 }}>
        <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700", letterSpacing: 1.2 }}>{eyebrow}</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 32, lineHeight: 36, fontWeight: "800" }}>{title}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>{subtitle}</Text>
      </View>
      {children}
    </ScrollView>
  </SafeAreaView>
);

export const InfoCard = ({
  children,
  tone = "default"
}: {
  children: React.ReactNode;
  tone?: "default" | "accent";
}) => (
  <View
    style={{
      backgroundColor: tone === "accent" ? colors.cardAccent : colors.card,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: tone === "accent" ? colors.cardAccentBorder : colors.cardBorder,
      padding: spacing.md,
      gap: spacing.sm
    }}
  >
    {children}
  </View>
);

export const TextField = ({ label, ...props }: TextInputProps & { label: string }) => (
  <View style={{ gap: 8 }}>
    <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "700" }}>{label}</Text>
    <TextInput
      placeholderTextColor={colors.textSoft}
      style={{
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        backgroundColor: colors.input,
        color: colors.textPrimary,
        fontSize: 16,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md
      }}
      {...props}
    />
  </View>
);

export const PrimaryButton = ({
  label,
  onPress,
  disabled
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => ({
      minHeight: 52,
      borderRadius: radii.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: disabled ? colors.disabled : pressed ? colors.accentPressed : colors.accent,
      paddingHorizontal: spacing.md,
      flex: 1
    })}
  >
    <Text style={{ color: colors.canvas, fontSize: 15, fontWeight: "800" }}>{label}</Text>
  </Pressable>
);

export const SecondaryButton = ({
  label,
  onPress,
  disabled
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => ({
      minHeight: 52,
      borderRadius: radii.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: pressed ? colors.cardAccent : colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      paddingHorizontal: spacing.md,
      flex: 1,
      opacity: disabled ? 0.5 : 1
    })}
  >
    <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}>{label}</Text>
  </Pressable>
);

export const ButtonRow = ({ children }: { children: React.ReactNode }) => (
  <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>{children}</View>
);

export const StatusPill = ({
  label,
  tone
}: {
  label: string;
  tone: "neutral" | "accent" | "success";
}) => {
  const backgroundColor =
    tone === "success" ? colors.successSoft : tone === "accent" ? colors.cardAccent : colors.card;
  const borderColor =
    tone === "success" ? colors.successBorder : tone === "accent" ? colors.cardAccentBorder : colors.cardBorder;
  const textColor = tone === "success" ? colors.success : colors.textPrimary;

  return (
    <View
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor,
        backgroundColor,
        paddingHorizontal: 12,
        paddingVertical: 8
      }}
    >
      <Text style={{ color: textColor, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
};
