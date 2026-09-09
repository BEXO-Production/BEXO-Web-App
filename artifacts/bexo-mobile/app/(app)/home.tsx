import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Rise } from "@/components/ui/Motion";
import { IdentityCard, identityFrom } from "@/components/IdentityCard";
import { CardStudioSheet } from "@/components/CardStudioSheet";
import { CardShareSheet } from "@/components/CardShareSheet";
import { CoachTour, type Rect } from "@/components/CoachTour";
import { ErrorState } from "@/components/ErrorState";
import { HomeSkeleton } from "@/components/Skeleton";
import { SectionLabel } from "@/components/ui/Controls";
import { useProfile } from "@/lib/use-profile";
import { useAnalytics, useLeads } from "@/lib/analytics-api";
import { connectionColor, personInitials, useConnections } from "@/lib/connections-api";
import { useCardDesignSync } from "@/lib/use-card-design-sync";
import { shareProfile } from "@/lib/share";
import { brand, layout } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { useOverlay } from "@/lib/overlay-context";
import { useCardDesign } from "@/lib/card-design-store";
import { useTourState } from "@/lib/tour-state";
import { fonts } from "@/lib/fonts";
import { HOME_DIMS } from "@/lib/design-data";
import type { ProfileResponse } from "@/lib/auth-api";
import { formatBytes } from "@/lib/format";

/**
 * "06 Home" — the flippable identity card, the live URL, real view and enquiry
 * counts, the plan's real remaining credits, and recent activity from the
 * user's actual connections. Everything here comes from the API; where there
 * is nothing yet, the screen says so rather than inventing a number.
 */
