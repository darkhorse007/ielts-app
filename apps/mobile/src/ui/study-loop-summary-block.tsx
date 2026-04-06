import { Text, View } from "react-native";
import { ButtonRow, PrimaryButton, SecondaryButton, StatusPill } from "./primitives";
import { colors } from "./theme";

type StudyLoopSummaryAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
};

export const StudyLoopSummaryBlock = ({
  pendingPlanRefreshCount,
  pendingProgressRefreshCount,
  statusText,
  nextActionTitle,
  nextActionDetail,
  activityLines = [],
  emptyStateText,
  hintText,
  primaryAction,
  secondaryAction
}: {
  pendingPlanRefreshCount: number;
  pendingProgressRefreshCount: number;
  statusText?: string;
  nextActionTitle: string;
  nextActionDetail: string;
  activityLines?: string[];
  emptyStateText?: string;
  hintText?: string;
  primaryAction?: StudyLoopSummaryAction;
  secondaryAction?: StudyLoopSummaryAction;
}) => (
  <View style={{ gap: 10 }}>
    <ButtonRow>
      <StatusPill
        label={`计划待刷新 ${pendingPlanRefreshCount}`}
        tone={pendingPlanRefreshCount > 0 ? "accent" : "success"}
      />
      <StatusPill
        label={`进度待刷新 ${pendingProgressRefreshCount}`}
        tone={pendingProgressRefreshCount > 0 ? "accent" : "success"}
      />
    </ButtonRow>
    {statusText ? <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{statusText}</Text> : null}
    <Text style={{ color: colors.textPrimary, fontSize: 14 }}>next_action: {nextActionTitle}</Text>
    <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>next_action_detail: {nextActionDetail}</Text>
    {activityLines.length ? (
      <View style={{ gap: 8 }}>
        {activityLines.map((line, index) => (
          <Text key={`${index}:${line}`} style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
            {line}
          </Text>
        ))}
      </View>
    ) : emptyStateText ? (
      <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>{emptyStateText}</Text>
    ) : null}
    {hintText ? (
      <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>action_hint: {hintText}</Text>
    ) : null}
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
  </View>
);
