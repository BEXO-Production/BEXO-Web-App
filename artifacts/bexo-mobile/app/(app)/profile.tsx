import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { Rise } from "@/components/ui/Motion";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ProgressBar, SectionLabel, Switch } from "@/components/ui/Controls";
import { useProfile } from "@/lib/use-profile";
import { useLeads } from "@/lib/analytics-api";
import { useAuth } from "@/lib/auth-context";
import { shareProfile } from "@/lib/share";
import { layout } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { formatBytes } from "@/lib/format";
import { fonts } from "@/lib/fonts";

type Row = { title: string; subtitle: string; icon: keyof typeof Feather.glyphMap; go: () => void };

/** "10 Profile" — identity, real plan/storage, every settings surface, appearance. */
export default function Profile() {
  const { c, shadow, dark, toggleDark } = useTheme();
  const { data } = useProfile();
  const { data: leads } = useLeads();
  const { signOut } = useAuth();

  if (!data?.user || !data?.profile) return null;

  const name = data?.user?.name ?? "Your name";
  const handle = data?.profile?.handle ?? null;
  const photoUrl = data?.user?.photoUrl ?? data?.profile?.cardDesign?.photoUrl ?? null;
  const unread = leads?.unread ?? 0;
  const usedBytes = Number(data?.user?.storageUsedBytes ?? 0);
  const quotaBytes = Number(data?.user?.storageQuotaBytes ?? 0);
  const storagePct = quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0;

  const rows: Row[] = [
    { title: "Edit profile", subtitle: "Sections, entries, media", icon: "edit-3", go: () => router.push("/(app)/edit-profile") },
    { title: "Enquiries", subtitle: unread > 0 ? `${unread} unread messages` : "All caught up", icon: "mail", go: () => router.push("/(app)/inbox") },
    { title: "Analytics", subtitle: "Views, visitors, traffic sources", icon: "bar-chart-2", go: () => router.push("/(app)/analytics") },
    { title: "Notifications", subtitle: "Requests and enquiries", icon: "bell", go: () => router.push("/(app)/notifications") },
    { title: "Storage & files", subtitle: `${formatBytes(usedBytes)} of ${formatBytes(quotaBytes)} used`, icon: "hard-drive", go: () => router.push("/(app)/settings-detail?key=storage") },
    { title: "Billing", subtitle: data?.isPremium ? `${data?.plan} · ${data?.billingPeriod ?? "—"}` : "Free plan", icon: "credit-card", go: () => router.push("/(app)/settings-detail?key=billing") },
    { title: "Account & security", subtitle: "Phone, email, sessions", icon: "shield", go: () => router.push("/(app)/settings-detail?key=account") },
    { title: "Instant Networking", subtitle: data?.user?.autoConnect ?? true ? "Auto-Connect on" : "Manual approval", icon: "zap", go: () => router.push("/(app)/settings-detail?key=auto-connect") },
    { title: "Hiring status", subtitle: data?.user?.openToHire ? "Open to hire" : "Not looking", icon: "briefcase", go: () => router.push("/(app)/settings-detail?key=hiring") },
  ];

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
        <Text style={{ fontFamily: fonts.serif600, fontSize: 26, letterSpacing: -0.5, color: c.ink }}>
          Profile
        </Text>

        <Rise
          duration={440}
          style={{
            borderRadius: 24,
            backgroundColor: c.panel,
            borderWidth: 1,
            borderColor: c.border,
            padding: 22,
            gap: 18,
            ...shadow.card,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <View
              style={{
                width: 58,
                height: 58,
                borderRadius: 29,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: c.deep,
                borderWidth: 1,
                borderColor: c.border,
                overflow: "hidden",
              }}
            >
              {photoUrl ? (
                <Image
                  source={{ uri: photoUrl }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="cover"
                />
              ) : (
                <Text style={{ fontFamily: fonts.serif600, fontSize: 22, color: c.muted }}>{name[0]}</Text>
              )}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: fonts.sans700, fontSize: 18, color: c.ink }}>{name}</Text>
              {data.profile.headline ? (
                <Text style={{ fontFamily: fonts.sans400, fontSize: 12.5, color: c.muted }}>
                  {data.profile.headline}
                </Text>
              ) : null}
              {handle ? (
                <Text style={{ fontFamily: fonts.mono500, fontSize: 11.5, color: c.accentSoft }}>@{handle}</Text>
              ) : null}
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => router.push("/(app)/edit-profile")}
              style={{
                flex: 1,
                minHeight: 46,
                borderRadius: 999,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                backgroundColor: c.cta,
              }}
            >
              <Feather name="edit-3" size={16} color={c.onCta} />
              <Text style={{ fontFamily: fonts.sans700, fontSize: 14, color: c.onCta }}>Edit profile</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Share profile"
              onPress={() => shareProfile(handle, name)}
              disabled={!handle}
              style={{
                minHeight: 46,
                paddingHorizontal: 18,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: c.panel,
                borderWidth: 1,
                borderColor: c.borderStrong,
                opacity: handle ? 1 : 0.4,
              }}
            >
              <Feather name="share-2" size={16} color={c.ink} />
            </Pressable>
          </View>
        </Rise>

        <View
          style={{
            borderRadius: 22,
            backgroundColor: c.panel,
            borderWidth: 1,
            borderColor: c.border,
            padding: 20,
            gap: 14,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontFamily: fonts.sans600, fontSize: 16, color: c.ink }}>Plan</Text>
              <View
                style={{
                  paddingVertical: 5,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  backgroundColor: c.accentWash,
                  borderWidth: 1,
                  borderColor: c.accentEdge,
                }}
              >
                <Text style={{ fontFamily: fonts.sans600, fontSize: 11.5, color: c.accentSoft }}>
                  {data.isPremium ? data.plan.charAt(0).toUpperCase() + data.plan.slice(1) : "Free"}
                </Text>
              </View>
            </View>
            {data.billingPeriod ? (
              <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}>
                {data.billingPeriod}
              </Text>
            ) : null}
          </View>
          <View style={{ gap: 8 }}>
            <ProgressBar pct={storagePct} />
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}>
                {formatBytes(usedBytes)} used
              </Text>
              <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}>
                {formatBytes(quotaBytes)}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={{
            borderRadius: 22,
            backgroundColor: c.panel,
            borderWidth: 1,
            borderColor: c.border,
            overflow: "hidden",
          }}
        >
          {rows.map((row) => (
            <Pressable
              key={row.title}
              onPress={row.go}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                paddingVertical: 16,
                paddingHorizontal: 20,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
              }}
            >
              <Feather name={row.icon} size={17} color={c.muted} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: fonts.sans500, fontSize: 14.5, color: c.ink }}>{row.title}</Text>
                <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}>{row.subtitle}</Text>
              </View>
              <Feather name="chevron-right" size={15} color={c.whisper} />
            </Pressable>
          ))}
        </View>

        <View
          style={{
            borderRadius: 22,
            backgroundColor: c.panel,
            borderWidth: 1,
            borderColor: c.border,
            paddingVertical: 18,
            paddingHorizontal: 20,
            gap: 15,
          }}
        >
          <SectionLabel>Appearance</SectionLabel>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Text style={{ flex: 1, fontFamily: fonts.sans400, fontSize: 14, color: c.ink }}>Dark mode</Text>
            <Switch value={dark} onToggle={toggleDark} />
          </View>
        </View>

        <Pressable
          onPress={async () => {
            await signOut();
            router.replace("/(auth)/phone");
          }}
          style={{
            borderRadius: 22,
            backgroundColor: c.panel,
            borderWidth: 1,
            borderColor: c.border,
            paddingVertical: 16,
            paddingHorizontal: 20,
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
          }}
        >
          <Feather name="log-out" size={17} color={c.danger} />
          <Text style={{ flex: 1, fontFamily: fonts.sans500, fontSize: 14.5, color: c.danger }}>Sign out</Text>
        </Pressable>

        <Text style={{ textAlign: "center", fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}>
          BEXO v1.0.0 · by Ace Digital
        </Text>
      </ScrollView>
    </Screen>
  );
}
