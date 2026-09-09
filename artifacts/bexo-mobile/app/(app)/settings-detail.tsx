import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Rise } from "@/components/ui/Motion";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { CircleIconButton, SectionLabel, Switch } from "@/components/ui/Controls";
import { useProfile } from "@/lib/use-profile";
import { useAssets, useUpdateProfile } from "@/lib/profile-api";
import { useOverlay } from "@/lib/overlay-context";
import { formatBytes } from "@/lib/format";
import { layout } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";

type Key = "storage" | "billing" | "account" | "hiring" | "auto-connect";

const TITLES: Record<Key, string> = {
  storage: "Storage & files",
  billing: "Billing",
  account: "Account & security",
  hiring: "Hiring status",
  "auto-connect": "Instant Networking",
};

const BREAKDOWN_COLORS = ["#2F6BFF", "#5B8CFF", "#9bb6ff", "#C4D4FF", "#DCE6FF", "#EFF4FF"];

/**
 * "19 Settings detail" — storage from real uploaded assets, billing and
 * account from the real subscription and user record, and a hiring toggle
 * that actually saves. The design canvas's role/mode/availability/
 * compensation sub-form has no columns behind it in the schema, so it isn't
 * here — shipping controls that silently don't save would be worse than not
 * showing them.
 */
