import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Rise } from "@/components/ui/Motion";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { CircleIconButton, FilterPill } from "@/components/ui/Controls";
import { useOverlay } from "@/lib/overlay-context";
import { useProfile } from "@/lib/use-profile";
import { layout } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";
import type { ProfileResponse } from "@/lib/auth-api";

type Icon = keyof typeof Feather.glyphMap;

const SECTIONS: { name: string; icon: Icon; key: keyof ProfileResponse | "about" | "contact" }[] = [
  { name: "About", icon: "user", key: "about" },
  { name: "Education", icon: "book-open", key: "educationEntries" },
  { name: "Experience", icon: "briefcase", key: "experienceEntries" },
  { name: "Projects", icon: "folder", key: "projectEntries" },
  { name: "Certificates", icon: "award", key: "certificateEntries" },
  { name: "Skills", icon: "zap", key: "skillEntries" },
  { name: "Contact", icon: "mail", key: "contact" },
];

const CHIPS = ["All", "About", "Education", "Experience", "Projects", "Skills"];

/** "11 Edit profile" — jump chips over the section list, real entry counts. */
export default function EditProfile() {
  const { c, shadow } = useTheme();
  const { toast } = useOverlay();
  const { data } = useProfile();
  const [chip, setChip] = useState("All");

  const rows = SECTIONS.map((section) => {
    if (section.key === "about") {
      return { ...section, detail: data?.aboutEntries?.length ? "Filled in" : "Empty" };
    }
    if (section.key === "contact") {
      const c2 = data?.contactData;
      const filled = c2 ? [c2.email, c2.phone, c2.linkedin, c2.github, c2.portfolio].filter(Boolean).length : 0;
      return { ...section, detail: filled === 0 ? "Empty" : `${filled} filled in` };
    }
    const entries = (data?.[section.key] as unknown[] | undefined) ?? [];
    return { ...section, detail: entries.length === 0 ? "Empty" : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}` };
  });

  const sections = chip === "All" ? rows : rows.filter((s) => s.name === chip);

  return (
    <Screen style={{ paddingHorizontal: 0 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: layout.screenX,
          paddingTop: 12,
          paddingBottom: layout.navBarSpace,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <CircleIconButton icon="arrow-left" accessibilityLabel="Back" onPress={() => router.back()} />
          <Text style={{ flex: 1, fontFamily: fonts.serif600, fontSize: 24, letterSpacing: -0.4, color: c.ink }}>
            Edit profile
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
          {CHIPS.map((label) => (
            <FilterPill key={label} label={label} active={chip === label} onPress={() => setChip(label)} />
          ))}
        </ScrollView>

        <View style={{ gap: 10 }}>
          {sections.map((section, i) => (
            <Rise key={section.name} delay={i * 50} duration={400}>
              <Pressable
                onPress={() => router.push(`/(app)/section/${section.name.toLowerCase()}`)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  padding: 16,
                  borderRadius: 18,
                  backgroundColor: c.panel,
                  borderWidth: 1,
                  borderColor: c.border,
                  ...shadow.low,
                }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 13,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: c.accentWash,
                  }}
                >
                  <Feather name={section.icon} size={17} color={c.accentSoft} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontFamily: fonts.sans600, fontSize: 15, color: c.ink }}>{section.name}</Text>
                  <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}>{section.detail}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={c.whisper} />
              </Pressable>
            </Rise>
          ))}
        </View>

        <Pressable
          onPress={() => toast("Your sections are already live")}
          style={{
            minHeight: 50,
            borderRadius: 999,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: c.cta,
          }}
        >
          <Feather name="check-circle" size={17} color={c.onCta} />
          <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: c.onCta }}>Done editing</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
