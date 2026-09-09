import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import * as WebBrowser from "expo-web-browser";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Screen } from "@/components/Screen";
import { SectionLabel } from "@/components/ui/Controls";
import { Rise } from "@/components/ui/Motion";
import { ease } from "@/lib/motion";
import { useProfile } from "@/lib/use-profile";
import { useUpdateProfile } from "@/lib/profile-api";
import { useOverlay } from "@/lib/overlay-context";
import { useTheme } from "@/lib/theme-context";
import { layout } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import {
  SITE_BACKGROUNDS,
  SITE_COLORS,
  SITE_FONT_IDS,
  SITE_TEMPLATES,
} from "@/lib/design-data";
import {
  NativeWebsitePreview,
  SITE_FONT_FAMILY,
} from "@/components/portfolio/NativeWebsitePreview";
import { TemplateThumbnail } from "@/components/portfolio/TemplateThumbnail";

/**
 * "09 Website" — The Live Portfolio Showcase & Template Studio.
 *
 * Faithfully mirrors the desktop live template preview studio:
 * - macOS-style browser frame with traffic lights & SSL domain pill
 * - Authentic Page Template selector with live mini browser previews & PRO tags
 * - Native 60fps high-fidelity rendering of Nico Palmer, Cura Futuri, & Sierra Montana
 * - Seamless WebView Live Web inspection
 * - One-tap publish with haptics and instant live updates
 */
