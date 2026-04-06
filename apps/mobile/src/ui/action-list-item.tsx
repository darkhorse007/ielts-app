import { Pressable, Text, View } from "react-native";
import { ButtonRow, PrimaryButton, SecondaryButton } from "./primitives";
import { colors, radii, spacing } from "./theme";

type ActionListButton = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
};

const ActionListItemContent = ({
  title,
  detail,
  metadataLines = [],
  metadataFontSize = 12,
  metadataLineHeight,
  primaryAction,
  secondaryAction
}: {
  title: string;
  detail: string;
  metadataLines?: string[];
  metadataFontSize?: number;
  metadataLineHeight?: number;
  primaryAction?: ActionListButton;
  secondaryAction?: ActionListButton;
}) => (
  <>
    <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{title}</Text>
    <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>{detail}</Text>
    {metadataLines.map((line, index) => (
      <Text
        key={`${index}:${line}`}
        style={{
          color: colors.textMuted,
          fontSize: metadataFontSize,
          lineHeight: metadataLineHeight
        }}
      >
        {line}
      </Text>
    ))}
    {primaryAction || secondaryAction ? (
      <ButtonRow>
        {primaryAction ? (
          <PrimaryButton
            label={primaryAction.label}
            onPress={primaryAction.onPress}
            disabled={primaryAction.disabled}
            testID={primaryAction.testID}
          />
        ) : null}
        {secondaryAction ? (
          <SecondaryButton
            label={secondaryAction.label}
            onPress={secondaryAction.onPress}
            disabled={secondaryAction.disabled}
            testID={secondaryAction.testID}
          />
        ) : null}
      </ButtonRow>
    ) : null}
  </>
);

export const ActionListItem = ({
  title,
  detail,
  metadataLines = [],
  metadataFontSize,
  metadataLineHeight,
  primaryAction,
  secondaryAction,
  onPress,
  testID
}: {
  title: string;
  detail: string;
  metadataLines?: string[];
  metadataFontSize?: number;
  metadataLineHeight?: number;
  primaryAction?: ActionListButton;
  secondaryAction?: ActionListButton;
  onPress?: () => void;
  testID?: string;
}) => {
  const content = (
    <ActionListItemContent
      title={title}
      detail={detail}
      metadataLines={metadataLines}
      metadataFontSize={metadataFontSize}
      metadataLineHeight={metadataLineHeight}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
    />
  );

  const cardStyle = {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.input,
    padding: spacing.md,
    gap: 6
  } as const;

  if (onPress) {
    return (
      <Pressable onPress={onPress} testID={testID} style={cardStyle}>
        {content}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{content}</View>;
};
