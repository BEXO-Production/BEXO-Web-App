import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Rise } from "@/components/ui/Motion";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { CircleIconButton } from "@/components/ui/Controls";
import { LeadDetailSheet } from "@/components/LeadDetailSheet";
import { useLeads, useMarkLeadRead } from "@/lib/analytics-api";
import { useProfile } from "@/lib/use-profile";
import { shareProfile } from "@/lib/share";
import { layout } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";

/** "12 Inbox" — real enquiries from the portfolio's contact form. */
export default function Inbox() {
  const { c } = useTheme();
  const { data, isLoading, error } = useLeads();
  const { data: profile } = useProfile();
  const markRead = useMarkLeadRead();
  const [openId, setOpenId] = useState<string | null>(null);

  const leads = data?.leads ?? [];
  const unread = data?.unread ?? 0;

  return (
    <Screen style={{ paddingHorizontal: 0 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: layout.screenX,
          paddingTop: 12,
          paddingBottom: layout.navBarSpace,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <CircleIconButton icon="arrow-left" accessibilityLabel="Back" onPress={() => router.back()} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: fonts.serif600, fontSize: 24, letterSpacing: -0.4, color: c.ink }}>
              Enquiries
            </Text>
            <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.muted }}>
              {unread > 0 ? `${unread} unread` : "All caught up"}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={c.accentSoft} />
          </View>
        ) : error ? (
          <View style={{ alignItems: "center", gap: 8, paddingVertical: 44, paddingHorizontal: 20 }}>
            <Feather name="lock" size={22} color={c.faint} />
            <Text style={{ fontFamily: fonts.sans600, fontSize: 14, color: c.ink, textAlign: "center" }}>
              Enquiries need a paid plan
            </Text>
            <Text style={{ fontFamily: fonts.sans400, fontSize: 12.5, color: c.muted, textAlign: "center" }}>
              Upgrade to see messages from your portfolio's contact form.
            </Text>
          </View>
        ) : leads.length === 0 ? (
          <View style={{ alignItems: "center", gap: 12, paddingVertical: 44, paddingHorizontal: 20 }}>
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: c.accentWash,
                marginBottom: 8,
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: c.panel,
                }}
              >
                <Feather name="mail" size={30} color={c.accentSoft} />
              </View>
            </View>
            <Text style={{ fontFamily: fonts.sans700, fontSize: 18, color: c.ink }}>No enquiries yet</Text>
            <Text
              style={{
                fontFamily: fonts.sans400,
                fontSize: 13,
                lineHeight: 20,
                textAlign: "center",
                color: c.muted,
              }}
            >
              When someone fills out the contact form on your portfolio, their message will appear here.
            </Text>
            <Pressable
              onPress={() => profile?.profile?.handle && shareProfile(profile.profile.handle, profile?.user?.name ?? "")}
              disabled={!profile?.profile?.handle}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: c.accentEdge,
                backgroundColor: c.accentWash,
                marginTop: 8,
                opacity: profile?.profile?.handle ? 1 : 0.4,
              }}
            >
              <Feather name="share-2" size={14} color={c.accentSoft} />
              <Text style={{ fontFamily: fonts.sans600, fontSize: 13, color: c.accentSoft }}>
                Share portfolio link
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 5 }}>
            {leads.map((lead, i) => {
              const isUnread = !lead.readAt;
              return (
                <Rise key={lead.id} delay={i * 50} duration={380}>
                  <Pressable
                    onPress={() => {
                      if (isUnread) markRead.mutate(lead.id);
                      setOpenId(lead.id);
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      padding: 13,
                      borderRadius: 14,
                      backgroundColor: c.panel,
                      borderWidth: 1,
                      borderColor: c.border,
                    }}
                  >
                    <View
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 21,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        backgroundColor: isUnread ? c.accentWash : c.panelStrong,
                        borderColor: isUnread ? c.accentEdge : c.border,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: fonts.sans700,
                          fontSize: 13,
                          color: isUnread ? c.accentSoft : c.muted,
                        }}
                      >
                        {initialsOf(lead.senderName)}
                      </Text>
                    </View>

                    <View style={{ flex: 1, gap: 2 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <Text
                          numberOfLines={1}
                          style={{ flex: 1, fontFamily: fonts.sans600, fontSize: 13.5, color: c.ink }}
                        >
                          {lead.senderName ?? "Someone"}
                        </Text>
                        <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}>
                          {relativeTime(lead.createdAt)}
                        </Text>
                      </View>
                      <Text numberOfLines={2} style={{ fontFamily: fonts.sans400, fontSize: 12.5, color: c.muted }}>
                        {lead.message ?? "No message"}
                      </Text>
                    </View>

                    {isUnread ? (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} />
                    ) : null}
                  </Pressable>
                </Rise>
              );
            })}
          </View>
        )}
      </ScrollView>

      <LeadDetailSheet
        lead={leads.find((l) => l.id === openId) ?? null}
        onClose={() => setOpenId(null)}
      />
    </Screen>
  );
}

function initialsOf(name?: string | null): string {
  if (!name) return "··";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.round(diff / 3_600_000);
  if (hours < 1) return "now";
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d` : `${Math.round(days / 7)}w`;
}
