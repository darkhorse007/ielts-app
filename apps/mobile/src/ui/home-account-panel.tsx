import { Text, View } from "react-native";
import type { UserProfileResponse } from "../lib/api-types";
import { ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill } from "./primitives";
import { colors } from "./theme";

export const HomeAccountPanel = ({
  profile,
  profileStatus,
  onRefreshProfile,
  onSwitchInstance,
  onSignOut
}: {
  profile: UserProfileResponse | null;
  profileStatus: string;
  onRefreshProfile: () => void;
  onSwitchInstance: () => void;
  onSignOut: () => void;
}) => (
  <>
    <InfoCard>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>当前登录状态</Text>
      <ButtonRow>
        <StatusPill label={profile?.status ?? "未拉取"} tone={profile ? "success" : "neutral"} />
        <StatusPill label={profileStatus} tone={profile ? "accent" : "neutral"} />
      </ButtonRow>
      {profile ? (
        <View style={{ gap: 6, marginTop: 14 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>user_id: {profile.id}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>email: {profile.email ?? "-"}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>phone: {profile.phone ?? "-"}</Text>
        </View>
      ) : null}
    </InfoCard>

    <ButtonRow>
      <PrimaryButton label="刷新资料" onPress={onRefreshProfile} testID="home.refreshProfile" />
      <SecondaryButton label="切换实例" onPress={onSwitchInstance} testID="home.switchInstance" />
    </ButtonRow>

    <SecondaryButton label="退出登录" onPress={onSignOut} testID="home.signOut" />
  </>
);
