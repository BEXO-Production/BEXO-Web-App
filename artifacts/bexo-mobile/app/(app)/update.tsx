import { Pressable, ScrollView, Text, View } from "react-native";
import { Rise } from "@/components/ui/Motion";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ProgressBar, SectionLabel } from "@/components/ui/Controls";
import { useProfile } from "@/lib/use-profile";
import { layout } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";
import type { ProfileResponse } from "@/lib/auth-api";

type Icon = keyof typeof Feather.glyphMap;

const SECTION_ROWS: { key: keyof ProfileResponse; label: string; icon: Icon }[] = [
  { key: "educationEntries", label: "Education", icon: "book-open" },
  { key: "experienceEntries", label: "Experience", icon: "briefcase" },
  { key: "projectEntries", label: "Projects", icon: "folder" },
  { key: "certificateEntries", label: "Certificates", icon: "award" },
  { key: "achievementEntries", label: "Achievements", icon: "star" },
  { key: "skillEntries", label: "Skills", icon: "zap" },
];

/** "07 Update" — the two ways to add to a portfolio, real monthly credits, real section counts. */
export default function Update() {
  const { c, shadow } = useTheme();
  const { data } = useProfile();

  const limits = data?.limits;
  const parsePct = limits ? Math.min(100, (limits.parsesUsed / Math.max(1, limits.parsesPerMonth)) * 100) : 0;
  const updatePct = limits ? Math.min(100, (limits.updatesUsed / Math.max(1, limits.updatesPerMonth)) * 100) : 0;

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
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <Text style={{ fontFamily: fonts.serif600, fontSize: 26, letterSpacing: -0.5, color: c.ink }}>
            Updates
          </Text>
          <Pressable
            onPress={() => router.push("/(app)/profile")}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: c.deep,
              borderWidth: 1,
              borderColor: c.border,
            }}
          >
            <Text style={{ fontFamily: fonts.sans700, fontSize: 14, color: c.muted }}>
              {initials(data?.user?.name)}
            </Text>
          </Pressable>
        </View>

        <Text style={{ fontFamily: fonts.sans400, fontSize: 13, color: c.muted }}>
          Keep your portfolio fresh. Choose an action below.
        </Text>

        <Rise duration={440}>
          <ActionCard
            icon="file-text"
            tint={c.accentSoft}
            tintBackground={c.accentWash}
            title="Parse Resume"
            body="Upload your resume and let AI extract your education, experience, projects, and skills automatically."
            onPress={() => router.push("/(app)/resume-parse")}
          />
        </Rise>

        <Rise delay={70} duration={440}>
          <ActionCard
            icon="award"
            tint={c.success}
            tintBackground="rgba(14,159,93,0.10)"
            title="Post Achievement"
            body="Manually add a new entry to any section of your portfolio — education, project, certificate, and more."
            onPress={() => router.push("/(app)/achievement")}
          />
        </Rise>

        {limits ? (
          <Rise
            delay={140}
            duration={440}
            style={{
              borderRadius: 22,
              backgroundColor: c.panel,
              borderWidth: 1,
              borderColor: c.border,
              padding: 20,
              gap: 14,
            }}
          >
            <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: c.muted }}>Monthly credits</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <Credit
                label="Resume parses"
                pct={parsePct}
                used={`${limits.parsesUsed} of ${limits.parsesPerMonth} used`}
              />
              <View style={{ width: 1, height: 44, backgroundColor: c.border }} />
              <Credit
                label="Post updates"
                pct={updatePct}
                used={`${limits.updatesUsed} of ${limits.updatesPerMonth} used`}
              />
            </View>
            <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}>
              {limits.updatesDaysToReset === 0
                ? "Resets today"
                : `Resets in ${limits.updatesDaysToReset} ${limits.updatesDaysToReset === 1 ? "day" : "days"}`}
            </Text>
          </Rise>
        ) : null}

        {data ? (
          <Rise delay={200} duration={440} style={{ gap: 12 }}>
            <SectionLabel>Your sections</SectionLabel>
            <View
              style={{
                borderRadius: 22,
                backgroundColor: c.panel,
                borderWidth: 1,
                borderColor: c.border,
                overflow: "hidden",
                ...shadow.low,
              }}
            >
              {SECTION_ROWS.map((row) => {
                const entries = (data[row.key] as unknown[] | undefined) ?? [];
                return (
                  <Pressable
                    key={row.key}
                    onPress={() => router.push(`/(app)/section/${row.label.toLowerCase()}`)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 14,
                      paddingVertical: 15,
                      paddingHorizontal: 18,
                      borderBottomWidth: 1,
                      borderBottomColor: c.border,
                    }}
                  >
                    <Feather name={row.icon} size={15} color={c.accentSoft} />
                    <Text style={{ flex: 1, fontFamily: fonts.sans600, fontSize: 14, color: c.ink }}>
                      {row.label}
                    </Text>
                    <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}>
                      {entries.length === 0 ? "Empty" : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
                    </Text>
                    <Feather name="chevron-right" size={15} color={c.whisper} />
                  </Pressable>
                );
              })}
            </View>
          </Rise>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function initials(name?: string | null): string {
  if (!name) return "··";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function ActionCard({
  icon,
  tint,
  tintBackground,
  title,
  body,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  tint: string;
  tintBackground: string;
  title: string;
  body: string;
  onPress: () => void;
}) {
  const { c, shadow } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 22,
        backgroundColor: c.panel,
        borderWidth: 1,
        borderColor: c.border,
        padding: 20,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 14,
        ...shadow.card,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 15,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: tintBackground,
        }}
      >
        <Feather name={icon} size={22} color={tint} />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={{ fontFamily: fonts.sans700, fontSize: 18, color: c.ink }}>{title}</Text>
        <Text style={{ fontFamily: fonts.sans400, fontSize: 12.5, lineHeight: 19, color: c.muted }}>{body}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={c.whisper} />
    </Pressable>
  );
}

function Credit({ label, pct, used }: { label: string; pct: number; used: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, gap: 8 }}>
      <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.muted }}>{label}</Text>
      <ProgressBar pct={pct} height={6} />
      <Text style={{ fontFamily: fonts.sans600, fontSize: 11.5, color: c.ink }}>{used}</Text>
    </View>
  );
}
