import { useEffect, useState } from "react";
import { Rise } from "@/components/ui/Motion";
import { Image, Pressable, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Screen } from "@/components/Screen";
import { Body, Display, DisplayAccent, Eyebrow } from "@/components/ui/Typography";
import { SceneArt } from "@/components/onboarding/SceneArt";
import { SLIDES } from "@/lib/slides";
import { brand } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";

/** Matches the design canvas's `introTimer` (6.2s per slide, `bxFillBar`). */
const SLIDE_MS = 6200;

/** Dynamic ambient lighting colors corresponding to each slide's theme */
const SLIDE_AURAS: [string, string][] = [
  ["rgba(47,107,255,0.24)", "rgba(47,107,255,0)"],
  ["rgba(16,185,129,0.20)", "rgba(16,185,129,0)"],
  ["rgba(139,92,246,0.22)", "rgba(139,92,246,0)"],
  ["rgba(6,182,212,0.22)", "rgba(6,182,212,0)"],
];

const CHIP_ICONS: (keyof typeof Feather.glyphMap)[][] = [
  ["globe", "layers", "zap"],
  ["search", "eye", "inbox"],
  ["cpu", "camera", "edit-3"],
  ["share-2", "users", "external-link"],
];

export default function Onboarding() {
  const { c } = useTheme();
  const [index, setIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;
  const isFirst = index === 0;
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (!autoplay) return;
    const timer = setTimeout(() => {
      setIndex((i) => (i >= SLIDES.length - 1 ? 0 : i + 1));
    }, SLIDE_MS);
    return () => clearTimeout(timer);
  }, [index, autoplay]);

  const stopAutoplay = () => setAutoplay(false);

  const advance = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    stopAutoplay();
    if (isLast) router.push("/(auth)/phone");
    else setIndex((i) => i + 1);
  };

  const goPhone = () => {
    stopAutoplay();
    router.push("/(auth)/phone");
  };

  const goBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopAutoplay();
    setIndex((i) => Math.max(0, i - 1));
  };

  // Drag-follow offset for the swipe gesture below.
  const dragX = useSharedValue(0);
  const DISTANCE_THRESHOLD = width * 0.22;
  const VELOCITY_THRESHOLD = 700;
  const gestureConsumed = useSharedValue(false);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onStart(() => {
      gestureConsumed.value = false;
    })
    .onUpdate((e) => {
      const atStartEdge = isFirst && e.translationX > 0;
      const atEndEdge = isLast && e.translationX < 0;
      dragX.value = atStartEdge || atEndEdge ? e.translationX * 0.32 : e.translationX;
    })
    .onEnd((e) => {
      if (gestureConsumed.value) return;
      const goingNext = e.translationX < 0;
      const pastThreshold =
        Math.abs(e.translationX) > DISTANCE_THRESHOLD || Math.abs(e.velocityX) > VELOCITY_THRESHOLD;

      if (pastThreshold && goingNext) {
        gestureConsumed.value = true;
        runOnJS(advance)();
      } else if (pastThreshold && !goingNext && !isFirst) {
        gestureConsumed.value = true;
        runOnJS(goBack)();
      }
      dragX.value = withSpring(0, { damping: 22, stiffness: 260, mass: 0.7 });
    });

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }],
    opacity: interpolate(Math.abs(dragX.value), [0, 140], [1, 0.92], "clamp"),
  }));

  const currentAura = SLIDE_AURAS[index] || SLIDE_AURAS[0];
  const currentIcons = CHIP_ICONS[index] || CHIP_ICONS[0];

  return (
    <Screen style={{ paddingHorizontal: 0 }} edges={["bottom"]}>
      {/* Dynamic ambient bloom behind the header matching active slide */}
      <LinearGradient
        key={`aura-${index}`}
        colors={currentAura}
        style={{ position: "absolute", left: 0, right: 0, top: 0, height: 360 }}
      />

      <View style={{ flex: 1, paddingTop: 60 }}>
        {/* Top Header Bar */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 22,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <Image
              source={require("../../assets/brand/bexo-logo.png")}
              style={{ width: 24, height: 24 }}
              resizeMode="contain"
            />
            <Text
              style={{
                fontFamily: fonts.sans700,
                fontSize: 11,
                letterSpacing: 3.6,
                color: c.ink,
              }}
            >
              BEXO
            </Text>
          </View>
          <Pressable onPress={goPhone} hitSlop={8} style={{ padding: 8 }}>
            <Text style={{ fontFamily: fonts.sans500, fontSize: 13, color: c.muted }}>Skip</Text>
          </Pressable>
        </View>

        {/* Chapter counter: "01 / 04" */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            gap: 10,
            paddingHorizontal: 26,
            paddingTop: 16,
          }}
        >
          <Text style={{ fontFamily: fonts.serif600Italic, fontSize: 26, color: c.ink }}>
            0{index + 1}
          </Text>
          <Text style={{ fontFamily: fonts.mono500, fontSize: 12, color: c.faint }}>
            / 0{SLIDES.length}
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: c.border, marginLeft: 6 }} />
        </View>

        <GestureDetector gesture={swipeGesture}>
          <Animated.View style={[{ flex: 1, minHeight: 0 }, dragStyle]}>
            <View style={{ flex: 1, minHeight: 0 }}>
              <SceneArt index={index} />
            </View>

            <View style={{ paddingHorizontal: 26, paddingTop: 6, gap: 10 }}>
              <Rise key={`eyebrow-${index}`} duration={500}>
                <Eyebrow>{slide.eyebrow}</Eyebrow>
              </Rise>
              <Rise key={`title-${index}`} delay={50} duration={620}>
                <Display>
                  {slide.title}
                  {"\n"}
                  <DisplayAccent>{slide.highlight}</DisplayAccent>
                </Display>
              </Rise>
              <Rise key={`body-${index}`} delay={140} duration={620}>
                <Body style={{ fontSize: 14, lineHeight: 21, maxWidth: 320 }}>{slide.body}</Body>
              </Rise>

              {/* Satisfying Slide Feature Highlight Chips */}
              {slide.chips && slide.chips.length > 0 && (
                <Rise key={`chips-${index}`} delay={220} duration={600}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 4 }}>
                    {slide.chips.map((chip, idx) => (
                      <View
                        key={idx}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 5.5,
                          paddingHorizontal: 11,
                          paddingVertical: 5.5,
                          borderRadius: 999,
                          backgroundColor: c.panel,
                          borderWidth: 1,
                          borderColor: c.border,
                          shadowColor: "#000",
                          shadowOpacity: 0.05,
                          shadowRadius: 6,
                          elevation: 2,
                        }}
                      >
                        <Feather
                          name={currentIcons[idx] || "check"}
                          size={11.5}
                          color={c.accent}
                        />
                        <Text
                          style={{
                            fontFamily: fonts.sans500,
                            fontSize: 11.5,
                            color: c.ink,
                          }}
                        >
                          {chip}
                        </Text>
                      </View>
                    ))}
                  </View>
                </Rise>
              )}
            </View>
          </Animated.View>
        </GestureDetector>

        {/* Bottom Bar: "Have a BEXO?", Progress Bars, and Expandable CTA */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            paddingHorizontal: 26,
            paddingTop: 12,
            paddingBottom: 24,
          }}
        >
          <Pressable onPress={goPhone} hitSlop={8}>
            <Text style={{ fontFamily: fonts.sans500, fontSize: 13, color: c.muted }}>
              Have a BEXO?
            </Text>
          </Pressable>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            {/* Story Progress Bars */}
            <View style={{ flexDirection: "row", gap: 6 }}>
              {SLIDES.map((_, i) => (
                <Pressable
                  key={i}
                  onPress={() => {
                    Haptics.selectionAsync();
                    stopAutoplay();
                    setIndex(i);
                  }}
                  hitSlop={10}
                  style={{
                    width: i === index ? 40 : 20,
                    height: 4,
                    borderRadius: 3,
                    overflow: "hidden",
                    backgroundColor: c.whisper,
                  }}
                >
                  <ProgressFill
                    state={i < index ? "done" : i === index ? "active" : "pending"}
                    autoplay={autoplay}
                  />
                </Pressable>
              ))}
            </View>

            {/* Satisfying Action Button: Smoothly expands on the last slide */}
            <Pressable
              onPress={advance}
              accessibilityRole="button"
              accessibilityLabel={isLast ? "Create my BEXO" : "Next"}
              style={{
                flexDirection: "row",
                height: 54,
                paddingHorizontal: isLast ? 20 : 0,
                width: isLast ? undefined : 54,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: brand.accent,
                shadowColor: brand.accent,
                shadowOpacity: 0.75,
                shadowRadius: 28,
                shadowOffset: { width: 0, height: 12 },
                elevation: 10,
                gap: 8,
              }}
            >
              {isLast ? (
                <Text
                  style={{
                    fontFamily: fonts.sans700,
                    fontSize: 14,
                    color: "#fff",
                    letterSpacing: 0.2,
                  }}
                >
                  Create my BEXO
                </Text>
              ) : null}
              <Feather name={isLast ? "arrow-right" : "arrow-right"} size={19} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>
    </Screen>
  );
}

/**
 * One dot's fill. "done" dots are solid, "pending" dots are empty, and the
 * "active" dot sweeps left-to-right over `SLIDE_MS` while autoplay is
 * running.
 */
function ProgressFill({
  state,
  autoplay,
}: {
  state: "done" | "active" | "pending";
  autoplay: boolean;
}) {
  const progress = useSharedValue(state === "done" ? 1 : 0);

  useEffect(() => {
    if (state === "done") {
      progress.value = 1;
    } else if (state === "pending") {
      progress.value = 0;
    } else if (state === "active") {
      if (autoplay) {
        progress.value = 0;
        progress.value = withTiming(1, { duration: SLIDE_MS, easing: Easing.linear });
      } else {
        progress.value = 1;
      }
    }
  }, [state, autoplay, progress]);

  const style = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <Animated.View
      style={[{ height: "100%", borderRadius: 3, backgroundColor: brand.accentBright }, style]}
    />
  );
}