export default function Portfolio() {
  const insets = useSafeAreaInsets();
  const { c, shadow, dark } = useTheme();
  const { toast } = useOverlay();
  const { data } = useProfile();
  const updateProfile = useUpdateProfile();
  const { width: windowWidth } = useWindowDimensions();

  // Determine user's active template (defaulting to their saved template)
  const savedTemplate =
    data?.profile?.templateId || data?.user?.templateId || "nico-palmer";

  const [templateId, setTemplateId] = useState<string>(savedTemplate);
  const [colorId, setColorId] = useState("blue");
  const [fontId, setFontId] = useState("display");
  const [backgroundId, setBackgroundId] = useState("grid");
  const [viewMode, setViewMode] = useState<"studio" | "live">("studio");
  const [fullScreenOpen, setFullScreenOpen] = useState(false);
  const [webViewKey, setWebViewKey] = useState(1);
  const [webViewLoading, setWebViewLoading] = useState(true);
  const [webViewFailed, setWebViewFailed] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const collapseProgress = useSharedValue(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    collapseProgress.value = withTiming(previewCollapsed ? 1 : 0, {
      duration: 340,
      easing: ease.soft,
    });
  }, [previewCollapsed, collapseProgress]);

  // Sync state whenever server data resolves
  useEffect(() => {
    if (!data?.user && !data?.profile) return;
    const serverTpl = data?.profile?.templateId || data?.user?.templateId;
    if (serverTpl && SITE_TEMPLATES.some((t) => t.id === serverTpl)) {
      setTemplateId(serverTpl);
    }
    const color = SITE_COLORS.find(
      (opt) => opt.hex === data?.user?.themeColor || opt.id === data?.user?.themeColor,
    );
    if (color) setColorId(color.id);
    if (data?.user?.themeBg) setBackgroundId(data?.user?.themeBg);
  }, [
    data?.user?.templateId,
    data?.profile?.templateId,
    data?.user?.themeColor,
    data?.user?.themeBg,
  ]);

  const template = useMemo(
    () => SITE_TEMPLATES.find((t) => t.id === templateId) ?? SITE_TEMPLATES[0],
    [templateId],
  );
  const accent = useMemo(
    () => SITE_COLORS.find((opt) => opt.id === colorId)?.hex ?? SITE_COLORS[0].hex,
    [colorId],
  );
  const siteFont = SITE_FONT_FAMILY[fontId] ?? fonts.serif600;
  const handle = data?.profile?.handle ?? null;
  const site = handle ? `${handle}.atbexo.com` : null;

  // Real backend preview URL matching the web dashboard engine
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.34:5001";
  const livePreviewUrl = handle
    ? `${apiBaseUrl}/api/render/${encodeURIComponent(handle)}/${encodeURIComponent(templateId)}/?preview=1`
    : `${apiBaseUrl}/api/render/bexo-demo/${encodeURIComponent(templateId)}/?preview=1`;

  // Detect whether the user has customized any settings from current server truth
  const hasUnsavedChanges = useMemo(() => {
    if (!data?.user) return false;
    const serverTemplate = data?.profile?.templateId || data?.user?.templateId || "nico-palmer";
    const serverColor = data?.user?.themeColor || "blue";
    const serverBg = data?.user?.themeBg || "grid";
    return (
      templateId !== serverTemplate ||
      colorId !== serverColor ||
      backgroundId !== serverBg
    );
  }, [data, templateId, colorId, backgroundId]);

  const publish = useCallback(() => {
    if (!handle) {
      toast("Claim a handle first from the onboarding wizard");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    updateProfile.mutate(
      { templateId, themeColor: colorId, themeBg: backgroundId },
      {
        onSuccess: () => {
          toast(`Published live to ${handle}.atbexo.com`);
          setWebViewKey((k) => k + 1);
        },
        onError: (err) => {
          toast(err.message || "Failed to publish changes");
        },
      },
    );
  }, [handle, templateId, colorId, backgroundId, updateProfile, toast]);

  const openLiveInBrowser = useCallback(async () => {
    if (!site) {
      toast("No live site published yet");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await WebBrowser.openBrowserAsync(`https://${site}`);
    } catch {
      toast("Could not open browser");
    }
  }, [site, toast]);

  const copyLiveLink = useCallback(() => {
    if (!site) return;
    Clipboard.setStringAsync(`https://${site}`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast("Link copied to clipboard");
  }, [site, toast]);

  const shareLiveSite = useCallback(async () => {
    if (!site) return;
    Haptics.selectionAsync().catch(() => {});
    try {
      await Share.share({
        title: `${data?.user?.name ?? "Portfolio"} on BEXO`,
        message: `Check out my portfolio: https://${site}`,
        url: `https://${site}`,
      });
    } catch {}
  }, [site, data?.user?.name]);

  const viewportHeight = Math.min(Math.max(windowWidth * 0.92, 340), 420);

  const viewportAnimatedStyle = useAnimatedStyle(() => ({
    height: viewportHeight * (1 - collapseProgress.value),
    opacity: 1 - collapseProgress.value,
  }));

  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${collapseProgress.value * 180}deg` }],
  }));

  const revealPreview = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    if (previewCollapsed) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setPreviewCollapsed(false);
    } else {
      Haptics.selectionAsync().catch(() => {});
    }
  }, [previewCollapsed]);

  return (
    <Screen style={{ paddingHorizontal: 0 }} edges={["top"]}>
      <View style={{ flex: 1 }}>
        {/* ── PINNED ZONE — header, domain pill & live preview never scroll away ── */}
        <View
          style={{
            paddingHorizontal: layout.screenX,
            paddingTop: 16,
            paddingBottom: 14,
            gap: 14,
            backgroundColor: c.paper,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
            zIndex: 2,
            ...shadow.low,
          }}
        >
          {/* Header section with live domain pill and quick actions */}
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ gap: 3 }}>
                <Text
                  style={{
                    fontFamily: fonts.sans700,
                    fontSize: 10.5,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    color: c.faint,
                  }}
                >
                  Portfolio &amp; Layout
                </Text>
                <Text
                  style={{
                    fontFamily: fonts.serif600,
                    fontSize: 29,
                    lineHeight: 34,
                    letterSpacing: -0.8,
                    color: c.ink,
                  }}
                >
                  Website
                </Text>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {site ? (
                  <>
                    <CircleBtn icon="copy" onPress={copyLiveLink} label="Copy link" />
                    <CircleBtn icon="share-2" onPress={shareLiveSite} label="Share" />
                    <CircleBtn icon="external-link" onPress={openLiveInBrowser} label="Open site" />
                  </>
                ) : null}
              </View>
            </View>

            {/* Subdomain pill banner */}
            <Pressable
              onPress={copyLiveLink}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 14,
                backgroundColor: c.panel,
                borderWidth: 1,
                borderColor: c.border,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: site ? c.success : c.faint,
                  }}
                />
                <Text style={{ fontFamily: fonts.mono500, fontSize: 13, color: c.ink }}>
                  {site ? `${site}` : "Draft · No subdomain claimed"}
                </Text>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View
                  style={{
                    paddingVertical: 3,
                    paddingHorizontal: 8,
                    borderRadius: 999,
                    backgroundColor: site ? "rgba(14,159,93,0.12)" : c.deep,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: fonts.sans700,
                      fontSize: 10.5,
                      color: site ? c.success : c.faint,
                      letterSpacing: 0.5,
                    }}
                  >
                    {site ? "LIVE" : "DRAFT"}
                  </Text>
                </View>
                <Feather name="chevron-right" size={14} color={c.faint} />
              </View>
            </Pressable>
          </View>

          {/* ── BROWSER MOCKUP SHOWCASE ──────────────────────────────────────── */}
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2 }}>
              <Text
                style={{
                  fontFamily: fonts.sans700,
                  fontSize: 11,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: c.faint,
                }}
              >
                Live Preview
              </Text>
              <Text
                style={{
                  fontFamily: fonts.mono500,
                  fontSize: 11,
                  color: c.muted,
                }}
              >
                {site ?? "bexo-demo.mybexo.cyou"}
              </Text>
            </View>

            <View
              style={{
                borderRadius: 22,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
                backgroundColor: template.dark ? "#090B10" : "#E3E3DB",
                shadowColor: "#000",
                shadowOpacity: dark ? 0.6 : 0.16,
                shadowRadius: 26,
                shadowOffset: { width: 0, height: 12 },
                elevation: 10,
              }}
            >
              {/* macOS Chrome Header Bar */}
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setPreviewCollapsed((v) => !v);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  backgroundColor: dark ? "rgba(18,22,34,0.96)" : "#ECE8DF",
                  borderBottomWidth: previewCollapsed ? 0 : 1,
                  borderBottomColor: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
                  gap: 10,
                }}
              >
                {/* Traffic light dots */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 9.5, height: 9.5, borderRadius: 5, backgroundColor: "#FF5F56" }} />
                  <View style={{ width: 9.5, height: 9.5, borderRadius: 5, backgroundColor: "#FFBD2E" }} />
                  <View style={{ width: 9.5, height: 9.5, borderRadius: 5, backgroundColor: "#27C93F" }} />
                </View>

                {/* URL Address Bar */}
                <View
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    height: 28,
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    backgroundColor: dark ? "rgba(255,255,255,0.07)" : "#FFFFFF",
                    borderWidth: 1,
                    borderColor: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                  }}
                >
                  <Feather name="lock" size={10.5} color={c.success} />
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: fonts.mono500,
                      fontSize: 11,
                      color: dark ? "rgba(255,255,255,0.85)" : "#222",
                      maxWidth: 160,
                    }}
                  >
                    {site ? `https://${site}` : "atbexo.com"}
                  </Text>
                </View>

                {/* View mode toggle, collapse chevron & expand icon */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      Haptics.selectionAsync().catch(() => {});
                      setViewMode((m) => (m === "studio" ? "live" : "studio"));
                    }}
                    style={{
                      paddingVertical: 4,
                      paddingHorizontal: 8,
                      borderRadius: 6,
                      backgroundColor: dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.07)",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: fonts.sans700,
                        fontSize: 10,
                        color: viewMode === "live" ? c.accentSoft : c.muted,
                        textTransform: "uppercase",
                      }}
                    >
                      {viewMode === "live" ? "Live Web" : "Studio"}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setFullScreenOpen(true);
                    }}
                    hitSlop={6}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.07)",
                    }}
                  >
                    <Feather name="maximize-2" size={12} color={c.ink} />
                  </Pressable>

                  <View
                    hitSlop={6}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.07)",
                    }}
                  >
                    <Animated.View style={chevronAnimatedStyle}>
                      <Feather name="chevron-up" size={13} color={c.ink} />
                    </Animated.View>
                  </View>
                </View>
              </Pressable>

              {/* Viewport Content */}
              <Animated.View style={[{ overflow: "hidden" }, viewportAnimatedStyle]}>
              {viewMode === "live" && Platform.OS !== "web" ? (
                <View style={{ flex: 1, backgroundColor: template.dark ? "#0B0D14" : "#FAF7F1" }}>
                  <WebView
                    key={webViewKey}
                    source={{ uri: livePreviewUrl }}
                    style={{ flex: 1, backgroundColor: template.dark ? "#0B0D14" : "#FAF7F1" }}
                    onLoadStart={() => {
                      setWebViewLoading(true);
                      setWebViewFailed(false);
                    }}
                    onLoadEnd={() => setWebViewLoading(false)}
                    onError={() => {
                      setWebViewLoading(false);
                      setWebViewFailed(true);
                    }}
                    scalesPageToFit
                  />
                  {webViewLoading ? (
                    <View
                      style={[
                        StyleSheet.absoluteFill,
                        {
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: template.dark ? "rgba(11,13,20,0.85)" : "rgba(250,247,241,0.85)",
                          gap: 10,
                        },
                      ]}
                    >
                      <ActivityIndicator color={accent} size="small" />
                      <Text style={{ fontFamily: fonts.sans500, fontSize: 11, color: c.muted }}>
                        Loading live bundle…
                      </Text>
                    </View>
                  ) : null}
                  {webViewFailed ? (
                    <View
                      style={[
                        StyleSheet.absoluteFill,
                        {
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 24,
                          backgroundColor: template.dark ? "#0B0D14" : "#FAF7F1",
                          gap: 12,
                        },
                      ]}
                    >
                      <Feather name="wifi-off" size={24} color={c.faint} />
                      <Text style={{ fontFamily: fonts.sans600, fontSize: 13, color: c.ink, textAlign: "center" }}>
                        Live preview server offline
                      </Text>
                      <Pressable
                        onPress={() => setViewMode("studio")}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 16,
                          borderRadius: 999,
                          backgroundColor: accent,
                        }}
                      >
                        <Text style={{ fontFamily: fonts.sans700, fontSize: 12, color: "#fff" }}>
                          Switch to Studio View
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : (
                /* Native interactive studio renderer */
                <NativeWebsitePreview
                  data={data}
                  templateId={templateId}
                  colorId={colorId}
                  accent={accent}
                  siteFont={siteFont}
                  backgroundId={backgroundId}
                  site={site}
                  onOpenFull={() => setFullScreenOpen(true)}
                />
              )}
            </Animated.View>
          </View>

          {!previewCollapsed ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 }}>
              <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}>
                Tap maximize to test live scroll and full layout
              </Text>
              {hasUnsavedChanges ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#F59E0B" }} />
                  <Text style={{ fontFamily: fonts.sans600, fontSize: 11, color: "#F59E0B" }}>
                    Unsaved tweaks
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      {/* ── SCROLLABLE ZONE — template, colours, type & background live below the pinned preview ── */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: layout.screenX,
          paddingTop: 18,
          paddingBottom: layout.navBarSpace + 60,
          gap: 22,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── PAGE TEMPLATE SELECTOR (Faithful to Image 1) ─────────────────── */}
        <Rise duration={340}>
        <View
          style={{
            borderRadius: 20,
            padding: 16,
            backgroundColor: c.panel,
            borderWidth: 1,
            borderColor: c.border,
            gap: 14,
            ...shadow.card,
          }}
        >
          {/* Card Title & Subtitle */}
          <View style={{ gap: 3 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Feather name="layout" size={16} color="#6366F1" />
              <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: c.ink }}>
                Page Template
              </Text>
            </View>
            <Text style={{ fontFamily: fonts.sans400, fontSize: 12, color: c.muted }}>
              Pick a layout — preview updates instantly.
            </Text>
          </View>

          {/* Template Choices List */}
          <View style={{ gap: 10 }}>
            {SITE_TEMPLATES.map((option) => {
              const active = option.id === templateId;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setTemplateId(option.id);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 10,
                    borderRadius: 16,
                    borderWidth: 2,
                    borderColor: active ? "#6366F1" : c.border,
                    backgroundColor: active
                      ? dark
                        ? "rgba(99,102,241,0.12)"
                        : "rgba(99,102,241,0.06)"
                      : dark
                        ? "rgba(255,255,255,0.03)"
                        : "#FFFFFF",
                  }}
                >
                  {/* Miniature Browser Mockup */}
                  <TemplateThumbnail
                    templateId={option.id}
                    userName={data?.user?.name || "Kavin Balaji"}
                    photoUrl={data?.user?.photoUrl}
                    accent={accent}
                    width={92}
                    height={64}
                  />

                  {/* Template Details */}
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: fonts.sans700,
                          fontSize: 13,
                          color: c.ink,
                        }}
                      >
                        {option.name}
                      </Text>
                      <View
                        style={{
                          paddingVertical: 1.5,
                          paddingHorizontal: 6,
                          borderRadius: 4,
                          backgroundColor: "rgba(99,102,241,0.12)",
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: fonts.sans700,
                            fontSize: 8.5,
                            color: "#6366F1",
                            letterSpacing: 0.5,
                            textTransform: "uppercase",
                          }}
                        >
                          PRO
                        </Text>
                      </View>
                    </View>

                    <Text
                      numberOfLines={2}
                      style={{
                        fontFamily: fonts.sans400,
                        fontSize: 11,
                        lineHeight: 14.5,
                        color: c.muted,
                      }}
                    >
                      {option.note}
                    </Text>

                    {/* DEMO Action link */}
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setTemplateId(option.id);
                        setFullScreenOpen(true);
                      }}
                      hitSlop={4}
                      style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}
                    >
                      <Feather name="eye" size={10} color="#6366F1" />
                      <Text
                        style={{
                          fontFamily: fonts.sans700,
                          fontSize: 9.5,
                          letterSpacing: 0.8,
                          textTransform: "uppercase",
                          color: "#6366F1",
                        }}
                      >
                        Demo
                      </Text>
                    </Pressable>
                  </View>

                  {/* Active Indicator Checkmark */}
                  {active ? (
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "#6366F1",
                      }}
                    >
                      <Feather name="check" size={13} color="#fff" />
                    </View>
                  ) : (
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        borderWidth: 1.5,
                        borderColor: c.border,
                      }}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Open Live Portfolio button matching Image 1 */}
          <Pressable
            onPress={openLiveInBrowser}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              paddingVertical: 11,
              paddingHorizontal: 16,
              borderRadius: 14,
              backgroundColor: dark ? "rgba(99,102,241,0.14)" : "rgba(99,102,241,0.09)",
              borderWidth: 1,
              borderColor: dark ? "rgba(99,102,241,0.3)" : "rgba(99,102,241,0.22)",
              marginTop: 2,
            }}
          >
            <Feather name="external-link" size={13} color="#6366F1" />
            <Text
              style={{
                fontFamily: fonts.sans700,
                fontSize: 12.5,
                color: "#6366F1",
              }}
            >
              Open Live Portfolio
            </Text>
          </Pressable>
        </View>
        </Rise>

        {/* ── ACCENT COLOUR ────────────────────────────────────────────────── */}
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
            <SectionLabel>Accent colour</SectionLabel>
            <Text style={{ fontFamily: fonts.sans500, fontSize: 12, color: c.faint }}>
              {SITE_COLORS.find((o) => o.id === colorId)?.label}
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 14 }}>
            {SITE_COLORS.map((option) => {
              const active = option.id === colorId;
              return (
                <Pressable
                  key={option.id}
                  accessibilityLabel={option.label}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setColorId(option.id);
                  }}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    padding: 3,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 2.5,
                    borderColor: active ? option.hex : "transparent",
                    transform: [{ scale: active ? 1.08 : 1 }],
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: option.hex,
                      alignItems: "center",
                      justifyContent: "center",
                      shadowColor: option.hex,
                      shadowOpacity: active ? 0.6 : 0.2,
                      shadowRadius: active ? 10 : 3,
                      shadowOffset: { width: 0, height: 2 },
                    }}
                  >
                    {active ? <Feather name="check" size={14} color="#fff" /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── TYPEFACE ─────────────────────────────────────────────────────── */}
        <View style={{ gap: 12 }}>
          <SectionLabel>Typeface</SectionLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {SITE_FONT_IDS.map((option) => {
              const active = option.id === fontId;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setFontId(option.id);
                  }}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 999,
                    borderWidth: 1.5,
                    borderColor: active ? accent : c.border,
                    backgroundColor: active ? (dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)") : c.panel,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: SITE_FONT_FAMILY[option.id],
                      fontSize: 14,
                      color: active ? accent : c.ink,
                    }}
                  >
                    {option.name}
                  </Text>
                  {active ? <Feather name="check" size={13} color={accent} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── BACKGROUND PATTERN ───────────────────────────────────────────── */}
        <View style={{ gap: 12 }}>
          <SectionLabel>Background pattern</SectionLabel>
          <View style={{ gap: 9 }}>
            {SITE_BACKGROUNDS.map((option) => {
              const active = option.id === backgroundId;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setBackgroundId(option.id);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: 16,
                    backgroundColor: c.panel,
                    borderWidth: 1.5,
                    borderColor: active ? accent : c.border,
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontFamily: fonts.sans700, fontSize: 13.5, color: c.ink }}>
                      {option.label}
                    </Text>
                    <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.muted }}>
                      {option.description}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: active ? accent : c.deep,
                    }}
                  >
                    {active ? <Feather name="check" size={12} color="#fff" /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── PUBLISH CTA BAR ──────────────────────────────────────────────── */}
        <Pressable
          onPress={publish}
          disabled={updateProfile.isPending}
          style={{
            minHeight: 54,
            borderRadius: 999,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            backgroundColor: hasUnsavedChanges ? accent : c.cta,
            shadowColor: hasUnsavedChanges ? accent : "#000",
            shadowOpacity: hasUnsavedChanges ? 0.4 : 0.25,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          }}
        >
          {updateProfile.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Feather name="upload-cloud" size={18} color="#fff" />
          )}
          <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: "#fff" }}>
            {updateProfile.isPending
              ? "Publishing portfolio…"
              : hasUnsavedChanges
                ? `Publish changes to ${handle ?? "site"}`
                : `Published · ${handle ? `${handle}.atbexo.com` : "Live"}`}
          </Text>
        </Pressable>
      </ScrollView>
      </View>

      {/* ── FLOATING QUICK-ACCESS BUTTON — jump back to the pinned preview,
          re-expanding it first if it's been collapsed for more editing room ── */}
      <Pressable
        onPress={revealPreview}
        accessibilityLabel="Back to live preview"
        hitSlop={6}
        style={{
          position: "absolute",
          left: 20,
          bottom: Math.max(insets.bottom, 12) + 78,
          width: 52,
          height: 52,
          borderRadius: 26,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: accent,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.25)",
          shadowColor: accent,
          shadowOpacity: 0.45,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
          zIndex: 99,
        }}
      >
        <Feather name={previewCollapsed ? "eye" : "settings"} size={20} color="#fff" />
      </Pressable>

      {/* ── FULL-SCREEN INTERACTIVE PREVIEW MODAL ─────────────────────────── */}
      <Modal
        visible={fullScreenOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setFullScreenOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: template.dark ? "#090B10" : "#E3E3DB" }}>
          {/* Modal Header Bar */}
          <View
            style={{
              paddingTop: Math.max(insets.top, 14),
              paddingHorizontal: 16,
              paddingBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottomWidth: 1,
              borderBottomColor: template.dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
              backgroundColor: template.dark ? "rgba(10,13,20,0.92)" : "rgba(235,232,223,0.92)",
            }}
          >
            <Pressable
              onPress={() => setFullScreenOpen(false)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: template.dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)",
              }}
            >
              <Feather name="x" size={18} color={template.dark ? "#fff" : "#111"} />
            </Pressable>

            <View style={{ alignItems: "center", gap: 2 }}>
              <Text
                style={{
                  fontFamily: fonts.sans700,
                  fontSize: 13,
                  color: template.dark ? "#fff" : "#111",
                }}
              >
                {template.name}
              </Text>
              <Text style={{ fontFamily: fonts.mono500, fontSize: 11, color: c.muted }}>
                {site ?? "atbexo.com"}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              {site ? (
                <Pressable
                  onPress={openLiveInBrowser}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: template.dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)",
                  }}
                >
                  <Feather name="external-link" size={16} color={template.dark ? "#fff" : "#111"} />
                </Pressable>
              ) : (
                <View style={{ width: 36 }} />
              )}
            </View>
          </View>

          {/* Full-screen website scrollable view */}
          <ScrollView
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 40 }}
            showsVerticalScrollIndicator={false}
          >
            <NativeWebsitePreview
              data={data}
              templateId={templateId}
              colorId={colorId}
              accent={accent}
              siteFont={siteFont}
              backgroundId={backgroundId}
              site={site}
              isFullScreen
            />
          </ScrollView>
        </View>
      </Modal>
    </Screen>
  );
}

/** Quick action circle icon button */
function CircleBtn({
  icon,
  onPress,
  label,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress?: () => void;
  label: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: c.panel,
        borderWidth: 1,
        borderColor: c.border,
      }}
    >
      <Feather name={icon} size={15} color={c.muted} />
    </Pressable>
  );
}
