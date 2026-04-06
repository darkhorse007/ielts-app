import { Text, View } from "react-native";
import type { HomeEntryActionConfig, HomeEntryRowConfig } from "../lib/home-entry-config";
import { ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill } from "./primitives";
import { colors } from "./theme";

export const HomeEntryPanel = ({
  availableModules,
  plannedModules = [],
  rows,
  onAction
}: {
  availableModules: string[];
  plannedModules?: string[];
  rows: HomeEntryRowConfig[];
  onAction: (action: HomeEntryActionConfig) => void;
}) => (
  <>
    <InfoCard>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>已接入学习域</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {availableModules.map((item) => (
          <StatusPill key={item} label={item} tone="success" />
        ))}
      </View>
      {rows.map((row) => (
        <ButtonRow key={row.id}>
          <PrimaryButton
            label={row.primary.label}
            onPress={() => onAction(row.primary)}
            testID={row.primary.testID}
          />
          <SecondaryButton
            label={row.secondary.label}
            onPress={() => onAction(row.secondary)}
            testID={row.secondary.testID}
          />
        </ButtonRow>
      ))}
    </InfoCard>

    {plannedModules.length ? (
      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>已规划模块</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {plannedModules.map((item) => (
            <StatusPill key={item} label={item} tone="accent" />
          ))}
        </View>
      </InfoCard>
    ) : null}
  </>
);
