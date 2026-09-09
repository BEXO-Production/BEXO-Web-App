import { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Screen } from "@/components/Screen";
import { SubScreenHeader } from "@/components/ui/SubScreenHeader";
import { CtaButton } from "@/components/ui/CtaButton";
import { useProfile } from "@/lib/use-profile";
import { useUpdateProfile, type ContactData } from "@/lib/profile-api";
import { describeError } from "@/lib/errors";
import { colors } from "@/lib/theme";
import { fonts } from "@/lib/fonts";

const FIELDS: { key: keyof ContactData; label: string; icon: keyof typeof Feather.glyphMap; keyboard?: "email-address" | "phone-pad" | "url" }[] = [
  { key: "email", label: "Email", icon: "mail", keyboard: "email-address" },
  { key: "phone", label: "Phone", icon: "phone", keyboard: "phone-pad" },
  { key: "linkedin", label: "LinkedIn", icon: "linkedin", keyboard: "url" },
  { key: "github", label: "GitHub", icon: "github", keyboard: "url" },
  { key: "portfolio", label: "Other link", icon: "link", keyboard: "url" },
];

const EMPTY: ContactData = { email: "", phone: "", linkedin: "", github: "", portfolio: "" };

/** Contact editor — a single object (`contactData`), not a list, mirroring
 * bexo-web's contact form exactly (dashboard.tsx). */
export default function ContactEditor() {
  const { data } = useProfile();
  const updateProfile = useUpdateProfile();
  const [form, setForm] = useState<ContactData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (form === null && data) setForm({ ...EMPTY, ...data.contactData });
  }, [form, data]);

  const publish = () => {
    if (!form) return;
    setError("");
    updateProfile.mutate(
      { contactData: form },
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
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30, gap: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SubScreenHeader title="Contact" onBack={() => router.back()} />

        {FIELDS.map((field) => (
          <View key={field.key} style={{ gap: 8 }}>
            <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: colors.muted }}>{field.label}</Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                minHeight: 52,
                paddingHorizontal: 16,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.panel,
              }}
            >
              <Feather name={field.icon} size={16} color={colors.faint} />
              <TextInput
                value={form?.[field.key] ?? ""}
                onChangeText={(v) => setForm((prev) => (prev ? { ...prev, [field.key]: v } : prev))}
                keyboardType={field.keyboard}
                autoCapitalize="none"
                placeholderTextColor={colors.faint}
                style={{ flex: 1, fontFamily: fonts.sans400, fontSize: 15, color: colors.ink }}
              />
            </View>
          </View>
        ))}

        {error ? (
          <Text style={{ fontFamily: fonts.sans500, fontSize: 12.5, color: colors.danger, textAlign: "center" }}>
            {error}
          </Text>
        ) : null}

        <CtaButton
          label="Publish changes"
          icon="upload-cloud"
          onPress={publish}
          disabled={form === null}
          loading={updateProfile.isPending}
        />
      </ScrollView>
    </Screen>
  );
}
