import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Rise } from "@/components/ui/Motion";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { CircleIconButton, SectionLabel } from "@/components/ui/Controls";
import { useLeads, useMarkLeadRead } from "@/lib/analytics-api";
import { useConnections, useRespondToConnection } from "@/lib/connections-api";
import { useOverlay } from "@/lib/overlay-context";
import { useProfile } from "@/lib/use-profile";
import { getProfileNudge } from "@/lib/design-data";
import { layout } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";

type Item = {
  key: string;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  time: string;
  unread: boolean;
  onPress: () => void;
  edgeId?: string;
};

/**
 * "15 Notifications" — assembled from what's actually real: incoming
 * connection requests waiting on an answer, and unread enquiries. There is no
 * generic notifications log on the server, so this screen never invents
 * events that didn't happen.
 */
export default function Notifications() {
  const { c } = useTheme();
  const { toast } = useOverlay();
  const { data: leadsData, isLoading: leadsLoading } = useLeads();
  const { data: connectionsData, isLoading: connectionsLoading } = useConnections();
  const { data: profileData } = useProfile();
  const markRead = useMarkLeadRead();
  const respondConnection = useRespondToConnection();

  const isLoading = leadsLoading || connectionsLoading;

  const pendingRequests = useMemo(
    () => (connectionsData?.connections ?? []).filter((edge) => edge.incoming && edge.status === "pending"),
    [connectionsData],
  );
  const unreadLeads = useMemo(() => (leadsData?.leads ?? []).filter((lead) => !lead.readAt), [leadsData]);

  const nudge = useMemo(() => getProfileNudge(profileData), [profileData]);

  const items: Item[] = [
    ...pendingRequests.map((edge) => ({
      key: `req-${edge.id}`,
      edgeId: edge.id,
      icon: "user-plus" as const,
      title: `${edge.person.name ?? edge.person.handle ?? "Someone"} wants to connect`,
      body: edge.person.headline ?? "Scanned your BEXO card",
      time: relativeTime(edge.connectedSince),
      unread: true,
      onPress: () => router.push("/(app)/network"),
    })),
    ...unreadLeads.map((lead) => ({
      key: `lead-${lead.id}`,
      icon: "mail" as const,
      title: `New enquiry from ${lead.senderName ?? "someone"}`,
      body: lead.message ?? "No message",
      time: relativeTime(lead.createdAt),
      unread: true,
      onPress: () => router.push("/(app)/inbox"),
    })),
    {
      key: "portfolio-fresh",
      icon: "trending-up" as const,
      title: nudge.title,
      body: nudge.body,
      time: "Suggested",
      unread: false,
      onPress: () => router.push(profileData?.profile?.handle ? "/(app)/update" : "/(auth)/onboarding-wizard"),
    },
  ];

  const hasUnread = items.some((item) => item.unread);

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
            Notifications
          </Text>
          {hasUnread ? (
            <Pressable
              onPress={() => {
                unreadLeads.forEach((lead) => markRead.mutate(lead.id));
                toast(pendingRequests.length > 0 ? "Enquiries marked read" : "All caught up");
              }}
              hitSlop={8}
            >
              <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: c.accentSoft }}>Mark read</Text>
            </Pressable>
          ) : null}
        </View>

        {isLoading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={c.accentSoft} />
          </View>
        ) : items.length === 0 ? (
          <View style={{ alignItems: "center", gap: 10, paddingVertical: 50, paddingHorizontal: 20 }}>
            <Feather name="bell" size={26} color={c.faint} />
            <Text style={{ fontFamily: fonts.sans600, fontSize: 15, color: c.ink }}>All caught up</Text>
            <Text style={{ fontFamily: fonts.sans400, fontSize: 12.5, color: c.muted, textAlign: "center" }}>
              Connection requests and new enquiries will show up here.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <SectionLabel>Needs your attention</SectionLabel>
            <View style={{ gap: 6 }}>
              {items.map((item, i) => (
                <Rise key={item.key} delay={i * 60} duration={400}>
                  <Pressable
                    onPress={item.onPress}
                    style={{
                      flexDirection: "row",
                      gap: 13,
                      paddingVertical: 15,
                      paddingHorizontal: 16,
                      borderRadius: 16,
                      backgroundColor: item.unread ? c.accentWash : c.panel,
                      borderWidth: 1,
                      borderColor: item.unread ? c.accentEdge : c.border,
                    }}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 11,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: c.panel,
                        borderWidth: 1,
                        borderColor: c.border,
                      }}
                    >
                      <Feather name={item.icon} size={15} color={item.unread ? c.accentSoft : c.muted} />
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text
                        numberOfLines={1}
                        style={{ fontFamily: fonts.sans600, fontSize: 13.5, lineHeight: 19, color: c.ink }}
                      >
                        {item.title}
                      </Text>
                      <Text
                        numberOfLines={2}
                        style={{ fontFamily: fonts.sans400, fontSize: 11.5, lineHeight: 17, color: c.muted }}
                      >
                        {item.body}
                      </Text>
                      <Text style={{ fontFamily: fonts.sans400, fontSize: 11, color: c.faint }}>{item.time}</Text>
                    </View>
                    {item.edgeId ? (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          respondConnection.mutate(
                            { id: item.edgeId!, action: "accept" },
                            {
                              onSuccess: () => {
                                toast("Connection accepted!");
                                router.push("/(app)/network");
                              },
                              onError: () => toast("Could not accept connection"),
                            },
                          );
                        }}
                        style={{
                          alignSelf: "center",
                          paddingVertical: 7,
                          paddingHorizontal: 14,
                          borderRadius: 999,
                          backgroundColor: c.cta,
                        }}
                      >
                        <Text style={{ fontFamily: fonts.sans700, fontSize: 12, color: c.onCta }}>
                          Accept
                        </Text>
                      </Pressable>
                    ) : null}
                  </Pressable>
                </Rise>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.round(diff / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d ago` : `${Math.round(days / 7)}w ago`;
}