export default function Home() {
  const { c, shadow, dark } = useTheme();
  const { toast } = useOverlay();
  const { design, setDesign } = useCardDesign();
  const { tourStep, tourDone, nextTour, skipTour, presetId, applyPreset } = useTourState();
  const { data, isLoading, isRefetching, refetch, error } = useProfile();
  const { data: analytics } = useAnalytics(30);
  const { data: leads } = useLeads();
  const { data: connections } = useConnections();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  useCardDesignSync();

  const cardScale = Math.min(1, (windowWidth - 40) / HOME_DIMS.w);
  const cardW = HOME_DIMS.w * cardScale;
  const cardH = HOME_DIMS.h * cardScale;

  const [flipped, setFlipped] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [targets, setTargets] = useState<{ card?: Rect; insights?: Rect; fab?: Rect; nav?: Rect }>({});

  const cardRef = useRef<View>(null);
  const insightsRef = useRef<View>(null);
  const fabRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);

  const updateMeasurements = useCallback(() => {
    if (cardRef.current) {
      cardRef.current.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          setTargets((prev) => ({ ...prev, card: { x, y, width, height, radius: 26 } }));
        }
      });
    }
    if (insightsRef.current) {
      insightsRef.current.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          setTargets((prev) => ({ ...prev, insights: { x, y, width, height, radius: 22 } }));
        }
      });
    }
    if (fabRef.current) {
      fabRef.current.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          setTargets((prev) => ({ ...prev, fab: { x, y, width, height, radius: 26 } }));
        }
      });
    }
    const navBottomSpace = Math.max(insets.bottom, 12) + 12;
    const navHeight = 58;
    setTargets((prev) => ({
      ...prev,
      nav: {
        x: 14,
        y: windowHeight - navBottomSpace - navHeight,
        width: windowWidth - 28,
        height: navHeight,
        radius: 29,
      },
    }));
  }, [insets.bottom, windowWidth, windowHeight]);

  const navBottomSpace = Math.max(insets.bottom, 12) + 12;
  const fallbackTargets = useMemo(() => {
    return {
      card: {
        x: (windowWidth - cardW) / 2,
        y: Math.max(insets.top, 20) + 72,
        width: cardW,
        height: cardH,
        radius: 26,
      },
      insights: {
        x: 16,
        y: Math.max(insets.top, 20) + 72 + cardH + 52,
        width: windowWidth - 32,
        height: 84,
        radius: 22,
      },
      fab: {
        x: windowWidth - 20 - 52,
        y: windowHeight - (Math.max(insets.bottom, 12) + 70) - 52,
        width: 52,
        height: 52,
        radius: 26,
      },
      nav: {
        x: 14,
        y: windowHeight - navBottomSpace - 58,
        width: windowWidth - 28,
        height: 58,
        radius: 29,
      },
    };
  }, [insets.top, insets.bottom, windowWidth, windowHeight, cardW, cardH, navBottomSpace]);

  const activeTargets = useMemo(() => ({
    ...fallbackTargets,
    ...targets,
  }), [fallbackTargets, targets]);

  const handle = data?.profile?.handle ?? null;
  const site = handle ? `${handle}.atbexo.com` : null;
  const firstName = data?.user?.name?.trim().split(" ")[0]?.toLowerCase();

  const identity = identityFrom({
    name: data?.user?.name ?? undefined,
    role: data?.profile?.headline ?? undefined,
    site: site ?? undefined,
    email: data?.user?.email ?? undefined,
    phone: data?.user?.phone ? `+${data?.user?.phone}` : undefined,
    cardUrl: data?.user?.cardUrl,
    photoUrl: data?.user?.photoUrl,
  });

  const weekViews = analytics?.series?.slice(-7).reduce((sum, point) => sum + point.displayViews, 0);
  const unreadLeads = leads?.unread ?? 0;
  const pendingRequestsCount = useMemo(
    () => (connections?.connections ?? []).filter((e) => e.incoming && e.status === "pending").length,
    [connections],
  );
  const totalNotifications = unreadLeads + pendingRequestsCount;
  const limits = data?.limits;
  const storageUsed = Number(data?.user?.storageUsedBytes ?? 0);
  const storageQuota = Number(data?.user?.storageQuotaBytes ?? 52428800);
  const storagePercent = storageQuota > 0 ? (storageUsed / storageQuota) * 100 : 0;
  const isStorageNearLimit = storagePercent >= 80;

  /** Recent activity — the newest movement in this person's real network. */
  const feed = useMemo(() => {
    const edges = connections?.connections ?? [];
    return [...edges]
      .sort((a, b) => new Date(b.connectedSince).getTime() - new Date(a.connectedSince).getTime())
      .slice(0, 6);
  }, [connections]);

  const showTour = !tourDone && !isLoading && !!data;

  useEffect(() => {
    if (showTour) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      const t1 = setTimeout(updateMeasurements, 80);
      const t2 = setTimeout(updateMeasurements, 350);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [showTour, updateMeasurements]);

  useEffect(() => {
    if (showTour) {
      const t = setTimeout(updateMeasurements, 50);
      return () => clearTimeout(t);
    }
  }, [tourStep, showTour, updateMeasurements]);

  return (
    <Screen style={{ paddingHorizontal: 0 }} edges={["top"]}>
      <ScrollView
        ref={scrollRef}
        scrollEnabled={!showTour}
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        contentContainerStyle={{
          paddingHorizontal: layout.screenX,
          paddingTop: 12,
          paddingBottom: layout.navBarSpace + 40,
        }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.muted} />}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            paddingBottom: 18,
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={{
                fontFamily: fonts.sans700,
                fontSize: 10.5,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: c.faint,
              }}
            >
              Your portfolio
            </Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={{
                fontFamily: fonts.serif600,
                fontSize: 31,
                lineHeight: 36,
                letterSpacing: -0.8,
                color: c.ink,
              }}
            >
              hi, {firstName ?? "there"}
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <CircleButton icon="search" onPress={() => router.push("/(app)/search")} />
            <CircleButton
              icon="bell"
              dot={totalNotifications > 0}
              onPress={() => router.push("/(app)/notifications")}
            />
            <Pressable
              onPress={() => router.push("/(app)/profile")}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: c.deep,
                borderWidth: 1,
                borderColor: c.border,
                overflow: "hidden",
                ...shadow.low,
              }}
            >
              {data?.user?.photoUrl ? (
                <Image
                  source={{ uri: data?.user?.photoUrl }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="cover"
                />
              ) : (
                <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: c.muted }}>
                  {initials(data?.user?.name)}
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        {isLoading ? (
          <HomeSkeleton />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} variant="inline" />
        ) : data ? (
          <View style={{ gap: 22 }}>
            <Rise style={{ alignItems: "center", gap: 12 }}>
              <View
                ref={cardRef}
                collapsable={false}
                onLayout={() => requestAnimationFrame(updateMeasurements)}
              >
                <IdentityCard
                  identity={identity}
                  design={design}
                  scale={cardScale}
                  flipped={flipped}
                  onFlip={setFlipped}
                />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <MetaAction
                  icon="refresh-ccw"
                  label={flipped ? "tap to flip back" : "tap card for your QR"}
                  muted
                />
                <HairDivider />
                <Pressable onPress={() => setStudioOpen(true)} hitSlop={6}>
                  <MetaAction icon="sliders" label="Customize card" />
                </Pressable>
                <HairDivider />
                <Pressable onPress={() => setShareOpen(true)} hitSlop={6}>
                  <MetaAction icon="share-2" label="Share" />
                </Pressable>
              </View>
            </Rise>

            <Rise
              delay={60}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 10 }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: site ? c.success : c.faint,
                }}
              />
              <Text
                numberOfLines={1}
                style={{ flex: 1, fontFamily: fonts.sans500, fontSize: 13, color: c.muted }}
              >
                {site ? `live at ${site}` : "not published yet"}
              </Text>
              {site ? (
                <>
                  <Pressable
                    accessibilityLabel="Copy link"
                    hitSlop={8}
                    onPress={() => {
                      Clipboard.setStringAsync(`https://${site}`);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                      toast("Link copied");
                    }}
                  >
                    <Feather name="copy" size={16} color={c.muted} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Share link"
                    hitSlop={8}
                    onPress={() => shareProfile(handle, data?.user?.name ?? "")}
                  >
                    <Feather name="share-2" size={16} color={c.muted} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Open live site"
                    hitSlop={8}
                    onPress={() => Linking.openURL(`https://${site}`)}
                  >
                    <Feather name="external-link" size={16} color={c.muted} />
                  </Pressable>
                </>
              ) : null}
            </Rise>

            <Rise delay={120}>
              <View
                ref={insightsRef}
                collapsable={false}
                onLayout={() => requestAnimationFrame(updateMeasurements)}
                style={{
                  borderRadius: 22,
                  backgroundColor: c.panel,
                  borderWidth: 1,
                  borderColor: c.border,
                  paddingVertical: 17,
                  paddingHorizontal: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  ...shadow.card,
                }}
              >
                <Stat
                  label="TOTAL VIEWS"
                  value={fmt(analytics?.totals?.displayViews)}
                  onPress={() => router.push("/(app)/analytics")}
                />
                <StatDivider />
                <Stat label="THIS WEEK" value={fmt(weekViews)} onPress={() => router.push("/(app)/analytics")} />
                <StatDivider />
                <Stat
                  label="ENQUIRIES"
                  value={fmt(leads?.total)}
                  dot={unreadLeads > 0}
                  onPress={() => router.push("/(app)/inbox")}
                />
              </View>
            </Rise>

            <Rise delay={200} style={{ gap: 12 }}>
              <SectionLabel>Plan &amp; storage</SectionLabel>
              <Pressable
                onPress={() => router.push("/(app)/settings-detail?key=storage")}
                style={{
                  borderRadius: 22,
                  backgroundColor: c.panel,
                  borderWidth: 1,
                  borderColor: c.border,
                  padding: 20,
                  gap: 16,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ fontFamily: fonts.sans600, fontSize: 16, color: c.ink }}>Storage</Text>
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
                      {planLabel(data?.plan ?? "", data?.isPremium ?? false)}
                    </Text>
                  </View>
                </View>
                <StorageBar used={data?.user?.storageUsedBytes ?? 0} quota={data?.user?.storageQuotaBytes ?? 0} />
                {limits ? (
                  <Text style={{ fontFamily: fonts.sans400, fontSize: 12, color: c.muted }}>
                    {limits.updatesRemaining} of {limits.updatesPerMonth} monthly updates left ·{" "}
                    {limits.updatesDaysToReset === 0
                      ? "resets today"
                      : `resets in ${limits.updatesDaysToReset} ${
                          limits.updatesDaysToReset === 1 ? "day" : "days"
                        }`}
                  </Text>
                ) : null}
              </Pressable>

              {/* === 80%+ STORAGE ADD-ON SUGGESTION BANNER === */}
              {isStorageNearLimit ? (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/(app)/billing");
                  }}
                  style={{
                    borderRadius: 18,
                    backgroundColor: dark ? "rgba(245,158,11,0.14)" : "rgba(245,158,11,0.09)",
                    borderWidth: 1.2,
                    borderColor: "rgba(245,158,11,0.38)",
                    padding: 16,
                    gap: 12,
                    shadowColor: "#F59E0B",
                    shadowOpacity: 0.15,
                    shadowRadius: 10,
                    elevation: 3,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          backgroundColor: "rgba(245,158,11,0.22)",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Feather name="alert-triangle" size={14} color="#D97706" />
                      </View>
                      <Text style={{ fontFamily: fonts.sans700, fontSize: 13.5, color: c.ink }}>
                        Storage {storagePercent.toFixed(0)}% Full
                      </Text>
                    </View>

                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2.5,
                        borderRadius: 999,
                        backgroundColor: "rgba(245,158,11,0.2)",
                      }}
                    >
                      <Text style={{ fontFamily: fonts.mono700, fontSize: 10.5, color: "#D97706" }}>
                        80%+ USED
                      </Text>
                    </View>
                  </View>

                  <Text style={{ fontFamily: fonts.sans400, fontSize: 12, lineHeight: 17, color: c.muted }}>
                    You’ve used {formatBytes(storageUsed)} of your {formatBytes(storageQuota)} limit. Avoid upload failures by adding storage blocks.
                  </Text>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      borderRadius: 10,
                      backgroundColor: dark ? "rgba(255,255,255,0.06)" : "#FFFFFF",
                      borderWidth: 1,
                      borderColor: "rgba(245,158,11,0.25)",
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Feather name="plus-circle" size={13} color="#D97706" />
                      <Text style={{ fontFamily: fonts.sans700, fontSize: 12.5, color: c.ink }}>
                        Get +50 MB Storage Add-on
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={{ fontFamily: fonts.mono700, fontSize: 12, color: "#D97706" }}>
                        ₹49/mo
                      </Text>
                      <Feather name="chevron-right" size={13} color="#D97706" />
                    </View>
                  </View>
                </Pressable>
              ) : null}
            </Rise>

            <Rise delay={300} style={{ gap: 12 }}>
              <SectionLabel>Recent activity</SectionLabel>
              <View
                style={{
                  borderRadius: 22,
                  backgroundColor: c.panel,
                  borderWidth: 1,
                  borderColor: c.border,
                  overflow: "hidden",
                }}
              >
                {feed.length === 0 ? (
                  <Pressable
                    onPress={() => router.push("/(app)/scan")}
                    style={{ alignItems: "center", gap: 8, paddingVertical: 28, paddingHorizontal: 20 }}
                  >
                    <Feather name="maximize" size={22} color={c.accentSoft} />
                    <Text style={{ fontFamily: fonts.sans600, fontSize: 14, color: c.ink }}>
                      No connections yet
                    </Text>
                    <Text
                      style={{
                        fontFamily: fonts.sans400,
                        fontSize: 12,
                        lineHeight: 18,
                        textAlign: "center",
                        color: c.muted,
                      }}
                    >
                      Scan someone’s BEXO card and they’ll appear here.
                    </Text>
                  </Pressable>
                ) : (
                  feed.map((edge) => (
                    <Pressable
                      key={edge.id}
                      onPress={() => router.push("/(app)/network")}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
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
                          borderRadius: 17,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: connectionColor(edge),
                        }}
                      >
                        <Text style={{ fontFamily: fonts.sans700, fontSize: 12.5, color: "#fff" }}>
                          {personInitials(edge.person)}
                        </Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text
                          numberOfLines={1}
                          style={{ fontFamily: fonts.sans400, fontSize: 13.5, color: c.ink }}
                        >
                          <Text style={{ fontFamily: fonts.sans700 }}>
                            {edge.person.name ?? edge.person.handle ?? "Someone"}
                          </Text>{" "}
                          {edge.status === "accepted"
                            ? "connected with you"
                            : edge.incoming
                              ? "wants to connect"
                              : "hasn’t answered yet"}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}
                        >
                          {edge.person.headline ?? edge.person.handle ?? "BEXO member"}
                        </Text>
                      </View>
                      <Feather
                        name={edge.status === "accepted" ? "check-circle" : "clock"}
                        size={15}
                        color={edge.status === "accepted" ? c.success : c.warn}
                      />
                    </Pressable>
                  ))
                )}
              </View>
            </Rise>
          </View>
        ) : null}
      </ScrollView>

      {/* Floating Quick Action Button — Update Portfolio */}
      <Rise
        delay={250}
        style={{
          position: "absolute",
          right: 20,
          bottom: Math.max(insets.bottom, 12) + 70,
          zIndex: 99,
        }}
      >
        <View
          ref={fabRef}
          collapsable={false}
          onLayout={() => requestAnimationFrame(updateMeasurements)}
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: brand.accent,
            shadowOpacity: 0.55,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 14,
            backgroundColor: "transparent",
          }}
        >
          <Pressable
            accessibilityLabel="Update portfolio"
            accessibilityRole="button"
            accessibilityHint="Opens actions to parse resume, post achievements, or update sections"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              router.push("/(app)/update");
            }}
            style={({ pressed }) => ({
              width: 52,
              height: 52,
              borderRadius: 26,
              alignItems: "center",
              justifyContent: "center",
              transform: [{ scale: pressed ? 0.90 : 1 }],
            })}
          >
            {/* Outer ambient glow halo ring */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: -3,
                left: -3,
                right: -3,
                bottom: -3,
                borderRadius: 29,
                borderWidth: 1.5,
                borderColor: "rgba(79, 137, 255, 0.32)",
              }}
            />

            {/* Main glass button core */}
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                overflow: "hidden",
                borderWidth: 1.5,
                borderColor: "rgba(255, 255, 255, 0.40)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Luxury royal blue / indigo gradient */}
              <LinearGradient
                colors={["#4F8FFF", "#2B68FF", "#184CE8"]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: 26 }]}
              />

              {/* Specular top-light reflection (Apple glass lens sheen) */}
              <LinearGradient
                colors={["rgba(255, 255, 255, 0.45)", "rgba(255, 255, 255, 0.0)"]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 0.65 }}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 26,
                  borderTopLeftRadius: 26,
                  borderTopRightRadius: 26,
                }}
              />

              {/* Feather Plus Icon with soft depth shadow */}
              <Feather
                name="plus"
                size={24}
                color="#FFFFFF"
                style={{
                  textShadowColor: "rgba(10, 30, 80, 0.45)",
                  textShadowOffset: { width: 0, height: 1.5 },
                  textShadowRadius: 3,
                }}
              />
            </View>
          </Pressable>
        </View>
      </Rise>

      {showTour ? (
        <CoachTour
          visible={showTour}
          step={tourStep}
          targets={activeTargets}
          presetId={presetId}
          onPickPreset={(preset) => {
            applyPreset(preset.id);
            setDesign({ skinId: preset.skin, fontId: preset.font, accentId: preset.accent });
            Haptics.selectionAsync().catch(() => {});
          }}
          onNext={nextTour}
          onSkip={skipTour}
          onFlipCard={() => setFlipped((f) => !f)}
        />
      ) : null}

      <CardStudioSheet visible={studioOpen} onClose={() => setStudioOpen(false)} identity={identity} />
      <CardShareSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        identity={identity}
        site={site ?? identity.cardUrl}
      />
    </Screen>
  );
}