export default function SettingsDetail() {
  const { c } = useTheme();
  const { toast } = useOverlay();
  const params = useLocalSearchParams<{ key?: string }>();
  const key = (params.key ?? "storage") as Key;
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();

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
            {TITLES[key]}
          </Text>
        </View>

        {key === "hiring" && profile ? (
          <Rise
            duration={400}
            style={{
              borderRadius: 22,
              backgroundColor: c.panel,
              borderWidth: 1,
              borderColor: c.border,
              padding: 20,
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: c.accentWash,
              }}
            >
              <Feather name="briefcase" size={20} color={c.accentSoft} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: c.ink }}>Open to hire</Text>
              <Text style={{ fontFamily: fonts.sans400, fontSize: 12, color: c.muted }}>
                Shows a badge on your card and portfolio
              </Text>
            </View>
            <Switch
              value={profile.user.openToHire}
              onToggle={() =>
                updateProfile.mutate(
                  { openToHire: !profile.user.openToHire },
                  {
                    onSuccess: () => toast(profile.user.openToHire ? "No longer open to hire" : "Open to hire"),
                    onError: () => toast("Could not update that"),
                  },
                )
              }
            />
          </Rise>
        ) : null}

        {key === "auto-connect" && profile ? (
          <Rise
            duration={400}
            style={{
              borderRadius: 22,
              backgroundColor: c.panel,
              borderWidth: 1,
              borderColor: c.border,
              padding: 20,
              gap: 16,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: c.accentWash,
                }}
              >
                <Feather name="zap" size={20} color={c.accentSoft} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: c.ink }}>Auto-Connect</Text>
                <Text style={{ fontFamily: fonts.sans400, fontSize: 12, color: c.muted }}>
                  Instantly accept when someone scans your card
                </Text>
              </View>
              <Switch
                value={profile.user.autoConnect ?? true}
                onToggle={() => {
                  const nextVal = !(profile.user.autoConnect ?? true);
                  updateProfile.mutate(
                    { autoConnect: nextVal },
                    {
                      onSuccess: () =>
                        toast(nextVal ? "Auto-Connect turned on" : "Manual approval required"),
                      onError: () => toast("Could not update Auto-Connect"),
                    },
                  );
                }}
              />
            </View>

            <View
              style={{
                paddingTop: 14,
                borderTopWidth: 1,
                borderTopColor: c.border,
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontFamily: fonts.sans600,
                  fontSize: 12.5,
                  color: c.ink,
                }}
              >
                How it works
              </Text>
              <Text
                style={{
                  fontFamily: fonts.sans400,
                  fontSize: 12,
                  lineHeight: 18,
                  color: c.muted,
                }}
              >
                • When enabled, any peer who taps or scans your card is instantly connected to your Network without waiting for manual confirmation.
              </Text>
              <Text
                style={{
                  fontFamily: fonts.sans400,
                  fontSize: 12,
                  lineHeight: 18,
                  color: c.muted,
                }}
              >
                • When disabled, connection requests will appear in your Notifications for you to review and accept manually.
              </Text>
            </View>
          </Rise>
        ) : null}

        {key === "storage" ? <StorageDetail /> : null}
        {key === "billing" && profile ? (
          <>
            <Pressable
              onPress={() => router.push("/(app)/billing" as any)}
              style={({ pressed }) => ({
                borderRadius: 20,
                backgroundColor: c.accent,
                paddingVertical: 14,
                paddingHorizontal: 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Feather name="credit-card" size={17} color="#FFF" />
              <Text style={{ fontFamily: fonts.sans600, fontSize: 14, color: "#FFF" }}>
                Manage Billing, Invoices & Add-ons
              </Text>
              <Feather name="arrow-right" size={16} color="#FFF" />
            </Pressable>

            <RowList
              rows={[
                { title: "Plan", subtitle: profile.isPremium ? "Active" : "Free plan", value: capitalize(profile.plan) },
                profile.billingPeriod ? { title: "Billing period", subtitle: "How often you're charged", value: profile.billingPeriod } : null,
                profile.expiresAt
                  ? {
                      title: profile.cancelAtPeriodEnd ? "Access ends" : "Renews",
                      subtitle: profile.autopay ? "Autopay enabled" : "Manual renewal",
                      value: new Date(profile.expiresAt).toLocaleDateString(),
                    }
                  : null,
              ].filter(Boolean) as RowItem[]}
            />
          </>
        ) : null}
        {key === "account" && profile ? (
          <RowList
            rows={[
              { title: "Phone", subtitle: "Sign-in number", value: `+${profile.user.phone}` },
              profile.user.email
                ? { title: "Email", subtitle: profile.user.oauthProvider ? `Linked with ${profile.user.oauthProvider}` : "Linked", value: profile.user.email }
                : null,
              profile.profile.handle ? { title: "Handle", subtitle: `${profile.profile.handle}.atbexo.com` } : null,
            ].filter(Boolean) as RowItem[]}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

type RowItem = { title: string; subtitle: string; value?: string };

function RowList({ rows }: { rows: RowItem[] }) {
  const { c } = useTheme();
  if (rows.length === 0) return null;
  return (
    <Rise
      delay={60}
      duration={440}
      style={{
        borderRadius: 22,
        backgroundColor: c.panel,
        borderWidth: 1,
        borderColor: c.border,
        overflow: "hidden",
      }}
    >
      {rows.map((row) => (
        <View
          key={row.title}
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
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: fonts.sans500, fontSize: 14.5, color: c.ink }}>{row.title}</Text>
            <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}>{row.subtitle}</Text>
          </View>
          {row.value ? (
            <Text style={{ fontFamily: fonts.sans600, fontSize: 13, color: c.muted }}>{row.value}</Text>
          ) : null}
        </View>
      ))}
    </Rise>
  );
}

function StorageDetail() {
  const { c } = useTheme();
  const { data, isLoading } = useAssets();

  const breakdown = useMemo(() => {
    const groups = new Map<string, number>();
    for (const asset of data?.assets ?? []) {
      const key = asset.sectionType || "Other";
      groups.set(key, (groups.get(key) ?? 0) + asset.sizeBytes);
    }
    const total = data?.storageUsedBytes || 1;
    return [...groups.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, bytes], i) => ({
        label: capitalize(label),
        bytes,
        pct: Math.max(1, Math.round((bytes / total) * 100)),
        color: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length],
      }));
  }, [data]);

  if (isLoading) {
    return (
      <View style={{ paddingVertical: 40, alignItems: "center" }}>
        <ActivityIndicator color={c.accentSoft} />
      </View>
    );
  }
  if (!data) return null;

  const quotaBytes = Number(data?.storageQuotaBytes ?? 0);
  const usedBytes = Number(data?.storageUsedBytes ?? 0);
  const pct = quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0;

  return (
    <Rise
      duration={400}
      style={{
        borderRadius: 22,
        backgroundColor: c.panel,
        borderWidth: 1,
        borderColor: c.border,
        padding: 22,
        gap: 16,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
        <View style={{ gap: 2 }}>
          <Text style={{ fontFamily: fonts.serif600, fontSize: 30, color: c.ink }}>
            {formatBytes(usedBytes)}
          </Text>
          <Text style={{ fontFamily: fonts.sans400, fontSize: 12, color: c.muted }}>
            of {formatBytes(quotaBytes)} used
          </Text>
        </View>
      </View>

      <View style={{ height: 10, borderRadius: 10, backgroundColor: c.deep, overflow: "hidden", flexDirection: "row" }}>
        {breakdown.length > 0 ? (
          breakdown.map((item) => (
            <View key={item.label} style={{ width: `${item.pct}%`, height: "100%", backgroundColor: item.color }} />
          ))
        ) : (
          <View style={{ width: `${pct}%`, height: "100%", backgroundColor: c.accent }} />
        )}
      </View>

      {breakdown.length > 0 ? (
        <View style={{ gap: 10 }}>
          {breakdown.map((item) => (
            <View key={item.label} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color }} />
              <Text style={{ flex: 1, fontFamily: fonts.sans400, fontSize: 13.5, color: c.ink }}>{item.label}</Text>
              <Text style={{ fontFamily: fonts.sans600, fontSize: 13, color: c.muted }}>
                {formatBytes(item.bytes)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ fontFamily: fonts.sans400, fontSize: 13, color: c.muted }}>
          No files uploaded yet.
        </Text>
      )}

      {pct >= 80 && (
        <View
          style={{
            borderRadius: 16,
            padding: 16,
            backgroundColor: "rgba(245, 158, 11, 0.08)",
            borderWidth: 1,
            borderColor: "rgba(245, 158, 11, 0.28)",
            gap: 10,
            marginTop: 4,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="alert-triangle" size={16} color="#F59E0B" />
            <Text style={{ fontFamily: fonts.sans700, fontSize: 13, color: "#F59E0B", flex: 1 }}>
              Storage Running Low ({Math.round(pct)}%)
            </Text>
          </View>
          <Text style={{ fontFamily: fonts.sans400, fontSize: 12, lineHeight: 17, color: c.muted }}>
            You've used over 80% of your cloud storage. Expand anytime in +50 MB blocks without changing your plan.
          </Text>
          <Pressable
            onPress={() => router.push("/(app)/billing" as any)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 12,
              backgroundColor: c.accent,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Feather name="hard-drive" size={14} color="#FFF" />
            <Text style={{ fontFamily: fonts.sans600, fontSize: 13, color: "#FFF" }}>
              Get Storage Add-on · ₹49/mo
            </Text>
          </Pressable>
        </View>
      )}
    </Rise>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
