import { Pressable, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Rise } from "@/components/ui/Motion";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { CircleIconButton } from "@/components/ui/Controls";
import { layout } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";

import { fonts } from "@/lib/fonts";

type Icon = keyof typeof Feather.glyphMap;

/** Maps each tile straight onto the real section editor for that type. */
const CATEGORIES: { name: string; icon: Icon; hint: string; route: string }[] = [
  { name: "Certificate", icon: "award", hint: "Course, exam or licence", route: "/(app)/section/certificate" },
  { name: "Project", icon: "folder", hint: "Build, case study, repo", route: "/(app)/section/project" },
  { name: "Experience", icon: "briefcase", hint: "Job, internship, freelance", route: "/(app)/section/experience" },
  { name: "Education", icon: "book-open", hint: "Degree or programme", route: "/(app)/section/education" },
  { name: "Achievement", icon: "star", hint: "Prize or recognition", route: "/(app)/section/achievement" },
  { name: "Skill", icon: "zap", hint: "Tool or discipline", route: "/(app)/section-skills" },
];

/** "18 Post achievement" — pick the section first; the form adapts to it. */
export default function Achievement() {
  const { c, shadow } = useTheme();

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
            What did you achieve?
          </Text>
        </View>

        <Text style={{ fontFamily: fonts.sans400, fontSize: 13, color: c.muted }}>
          Pick a section — the form adapts to it.
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {CATEGORIES.map((category, i) => (
            <Rise key={category.name} delay={i * 60} duration={420} style={{ width: "48%", flexGrow: 1 }}>
              <Pressable
                onPress={() => router.push(category.route as never)}
                style={{
                  gap: 6,
                  padding: 18,
                  borderRadius: 20,
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
                    marginBottom: 4,
                  }}
                >
                  <Feather name={category.icon} size={18} color={c.accentSoft} />
                </View>
                <Text style={{ fontFamily: fonts.sans700, fontSize: 14, color: c.ink }}>{category.name}</Text>
                <Text style={{ fontFamily: fonts.sans400, fontSize: 11, lineHeight: 16, color: c.faint }}>
                  {category.hint}
                </Text>
              </Pressable>
            </Rise>
          ))}
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: 10,
            padding: 14,
            borderRadius: 16,
            backgroundColor: c.panel,
            borderWidth: 1,
            borderColor: c.border,
          }}
        >
          <Feather name="camera" size={16} color={c.accentSoft} />
          <Text style={{ flex: 1, fontFamily: fonts.sans400, fontSize: 12.5, lineHeight: 19, color: c.muted }}>
            Only have a paper certificate? Snap it — BEXO crops and straightens it for you.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
