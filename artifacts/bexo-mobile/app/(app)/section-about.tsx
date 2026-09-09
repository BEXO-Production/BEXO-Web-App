import { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Screen } from "@/components/Screen";
import { SubScreenHeader } from "@/components/ui/SubScreenHeader";
import { CtaButton } from "@/components/ui/CtaButton";
import { useProfile } from "@/lib/use-profile";
import { useUpdateProfile } from "@/lib/profile-api";
import { describeError } from "@/lib/errors";
import { colors } from "@/lib/theme";
import { fonts } from "@/lib/fonts";

const BIO_MAX = 400;

/** About editor — `headline` and `bio` are real columns on `profiles`
 * (see lib/db/src/schema), not generic list entries, so this saves through
 * those two top-level PATCH fields rather than a fabricated `aboutEntries`
 * shape. */
export default function AboutEditor() {
  const { data } = useProfile();
  const updateProfile = useUpdateProfile();
  const [headline, setHeadline] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (headline === null && data) setHeadline(data.profile.headline ?? "");
    if (bio === null && data) setBio(data.profile.bio ?? "");
  }, [headline, bio, data]);

  const publish = () => {
    setError("");
    updateProfile.mutate(
      { headline: headline ?? "", bio: bio ?? "" },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        },
        onError: (err) => setError(describeError(err).message),
      },
    );
  };

  return (
    <Screen style={{ paddingHorizontal: 0 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30, gap: 18 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SubScreenHeader title="About" onBack={() => router.back()} />

        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: colors.muted }}>Headline</Text>
          <TextInput
            value={headline ?? ""}
            onChangeText={setHeadline}
            placeholder="e.g. Frontend Developer"
            placeholderTextColor={colors.faint}
            style={{
              minHeight: 52,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.panel,
              paddingHorizontal: 16,
              fontFamily: fonts.sans400,
              fontSize: 15,
              color: colors.ink,
            }}
          />
        </View>

        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: colors.muted }}>Bio</Text>
            <Text style={{ fontFamily: fonts.sans400, fontSize: 11, color: colors.faint }}>
              {(bio ?? "").length}/{BIO_MAX}
            </Text>
          </View>
          <TextInput
            value={bio ?? ""}
            onChangeText={(v) => setBio(v.slice(0, BIO_MAX))}
            placeholder="Write a brief description…"
            placeholderTextColor={colors.faint}
            multiline
            style={{
              minHeight: 120,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.panel,
              paddingHorizontal: 16,
              paddingVertical: 12,
              textAlignVertical: "top",
              fontFamily: fonts.sans400,
              fontSize: 15,
              color: colors.ink,
            }}
          />
        </View>

        {error ? (
          <Text style={{ fontFamily: fonts.sans500, fontSize: 12.5, color: colors.danger, textAlign: "center" }}>
            {error}
          </Text>
        ) : null}

        <CtaButton
          label="Publish changes"
          icon="upload-cloud"
          onPress={publish}
          disabled={headline === null}
          loading={updateProfile.isPending}
        />
      </ScrollView>
    </Screen>
  );
}
