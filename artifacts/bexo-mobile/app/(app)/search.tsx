import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SlideLeft } from "@/components/ui/Motion";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { SectionLabel } from "@/components/ui/Controls";
import { useProfile } from "@/lib/use-profile";
import { useConnections } from "@/lib/connections-api";
import { layout } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";

type Icon = keyof typeof Feather.glyphMap;
type Result = { key: string; icon: Icon; title: string; meta: string; onPress: () => void };

const SETTINGS_INDEX: { title: string; meta: string; icon: Icon; key: string }[] = [
  { title: "Template and theme", meta: "Website", icon: "layout", key: "portfolio" },
  { title: "Billing", meta: "Plan and payment", icon: "credit-card", key: "billing" },
  { title: "Storage & files", meta: "Usage breakdown", icon: "hard-drive", key: "storage" },
  { title: "Account & security", meta: "Phone, email, sessions", icon: "shield", key: "account" },
  { title: "Hiring status", meta: "Open to hire", icon: "briefcase", key: "hiring" },
];

/**
 * "16 Search" — searches what actually exists on this account: portfolio
 * section entries, connections, and settings pages. There is no server search
 * index, so this filters the data already loaded for Update/Network/Settings.
 */
export default function Search() {
  const { c } = useTheme();
  const { data: profile } = useProfile();
  const { data: connectionsData } = useConnections();
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();

    const sectionResults: Result[] = profile
      ? [
          ...flatten(profile.educationEntries, "book-open", "Education", (e) => e.institution),
          ...flatten(profile.experienceEntries, "briefcase", "Experience", (e) => e.role),
          ...flatten(profile.projectEntries, "folder", "Projects", (e) => e.title ?? "Project"),
          ...flatten(profile.certificateEntries, "award", "Certificates", (e) => e.title ?? "Certificate"),
          ...flatten(profile.skillEntries, "zap", "Skills", (e) => e.name),
        ]
      : [];

    const peopleResults: Result[] = (connectionsData?.connections ?? []).map((edge) => ({
      key: `person-${edge.id}`,
      icon: "user" as const,
      title: edge.person.name ?? edge.person.handle ?? "BEXO member",
      meta: edge.person.headline ?? "Connection",
      onPress: () => router.push("/(app)/network"),
    }));

    const settingsResults: Result[] = SETTINGS_INDEX.map((row) => ({
      key: `setting-${row.key}`,
      icon: row.icon,
      title: row.title,
      meta: row.meta,
      onPress: () =>
        row.key === "portfolio"
          ? router.push("/(app)/portfolio")
          : router.push(`/(app)/settings-detail?key=${row.key}`),
    }));

    const matches = (r: Result) => q.length === 0 || `${r.title} ${r.meta}`.toLowerCase().includes(q);

    return [
      { label: "Your sections", items: sectionResults.filter(matches) },
      { label: "Connections", items: peopleResults.filter(matches) },
      { label: "Settings", items: settingsResults.filter(matches) },
    ].filter((g) => g.items.length > 0);
  }, [profile, connectionsData, query]);

  return (
    <Screen style={{ paddingHorizontal: 0 }} edges={["top"]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: layout.screenX,
          paddingTop: 12,
          paddingBottom: layout.navBarSpace,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              minHeight: 48,
              paddingHorizontal: 16,
              borderRadius: 16,
              backgroundColor: c.panel,
              borderWidth: 1,
              borderColor: c.accentEdge,
            }}
          >
            <Feather name="search" size={16} color={c.accentSoft} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              placeholder="Search your BEXO"
              placeholderTextColor={c.faint}
              style={{ flex: 1, fontFamily: fonts.sans400, fontSize: 14.5, color: c.ink }}
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <Feather name="x-circle" size={15} color={c.faint} />
              </Pressable>
            ) : null}
          </View>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={{ fontFamily: fonts.sans600, fontSize: 14, color: c.muted }}>Cancel</Text>
          </Pressable>
        </View>

        {groups.map((group, groupIndex) => (
          <SlideLeft key={group.label} delay={groupIndex * 70} duration={340} style={{ gap: 10 }}>
            <SectionLabel>{group.label}</SectionLabel>
            <View
              style={{
                borderRadius: 18,
                backgroundColor: c.panel,
                borderWidth: 1,
                borderColor: c.border,
                overflow: "hidden",
              }}
            >
              {group.items.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={item.onPress}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: c.border,
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 11,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: c.accentWash,
                    }}
                  >
                    <Feather name={item.icon} size={15} color={c.accentSoft} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontFamily: fonts.sans600, fontSize: 14, color: c.ink }}>{item.title}</Text>
                    <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}>{item.meta}</Text>
                  </View>
                  <Feather name="chevron-right" size={15} color={c.whisper} />
                </Pressable>
              ))}
            </View>
          </SlideLeft>
        ))}

        {groups.length === 0 ? (
          <Text style={{ fontFamily: fonts.sans400, fontSize: 13, color: c.muted, paddingTop: 20 }}>
            {query ? `Nothing matches "${query}".` : "Nothing to search yet — add sections or connections first."}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function flatten<T>(
  entries: T[] | undefined,
  icon: Icon,
  section: string,
  titleOf: (entry: T) => string | undefined,
): Result[] {
  if (!entries) return [];
  return entries.map((entry, i) => ({
    key: `${section}-${i}`,
    icon,
    title: titleOf(entry) || section,
    meta: section,
    onPress: () => router.push(`/(app)/section/${section.toLowerCase()}`),
  }));
}
