import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Screen } from "@/components/Screen";
import { SectionLabel } from "@/components/ui/Controls";
import { Press, useBreathe, usePopOnChange } from "@/components/ui/Press";
import { Reveal, ScrollStage, useScrollProgress, useStage } from "@/components/ui/ScrollStage";
import { LoadingBlock, Orbit } from "@/components/ui/Loaders";
import { LightSweep } from "@/components/ui/Effects";
import { Celebration } from "@/components/ui/Celebration";
import { feel } from "@/lib/haptics";
import { templateAccent, templateDesign } from "@/lib/template-design";
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
  const [justPublished, setJustPublished] = useState(false);
  /** Measured once so the title can collapse to exactly its own height. */
  const [titleHeight, setTitleHeight] = useState(58);
  const collapseProgress = useSharedValue(0);
  const scrollRef = useRef<Animated.ScrollView>(null);

  /**
   * The customization panel's scroll offset, owned here rather than inside the
   * stage so the pinned header above it can condense against the same value.
   */
  const stage = useStage();
  const condense = useScrollProgress(96, stage);

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
  /**
   * Two different accents, and the distinction matters.
   *
   * `swatchAccent` is the platform's own colour — what the picker dot, the
   * publish button and the app's chrome are painted with.
   *
   * `siteAccent` is what the chosen template will *actually* render for that
   * id, re-tuned for its own canvas (Navy is a bright #7AA2F7 on Cura
   * Futuri's near-black and a deep #375A96 on Nico Palmer's cream). The
   * preview must use this one, or it promises a colour the published site
   * will never show.
   */
  const swatchAccent = useMemo(
    () => SITE_COLORS.find((opt) => opt.id === colorId)?.hex ?? SITE_COLORS[0].hex,
    [colorId],
  );
  const siteAccent = useMemo(() => templateAccent(templateId, colorId), [templateId, colorId]);
  /** Canvas, hairlines and type colours of the layout being previewed. */
  const siteDesign = useMemo(() => templateDesign(templateId), [templateId]);
  const accent = swatchAccent;
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
      feel.warn();
      toast("Claim a handle first from the onboarding wizard");
      return;
    }
    // The wind-up half of the publish score plays on touch, so the phone is
    // already moving while the request is in flight.
    feel.publish();
    updateProfile.mutate(
      { templateId, themeColor: colorId, themeBg: backgroundId },
      {
        onSuccess: () => {
          feel.celebrate();
          setJustPublished(true);
          toast(`Published live to ${handle}.atbexo.com`);
          setWebViewKey((k) => k + 1);
        },
        onError: (err) => {
          feel.error();
          toast(err.message || "Failed to publish changes");
        },
      },
    );
  }, [handle, templateId, colorId, backgroundId, updateProfile, toast]);

  // The success state is a beat, not a mode — it hands the button back after
  // the confirmation has been read.
  useEffect(() => {
    if (!justPublished) return;
    const id = setTimeout(() => setJustPublished(false), 2200);
    return () => clearTimeout(id);
  }, [justPublished]);

  const openLiveInBrowser = useCallback(async () => {
    if (!site) {
      feel.warn();
      toast("No live site published yet");
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(`https://${site}`);
    } catch {
      toast("Could not open browser");
    }
  }, [site, toast]);

  const copyLiveLink = useCallback(() => {
    if (!site) return;
    Clipboard.setStringAsync(`https://${site}`);
    feel.success();
    toast("Link copied to clipboard");
  }, [site, toast]);

  const shareLiveSite = useCallback(async () => {
    if (!site) return;
    try {
      await Share.share({
        title: `${data?.user?.name ?? "Portfolio"} on BEXO`,
        message: `Check out my portfolio: https://${site}`,
        url: `https://${site}`,
      });
    } catch {}
  }, [site, data?.user?.name]);

  const viewportHeight = Math.min(Math.max(windowWidth * 0.92, 340), 420);

  /**
   * Scrolling the customization panel shrinks the preview to an informative
   * peek of the portfolio's actual content (name, avatar photo, headline)
   * rather than wasting the peek on the site's top header/nav bar.
   */
  const PEEK = 128;
  const shrink = useScrollProgress(190, stage);

  const viewportAnimatedStyle = useAnimatedStyle(() => {
    const scrolled = interpolate(shrink.value, [0, 1], [viewportHeight, PEEK]);
    // The manual toggle multiplies whatever the scroll has already done, so
    // the two controls compose instead of fighting.
    return {
      height: Math.max(scrolled * (1 - collapseProgress.value), 0),
      opacity: 1 - collapseProgress.value,
    };
  });

  /**
   * As the frame closes, we translate the content upward past the top navbar
   * (which only contains the brand wordmark/hamburger) so that the prominent
   * hero content — the user's name, portrait photo, and headline — becomes
   * the focal point of the peek preview.
   */
  const previewContentStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(shrink.value, [0, 1], [0, -70]) },
      { scale: interpolate(shrink.value, [0, 1], [1, 0.86]) },
    ],
  }));

  /** The caption strip under the frame is the first thing to go. */
  const previewFooterStyle = useAnimatedStyle(() => ({
    height: interpolate(shrink.value, [0, 0.5], [22, 0], "clamp"),
    opacity: interpolate(shrink.value, [0, 0.35], [1, 0], "clamp"),
  }));

  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${collapseProgress.value * 180}deg` }],
  }));

  /**
   * Everything the pinned zone gives back once it is fully condensed: the
   * title, the caption strip, and the preview above its peek height.
   *
   * The scroller grows by exactly this much, which is why the same number is
   * added as bottom padding below. Without it the collapse eats its own
   * scroll distance — the content bottom rises to meet the taller viewport,
   * the offset clamps, the header expands again, and the whole thing
   * oscillates for the last screen of the page. With it, the spacer is
   * consumed precisely as the header closes, so the publish button still
   * lands flush at the bottom and nothing empty is ever on screen.
   */
  const reclaimedSpace = viewportHeight - PEEK + titleHeight + 22;

  /**
   * Mirrored to JS so the chrome bar knows which gesture it should offer:
   * once shrunk, tapping it should restore the preview, not collapse it
   * further into nothing.
   */
  const [isShrunk, setIsShrunk] = useState(false);
  useAnimatedReaction(
    () => shrink.value > 0.55,
    (small, was) => {
      if (small !== was) runOnJS(setIsShrunk)(small);
    },
  );

  /**
   * The screen title folds away over the first 96pt of scroll, handing its
   * space to the preview. Height, opacity and the container's own gap all
   * collapse together, so the pinned zone closes up rather than leaving a hole.
   */
  const titleAnimatedStyle = useAnimatedStyle(() => ({
    height: interpolate(condense.value, [0, 1], [titleHeight, 0]),
    marginBottom: interpolate(condense.value, [0, 1], [0, -14]),
    opacity: interpolate(condense.value, [0, 0.55], [1, 0], "clamp"),
    transform: [{ translateY: -condense.value * 8 }],
  }));

  /** The pinned zone earns its separator only once content is beneath it. */
  const pinnedChromeStyle = useAnimatedStyle(() => ({
    borderBottomColor: `rgba(${dark ? "255,255,255" : "22,23,27"},${0.02 + condense.value * 0.1})`,
    shadowOpacity: condense.value * (dark ? 0.5 : 0.14),
  }));

  /** A hairline of parallax: the frame settles as the panel slides under it. */
  const previewFrameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - condense.value * 0.012 }],
  }));

  const unsavedDotStyle = useBreathe(hasUnsavedChanges);
  const liveDotStyle = useBreathe(!!site, 0.22, 1800);
  const publishPop = usePopOnChange(justPublished);
  const templatePop = usePopOnChange(templateId);

  /**
   * Swipe the preview sideways to try the next layout. Faster than reaching
   * for the list below, and it makes the three templates feel like one deck
   * rather than three rows of a form.
   */
  const swipeTemplate = useCallback(
    (direction: 1 | -1) => {
      const at = SITE_TEMPLATES.findIndex((t) => t.id === templateId);
      const next = SITE_TEMPLATES[(at + direction + SITE_TEMPLATES.length) % SITE_TEMPLATES.length];
      feel.snap();
      setTemplateId(next.id);
    },
    [templateId],
  );

  const dragX = useSharedValue(0);

  const swipe = useMemo(
    () =>
      Gesture.Pan()
        // Horizontal intent only: the preview's own vertical scroll must win,
        // or the page becomes impossible to read.
        .activeOffsetX([-16, 16])
        .failOffsetY([-14, 14])
        .onUpdate((e) => {
          // Rubber band — the card follows, but never all the way.
          dragX.value = e.translationX * 0.34;
        })
        .onEnd((e) => {
          const far = Math.abs(e.translationX) > 62 || Math.abs(e.velocityX) > 700;
          if (far) runOnJS(swipeTemplate)(e.translationX < 0 ? 1 : -1);
          dragX.value = withSpring(0, { damping: 16, stiffness: 190, mass: 0.7 });
        }),
    [dragX, swipeTemplate],
  );

  const dragStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value },
      { rotateZ: `${dragX.value * 0.02}deg` },
    ],
  }));

  const togglePreview = useCallback(() => {
    // Shrunk by scrolling? The obvious intent of tapping it is "give it back",
    // not "collapse it the rest of the way".
    if (isShrunk) {
      feel.reveal();
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setPreviewCollapsed((wasCollapsed) => {
      if (wasCollapsed) feel.reveal();
      else feel.dismiss();
      return !wasCollapsed;
    });
  }, [isShrunk]);

  const revealPreview = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    if (previewCollapsed) {
      feel.reveal();
      setPreviewCollapsed(false);
    } else {
      feel.snap();
    }
  }, [previewCollapsed]);

  return (
    <Screen style={{ paddingHorizontal: 0 }} edges={["top"]}>
      <View style={{ flex: 1 }}>
        {/* ── PINNED ZONE — header, domain pill & live preview never scroll away ── */}
        <Animated.View
          style={[
            {
              paddingHorizontal: layout.screenX,
              paddingTop: 16,
              paddingBottom: 14,
              gap: 14,
              backgroundColor: c.paper,
              borderBottomWidth: 1,
              zIndex: 2,
              shadowColor: "#000",
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 8 },
              elevation: 6,
            },
            pinnedChromeStyle,
          ]}
        >
          {/* Header section with live domain pill and quick actions */}
          <View style={{ gap: 14 }}>
            <Animated.View style={[{ overflow: "hidden" }, titleAnimatedStyle]}>
              <View
                onLayout={(e) => {
                  const h = Math.round(e.nativeEvent.layout.height);
                  if (h > 0 && h !== titleHeight) setTitleHeight(h);
                }}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              >
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
            </Animated.View>

            {/* Subdomain pill banner */}
            <Press
              onPress={copyLiveLink}
              haptic={false}
              weight="card"
              accessibilityLabel="Copy live site link"
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
                <Animated.View
                  style={[
                    {
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: site ? c.success : c.faint,
                    },
                    liveDotStyle,
                  ]}
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
            </Press>
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

            <Animated.View
              style={[
                {
                  borderRadius: 22,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
                  backgroundColor: siteDesign.canvas,
                  shadowColor: "#000",
                  shadowOpacity: dark ? 0.6 : 0.16,
                  shadowRadius: 26,
                  shadowOffset: { width: 0, height: 12 },
                  elevation: 10,
                },
                previewFrameStyle,
              ]}
            >
              {/* macOS Chrome Header Bar */}
              <Pressable
                onPress={togglePreview}
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
                      feel.snap();
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
                      feel.reveal();
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

              {/* Viewport Content — swipe sideways to deal the next layout */}
              <GestureDetector gesture={swipe}>
              <Animated.View style={[{ overflow: "hidden" }, viewportAnimatedStyle, dragStyle]}>
              <Animated.View
                style={[
                  { height: viewportHeight, transformOrigin: "top center" },
                  previewContentStyle,
                ]}
              >
              {viewMode === "live" && Platform.OS !== "web" ? (
                <View style={{ flex: 1, backgroundColor: siteDesign.canvas }}>
                  <WebView
                    key={webViewKey}
                    source={{ uri: livePreviewUrl }}
                    style={{ flex: 1, backgroundColor: siteDesign.canvas }}
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
                      <LoadingBlock label="Loading live bundle" tint={accent} />
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
                          backgroundColor: siteDesign.canvas,
                          gap: 12,
                        },
                      ]}
                    >
                      <Feather name="wifi-off" size={24} color={c.faint} />
                      <Text style={{ fontFamily: fonts.sans600, fontSize: 13, color: c.ink, textAlign: "center" }}>
                        Live preview server offline
                      </Text>
                      <Press
                        onPress={() => setViewMode("studio")}
                        haptic="commit"
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
                      </Press>
                    </View>
                  ) : null}
                </View>
              ) : (
                /* Native interactive studio renderer */
                <NativeWebsitePreview
                  data={data}
                  templateId={templateId}
                  colorId={colorId}
                  accent={siteAccent}
                  siteFont={siteFont}
                  backgroundId={backgroundId}
                  site={site}
                  onOpenFull={() => setFullScreenOpen(true)}
                />
              )}
              </Animated.View>
              </Animated.View>
              </GestureDetector>
            </Animated.View>

            {/* The publish payoff, thrown from the middle of the preview it just
                changed. Deliberately outside the frame, which clips its own
                overflow — confetti cut off at a border reads as a rendering
                bug rather than a flourish. */}
            <Celebration play={justPublished} tint={accent} originY={0.45} />

          {!previewCollapsed ? (
            <Animated.View
              style={[
                { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, gap: 10, overflow: "hidden" },
                previewFooterStyle,
              ]}
            >
              <TemplateDots
                total={SITE_TEMPLATES.length}
                activeIndex={SITE_TEMPLATES.findIndex((t) => t.id === templateId)}
                accent={accent}
              />
              <Text numberOfLines={1} style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint, flex: 1 }}>
                Swipe the preview to switch layouts
              </Text>
              {hasUnsavedChanges ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Animated.View
                    style={[
                      { width: 6, height: 6, borderRadius: 3, backgroundColor: "#F59E0B" },
                      unsavedDotStyle,
                    ]}
                  />
                  <Text style={{ fontFamily: fonts.sans600, fontSize: 11, color: "#F59E0B" }}>
                    Unsaved tweaks
                  </Text>
                </View>
              ) : null}
            </Animated.View>
          ) : null}
          </View>
        </Animated.View>

        {/* ── SCROLLABLE ZONE — template, colours, type & background live below the pinned preview ── */}
        <ScrollStage
          ref={scrollRef}
          stage={stage}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: layout.screenX,
            paddingTop: 18,
            paddingBottom: layout.navBarSpace + 60 + reclaimedSpace,
            gap: 22,
          }}
          showsVerticalScrollIndicator={false}
        >
        {/* ── PAGE TEMPLATE SELECTOR (Faithful to Image 1) ─────────────────── */}
        <Reveal index={0}>
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
                <Press
                  key={option.id}
                  weight="card"
                  haptic="pop"
                  accessibilityLabel={`Use the ${option.name} template`}
                  accessibilityState={{ selected: active }}
                  onPress={() => setTemplateId(option.id)}
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
                    // The chosen layout lifts off the card behind it.
                    shadowColor: "#6366F1",
                    shadowOpacity: active ? 0.22 : 0,
                    shadowRadius: 14,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: active ? 4 : 0,
                  }}
                >
                  {/* Miniature Browser Mockup — the live one gets the pop */}
                  <Animated.View style={active ? templatePop : undefined}>
                    <TemplateThumbnail
                      templateId={option.id}
                      userName={data?.user?.name || "Kavin Balaji"}
                      photoUrl={data?.user?.photoUrl}
                      accent={templateAccent(option.id, colorId)}
                      width={92}
                      height={64}
                    />
                  </Animated.View>

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

                    {/* What this layout will actually paint: its canvas, and
                        the two typefaces the template licenses. */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                      <View
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 2.5,
                          backgroundColor: templateDesign(option.id).canvas,
                          borderWidth: 1,
                          borderColor: c.border,
                        }}
                      />
                      <View
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 2.5,
                          backgroundColor: templateAccent(option.id, colorId),
                        }}
                      />
                      <Text
                        numberOfLines={1}
                        style={{ fontFamily: fonts.mono500, fontSize: 9, color: c.faint, flex: 1 }}
                      >
                        {templateDesign(option.id).typefaces.display} ·{" "}
                        {templateDesign(option.id).typefaces.body}
                      </Text>
                    </View>

                    {/* DEMO Action link */}
                    <Press
                      haptic="lift"
                      weight="control"
                      onPress={() => {
                        setTemplateId(option.id);
                        setFullScreenOpen(true);
                      }}
                      hitSlop={6}
                      style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2, alignSelf: "flex-start" }}
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
                    </Press>
                  </View>

                  {/* Active Indicator Checkmark */}
                  <SelectDot active={active} color="#6366F1" />
                </Press>
              );
            })}
          </View>

          {/* Open Live Portfolio button matching Image 1 */}
          <Press
            onPress={openLiveInBrowser}
            haptic="lift"
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
          </Press>
        </View>
        </Reveal>

        {/* ── ACCENT COLOUR ────────────────────────────────────────────────── */}
        <Reveal index={1} style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
            <SectionLabel>Accent colour</SectionLabel>
            <Text style={{ fontFamily: fonts.sans500, fontSize: 12, color: c.faint }}>
              {SITE_COLORS.find((o) => o.id === colorId)?.label} · as {template.name} paints it
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 14 }}>
            {SITE_COLORS.map((option) => (
              <Swatch
                key={option.id}
                // The dot shows the colour this template will actually render,
                // which shifts between layouts — Navy is bright on Cura's
                // near-black and deep on Nico's cream.
                hex={templateAccent(templateId, option.id)}
                label={option.label}
                active={option.id === colorId}
                onPress={() => setColorId(option.id)}
              />
            ))}
          </View>
        </Reveal>

        {/* ── TYPEFACE ─────────────────────────────────────────────────────── */}
        <Reveal index={2} haptic style={{ gap: 12 }}>
          <View style={{ gap: 3 }}>
            <SectionLabel>Preview typeface</SectionLabel>
            {/* Honest labelling: this control is not published. `publish()`
                sends templateId/themeColor/themeBg only — there is no
                themeFont on the profile update — and each template ships its
                own licensed faces ({template.name} uses{" "}
                {siteDesign.typefaces.display}). So this restyles the preview
                and nothing else. */}
            <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}>
              {template.name} publishes in {siteDesign.typefaces.display} ·{" "}
              {siteDesign.typefaces.body}. This only restyles the preview here.
            </Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {SITE_FONT_IDS.map((option) => {
              const active = option.id === fontId;
              return (
                <Press
                  key={option.id}
                  haptic="select"
                  accessibilityState={{ selected: active }}
                  restScale={active ? 1.04 : 1}
                  onPress={() => setFontId(option.id)}
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
                </Press>
              );
            })}
          </View>
        </Reveal>

        {/* ── BACKGROUND PATTERN ───────────────────────────────────────────── */}
        <Reveal index={3} haptic style={{ gap: 12 }}>
          <SectionLabel>Background pattern</SectionLabel>
          <View style={{ gap: 9 }}>
            {SITE_BACKGROUNDS.map((option) => {
              const active = option.id === backgroundId;
              return (
                <Press
                  key={option.id}
                  weight="card"
                  haptic="pop"
                  accessibilityState={{ selected: active }}
                  onPress={() => setBackgroundId(option.id)}
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
                  <SelectDot active={active} color={accent} idleFilled />
                </Press>
              );
            })}
          </View>
        </Reveal>

        {/* ── PUBLISH CTA BAR ──────────────────────────────────────────────── */}
        <Reveal index={4}>
          <Animated.View style={publishPop}>
            <Press
              onPress={publish}
              haptic={false}
              weight="control"
              disabled={updateProfile.isPending}
              accessibilityLabel={
                hasUnsavedChanges ? "Publish changes" : "Portfolio is published"
              }
              style={{
                minHeight: 54,
                borderRadius: 999,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                overflow: "hidden",
                backgroundColor: justPublished
                  ? c.success
                  : hasUnsavedChanges
                    ? accent
                    : c.cta,
                shadowColor: justPublished ? c.success : hasUnsavedChanges ? accent : "#000",
                shadowOpacity: hasUnsavedChanges || justPublished ? 0.4 : 0.25,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 8 },
                elevation: 8,
              }}
            >
              {/* A gleam crosses the button only while there is something to
                  publish — the one moment the eye should be drawn here. */}
              {hasUnsavedChanges && !updateProfile.isPending && !justPublished ? (
                <LightSweep width={windowWidth} height={54} delay={900} duration={2100} opacity={0.22} />
              ) : null}

              {updateProfile.isPending ? (
                <Orbit size={19} color="#fff" thickness={2} />
              ) : (
                <Feather
                  name={justPublished ? "check-circle" : hasUnsavedChanges ? "upload-cloud" : "globe"}
                  size={18}
                  color="#fff"
                />
              )}
              <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: "#fff" }}>
                {updateProfile.isPending
                  ? "Publishing portfolio…"
                  : justPublished
                    ? "Live — changes are up"
                    : hasUnsavedChanges
                      ? `Publish changes to ${handle ?? "site"}`
                      : `Published · ${handle ? `${handle}.atbexo.com` : "Live"}`}
              </Text>
            </Press>
          </Animated.View>
        </Reveal>
        </ScrollStage>
      </View>

      {/* ── FLOATING QUICK-ACCESS BUTTON — jump back to the pinned preview,
          re-expanding it first if it's been collapsed for more editing room ── */}
      <Press
        onPress={revealPreview}
        haptic={false}
        weight="icon"
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
      </Press>

      {/* ── FULL-SCREEN INTERACTIVE PREVIEW MODAL ─────────────────────────── */}
      <Modal
        visible={fullScreenOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setFullScreenOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: siteDesign.canvas }}>
          {/* Modal header — floats over the page as real frosted glass, so the
              site keeps running underneath instead of being cropped by a bar. */}
          <BlurView
            intensity={Platform.OS === "android" ? 40 : 60}
            tint={template.dark ? "dark" : "light"}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 10,
              paddingTop: Math.max(insets.top, 14),
              paddingHorizontal: 16,
              paddingBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottomWidth: 1,
              borderBottomColor: template.dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
              // Android's blur is weaker; a wash keeps the text legible there.
              backgroundColor:
                Platform.OS === "android"
                  ? template.dark
                    ? "rgba(10,13,20,0.72)"
                    : "rgba(235,232,223,0.72)"
                  : "transparent",
            }}
          >
            <Press
              onPress={() => {
                feel.dismiss();
                setFullScreenOpen(false);
              }}
              haptic={false}
              weight="icon"
              accessibilityLabel="Close preview"
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
            </Press>

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
                <Press
                  onPress={openLiveInBrowser}
                  haptic="lift"
                  weight="icon"
                  accessibilityLabel="Open live site"
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
                </Press>
              ) : (
                <View style={{ width: 36 }} />
              )}
            </View>
          </BlurView>

          {/* Full-screen website scrollable view */}
          <ScrollView
            contentContainerStyle={{
              paddingTop: Math.max(insets.top, 14) + 60,
              paddingBottom: Math.max(insets.bottom, 24) + 40,
            }}
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
    <Press
      accessibilityLabel={label}
      onPress={onPress}
      haptic="lift"
      weight="icon"
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
    </Press>
  );
}

/**
 * The deck indicator under the preview: three dots, the live one stretched
 * into a pill. It exists to make the swipe discoverable — a static hint line
 * tells you it's possible, a moving indicator shows you it worked.
 */
function TemplateDots({
  total,
  activeIndex,
  accent,
}: {
  total: number;
  activeIndex: number;
  accent: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      {Array.from({ length: total }).map((_, i) => (
        <Dot key={i} active={i === activeIndex} accent={accent} />
      ))}
    </View>
  );
}

function Dot({ active, accent }: { active: boolean; accent: string }) {
  const { c } = useTheme();
  const p = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    p.value = withSpring(active ? 1 : 0, { damping: 15, stiffness: 220, mass: 0.6 });
  }, [active, p]);

  const animated = useAnimatedStyle(() => ({
    width: interpolate(p.value, [0, 1], [5, 16]),
    backgroundColor: interpolateColor(p.value, [0, 1], [c.whisper, accent]),
  }));

  return <Animated.View style={[{ height: 5, borderRadius: 3 }, animated]} />;
}

/**
 * An accent swatch. The chosen one sits proudly forward — a spring-driven
 * scale rather than a static transform, so switching colours reads as the new
 * one stepping up and the old one stepping back.
 */
function Swatch({
  hex,
  label,
  active,
  onPress,
}: {
  hex: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const pop = usePopOnChange(active ? hex : null, 0.22);

  return (
    <Press
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      haptic="pop"
      weight="icon"
      restScale={active ? 1.08 : 1}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        padding: 3,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2.5,
        borderColor: active ? hex : "transparent",
      }}
    >
      <Animated.View
        style={[
          {
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: hex,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: hex,
            shadowOpacity: active ? 0.6 : 0.2,
            shadowRadius: active ? 10 : 3,
            shadowOffset: { width: 0, height: 2 },
          },
          active ? pop : undefined,
        ]}
      >
        {active ? <Feather name="check" size={14} color="#fff" /> : null}
      </Animated.View>
    </Press>
  );
}

/**
 * The selection dot. The tick does not simply appear — it springs in from
 * nothing while the disc fills, which is what makes a choice feel *made*
 * rather than merely recorded.
 */
function SelectDot({
  active,
  color,
  idleFilled = false,
}: {
  active: boolean;
  color: string;
  idleFilled?: boolean;
}) {
  const { c } = useTheme();
  const p = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    p.value = active
      ? withSpring(1, { damping: 11, stiffness: 260, mass: 0.5 })
      : withTiming(0, { duration: 160, easing: ease.soft });
  }, [active, p]);

  const idleFill = idleFilled ? c.deep : "transparent";
  const disc = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], [idleFill, color]),
    borderColor: c.border,
    borderWidth: interpolate(p.value, [0, 1], [1.5, 0]),
    transform: [{ scale: interpolate(p.value, [0, 1], [0.9, 1]) }],
  }));

  const tick = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ scale: p.value }, { rotate: `${interpolate(p.value, [0, 1], [-35, 0])}deg` }],
  }));

  return (
    <Animated.View
      style={[
        { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
        disc,
      ]}
    >
      <Animated.View style={tick}>
        <Feather name="check" size={12.5} color="#fff" />
      </Animated.View>
    </Animated.View>
  );
}
