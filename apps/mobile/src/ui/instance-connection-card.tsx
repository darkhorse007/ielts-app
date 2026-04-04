import { Text } from "react-native";
import {
  getInstanceConfigRisks,
  getInstanceConfigSourceLabel,
  type InstanceConfig
} from "../lib/runtime-config";
import { InfoCard } from "./primitives";
import { colors } from "./theme";

export const InstanceConnectionCard = ({
  title,
  instanceConfig,
  defaultInstanceConfig
}: {
  title: string;
  instanceConfig: InstanceConfig;
  defaultInstanceConfig?: InstanceConfig | null;
}) => {
  const sourceLabel = getInstanceConfigSourceLabel(instanceConfig, defaultInstanceConfig);
  const risks = getInstanceConfigRisks(instanceConfig);

  return (
    <InfoCard tone={risks.length > 0 ? "accent" : "default"}>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>{title}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 20 }}>{sourceLabel}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700", marginTop: 10 }}>
        {instanceConfig.apiBaseUrl}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6 }}>{instanceConfig.wsBaseUrl}</Text>
      {risks.length > 0 ? (
        <>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 12 }}>风险提示</Text>
          {risks.map((risk) => (
            <Text key={risk.code} style={{ color: colors.textPrimary, fontSize: 13, lineHeight: 20, marginTop: 4 }}>
              {risk.message}
            </Text>
          ))}
        </>
      ) : null}
    </InfoCard>
  );
};
