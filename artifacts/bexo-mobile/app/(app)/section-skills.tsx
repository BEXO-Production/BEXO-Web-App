import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { FadeInView } from "@/components/ui/Motion";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Screen } from "@/components/Screen";
import { SubScreenHeader } from "@/components/ui/SubScreenHeader";
import { CtaButton } from "@/components/ui/CtaButton";
import { useProfile } from "@/lib/use-profile";
import { useUpdateProfile, type SkillEntry } from "@/lib/profile-api";
import { newEntryId } from "@/lib/section-fields";
import { describeError } from "@/lib/errors";
import { colors } from "@/lib/theme";
import { fonts } from "@/lib/fonts";

const CATEGORIES: { id: SkillEntry["category"]; label: string }[] = [
  { id: "technical", label: "Technical" },
  { id: "tools", label: "Tools" },
  { id: "soft", label: "Soft skills" },
  { id: "languages", label: "Languages" },
];

/** Skills editor — a tag list per category, matching the shape
 * `normalizeSkills` (api-server/src/lib/publicProfile.ts) actually stores:
 * `{ id, name, category }`, category one of technical/tools/soft/languages. */
export default function SkillsEditor() {
  const { data } = useProfile();
  const updateProfile = useUpdateProfile();
  const [skills, setSkills] = useState<SkillEntry[] | null>(null);
  const [category, setCategory] = useState<SkillEntry["category"]>("technical");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (skills === null && data?.skillEntries) setSkills(data.skillEntries);
  }, [skills, data]);

  const addSkill = () => {
    const name = draft.trim();
    if (!name || !skills) return;
    if (skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setDraft("");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSkills([...skills, { id: newEntryId(), name, category }]);
    setDraft("");
  };

  const removeSkill = (id: string) => {
    Haptics.selectionAsync();
    setSkills((prev) => prev?.filter((s) => s.id !== id) ?? prev);
  };

  const publish = () => {
    if (!skills) return;
    setError("");
    updateProfile.mutate(
      { skillEntries: skills },
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
        <SubScreenHeader title="Skills" onBack={() => router.back()} />

        <View style={{ gap: 10 }}>
          <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: colors.muted }}>Category</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {CATEGORIES.map((cat) => {
              const active = cat.id === category;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setCategory(cat.id);
                  }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: 999,
                    backgroundColor: active ? colors.accentWash : colors.panel,
                    borderWidth: 1,
                    borderColor: active ? colors.accentEdge : colors.border,
                  }}
                >
                  <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: active ? colors.accentSoft : colors.ink }}>
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={addSkill}
            returnKeyType="done"
            placeholder="Add a skill…"
            placeholderTextColor={colors.faint}
            style={{
              flex: 1,
              minHeight: 50,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.accentEdge,
              backgroundColor: colors.panel,
              paddingHorizontal: 16,
              fontFamily: fonts.sans400,
              fontSize: 15,
              color: colors.ink,
            }}
          />
          <Pressable
            onPress={addSkill}
            disabled={!draft.trim()}
            style={{
              width: 50,
              height: 50,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: draft.trim() ? colors.cta : colors.deep,
            }}
          >
            <Feather name="plus" size={20} color={draft.trim() ? colors.onCta : colors.faint} />
          </Pressable>
        </View>

        {CATEGORIES.map((cat) => {
          const items = (skills ?? []).filter((s) => s.category === cat.id);
          if (items.length === 0) return null;
          return (
            <View key={cat.id} style={{ gap: 10 }}>
              <Text
                style={{
                  fontFamily: fonts.sans700,
                  fontSize: 10.5,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: colors.faint,
                }}
              >
                {cat.label}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {items.map((skill) => (
                  <FadeInView
                    key={skill.id}
                    duration={180}  style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingLeft: 14,
                      paddingRight: 8,
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: colors.panel,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text style={{ fontFamily: fonts.sans600, fontSize: 13, color: colors.ink }}>{skill.name}</Text>
                    <Pressable onPress={() => removeSkill(skill.id)} hitSlop={8}>
                      <Feather name="x" size={14} color={colors.faint} />
                    </Pressable>
                  </FadeInView>
                ))}
              </View>
            </View>
          );
        })}

        {skills !== null && skills.length === 0 ? (
          <Text style={{ fontFamily: fonts.sans400, fontSize: 13, color: colors.faint, textAlign: "center", paddingVertical: 20 }}>
            No skills yet — add a few above.
          </Text>
        ) : null}

        {error ? (
          <Text style={{ fontFamily: fonts.sans500, fontSize: 12.5, color: colors.danger, textAlign: "center" }}>
            {error}
          </Text>
        ) : null}

        <CtaButton
          label="Publish changes"
          icon="upload-cloud"
          onPress={publish}
          disabled={skills === null}
          loading={updateProfile.isPending}
        />
      </ScrollView>
    </Screen>
  );
}
