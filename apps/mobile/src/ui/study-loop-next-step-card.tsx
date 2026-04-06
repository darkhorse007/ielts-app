import { router } from "expo-router";
import { Text } from "react-native";
import { buildStudyLoopRecommendation, useStudyLoop } from "../state/study-loop";
import { ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill } from "./primitives";
import { colors } from "./theme";

export const StudyLoopNextStepCard = ({
  visible = true,
  currentRoute,
  secondaryRoute = "/home",
  secondaryLabel = "返回首页",
  testIDPrefix = "studyLoopNext"
}: {
  visible?: boolean;
  currentRoute: string;
  secondaryRoute?: string;
  secondaryLabel?: string;
  testIDPrefix?: string;
}) => {
  const { activities, pendingPlanRefreshCount, pendingProgressRefreshCount, ready } = useStudyLoop();

  if (!visible || !ready || activities.length === 0) {
    return null;
  }

  const recommendation = buildStudyLoopRecommendation(activities);
  if (recommendation.route === currentRoute) {
    return null;
  }

  const openSecondaryRoute = (): void => {
    if (secondaryRoute === "/home") {
      router.replace("/home");
      return;
    }

    router.push(secondaryRoute);
  };

  return (
    <InfoCard tone={pendingPlanRefreshCount || pendingProgressRefreshCount ? "accent" : "default"}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>主线下一步</Text>
      <ButtonRow>
        <StatusPill
          label={`计划待消化 ${pendingPlanRefreshCount}`}
          tone={pendingPlanRefreshCount > 0 ? "accent" : "success"}
        />
        <StatusPill
          label={`进度待消化 ${pendingProgressRefreshCount}`}
          tone={pendingProgressRefreshCount > 0 ? "accent" : "success"}
        />
      </ButtonRow>
      <Text style={{ color: colors.textPrimary, fontSize: 14 }}>next_action: {recommendation.title}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
        next_action_detail: {recommendation.detail}
      </Text>
      <ButtonRow>
        <PrimaryButton
          label={recommendation.actionLabel}
          onPress={() => router.push(recommendation.route)}
          testID={`${testIDPrefix}.primary`}
        />
        <SecondaryButton
          label={secondaryLabel}
          onPress={openSecondaryRoute}
          testID={`${testIDPrefix}.secondary`}
        />
      </ButtonRow>
    </InfoCard>
  );
};