function planLabel(plan: string, isPremium: boolean): string {
  if (!isPremium) return "Free";
  return plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : "Premium";
}

function initials(name?: string | null): string {
  if (!name) return "··";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "··";
}

function CircleButton({
  icon,
  onPress,
  dot,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress?: () => void;
  dot?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: c.panel,
        borderWidth: 1,
        borderColor: c.border,
      }}
    >
      <Feather name={icon} size={17} color={c.muted} />
      {dot ? (
        <View
          style={{
            position: "absolute",
            top: 7,
            right: 9,
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: c.accent,
            borderWidth: 2,
            borderColor: c.panel,
          }}
        />
      ) : null}
    </Pressable>
  );
}

function HairDivider() {
  const { c } = useTheme();
  return <View style={{ width: 1, height: 12, backgroundColor: c.border }} />;
}

function StatDivider() {
  const { c } = useTheme();
  return <View style={{ width: 1, height: 28, backgroundColor: c.border }} />;
}

function MetaAction({
  icon,
  label,
  muted,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  muted?: boolean;
}) {
  const { c } = useTheme();
  const tint = muted ? c.faint : c.accentSoft;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Feather name={icon} size={11} color={tint} />
      <Text style={{ fontFamily: muted ? fonts.sans500 : fonts.sans700, fontSize: 11.5, color: tint }}>
        {label}
      </Text>
    </View>
  );
}

