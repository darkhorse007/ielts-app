import { Text, View } from "react-native";
import { ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill } from "./primitives";
import { colors } from "./theme";

export const HomeConnectionSmokePanel = ({
  healthStatus,
  socketStatus,
  onCheckHealth,
  onCheckSpeakingSocket
}: {
  healthStatus: string;
  socketStatus: string;
  onCheckHealth: () => void;
  onCheckSpeakingSocket: () => void;
}) => (
  <InfoCard>
    <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>连接 smoke</Text>
    <View style={{ gap: 10 }}>
      <StatusPill label={healthStatus} tone={healthStatus.includes("ok") ? "success" : "neutral"} />
      <StatusPill label={socketStatus} tone={socketStatus.includes("WS 连通") ? "success" : "neutral"} />
    </View>
    <ButtonRow>
      <PrimaryButton label="检查 API" onPress={onCheckHealth} testID="home.checkHealth" />
      <SecondaryButton label="检查 WS" onPress={onCheckSpeakingSocket} testID="home.checkSpeakingSocket" />
    </ButtonRow>
  </InfoCard>
);