function fmt(value?: number | null): string {
  return value === undefined || value === null ? "—" : value.toLocaleString();
}

function Stat({
  label,
  value,
  dot,
  onPress,
}: {
  label: string;
  value: string;
  dot?: boolean;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: "center", gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Text style={{ fontFamily: fonts.sans700, fontSize: 9.5, letterSpacing: 1.3, color: c.faint }}>
          {label}
        </Text>
        {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent }} /> : null}
      </View>
      <Text style={{ fontFamily: fonts.serif600, fontSize: 23, lineHeight: 27, color: c.ink }}>{value}</Text>
    </Pressable>
  );
}

function StorageBar({ used, quota }: { used?: number | string; quota?: number | string }) {
  const { c } = useTheme();
  const usedBytes = Number(used ?? 0);
  const quotaBytes = Number(quota ?? 0);
  const pct = quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0;
  const isAmber = pct >= 80;

  return (
    <View style={{ gap: 8 }}>
      <View style={{ height: 8, borderRadius: 8, backgroundColor: c.deep, overflow: "hidden" }}>
        <LinearGradient
          colors={isAmber ? ["#FBBF24", "#F59E0B"] : [brand.accentBright, brand.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ width: `${pct}%`, height: "100%", borderRadius: 8 }}
        />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: isAmber ? "#D97706" : c.faint }}>
          {formatBytes(usedBytes)} used ({pct.toFixed(0)}%)
        </Text>
        <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}>
          {formatBytes(quotaBytes)}
        </Text>
      </View>
    </View>
  );
}
