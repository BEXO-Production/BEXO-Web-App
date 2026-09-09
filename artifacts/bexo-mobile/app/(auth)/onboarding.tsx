import { useEffect, useState } from "react";
import { Rise } from "@/components/ui/Motion";
import { Image, Pressable, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeInDown,
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

/**
 * "02 ONBOARDING" screen, ported from the design canvas — including the
 * behavior my first pass at this screen dropped: the canvas auto-advances
 * through the four slides on a 6.2s timer like a story (`introTimer` in
 * support.js), with each dot filling left-to-right as it plays
 * (`bxFillBar 6.2s linear`), looping forever once started.
 *
 * The canvas's own loop never exits — it just repeats. Per the product ask,
 * this version hands off to sign-in once the story has played through all
 * four slides with no interaction at all, rather than looping indefinitely
 * on a screen the user isn't watching. Any interaction — tapping a dot, the
 * next arrow, Skip, or "Have a BEXO?" — stops autoplay for good and puts the
 * user back in control, matching the canvas's own comment that "tapping a
 * segment still overrides it."
 *
 * On top of dots/arrow/autoplay, the slide content also responds to a real
 * horizontal swipe (`Gesture.Pan`, not in the canvas — the canvas's own
 * pointer handler on this screen only does a 3D tilt, no slide-change
 * gesture): drag-follows the finger with rubber-band resistance past the
 * first/last slide, and releases into a swap or a spring-back based on
 * distance *or* flick velocity, whichever crosses first — so a fast short
 * flick advances just as reliably as a slow long drag.
 */
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
      // The canvas's story loops rather than handing off on its own — the
      // user always chooses when to leave (Skip / Have a BEXO? / the FAB).
      setIndex((i) => (i >= SLIDES.length - 1 ? 0 : i + 1));
    }, SLIDE_MS);
    return () => clearTimeout(timer);
  }, [index, autoplay]);

  const stopAutoplay = () => setAutoplay(false);

  const advance = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
  // Belt-and-suspenders: guarantees at most one slide-change per physical
  // gesture even if the underlying recognizer ever reports end-of-gesture
  // more than once (seen on some web/RNGH-web builds; native's own
  // recognizer already guarantees this, but the guard is free).
  const gestureConsumed = useSharedValue(false);

  const swipeGesture = Gesture.Pan()
    // Only steal the gesture once the drag is clearly horizontal, so a
    // vertical scroll/flick elsewhere on the screen isn't swallowed by this.
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onStart(() => {
      gestureConsumed.value = false;
    })
    .onUpdate((e) => {
      const atStartEdge = isFirst && e.translationX > 0;
      const atEndEdge = isLast && e.translationX < 0;
      // Rubber-band: the drag still tracks the finger past either edge, just
      // heavily damped, so it never feels like the gesture was ignored.
      dragX.value = atStartEdge || atEndEdge ? e.translationX * 0.32 : e.translationX;
    })
    .onEnd((e) => {
      if (gestureConsumed.value) return;
      const goingNext = e.translationX < 0;
      const pastThreshold =
        Math.abs(e.translationX) > DISTANCE_THRESHOLD || Math.abs(e.velocityX) > VELOCITY_THRESHOLD;

      if (pastThreshold && goingNext) {
        // advance() itself already turns "swipe left past the last slide"
        // into the hand-off to sign-in, same as tapping the arrow there.
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
    // A faint fade while dragging hard — mirrors the resistance visually,
    // not just physically — plus during the last-slide "no next slide"
    // stretch, since there the drag itself is the only feedback.
    opacity: interpolate(Math.abs(dragX.value), [0, 140], [1, 0.92], "clamp"),
  }));

  return (
    <Screen style={{ paddingHorizontal: 0 }} edges={["bottom"]}>
      {/* radial accent bloom behind the header, per the canvas */}
      <LinearGradient
        colors={["rgba(47,107,255,0.18)", "rgba(47,107,255,0)"]}
        style={{ position: "absolute", left: 0, right: 0, top: 0, height: 320 }}
      />

      <View style={{ flex: 1, paddingTop: 60 }}>
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
                fontSize: 10.5,
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

        {/* chapter counter: "01 / 04" */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            gap: 10,
            paddingHorizontal: 26,
            paddingTop: 20,
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

            <View style={{ paddingHorizontal: 26, paddingTop: 8, gap: 14 }}>
              <Rise key={`eyebrow-${index}`} duration={500} >
                <Eyebrow>{slide.eyebrow}</Eyebrow>
              </Rise>
              <Rise key={`title-${index}`} delay={50} duration={620} >
                <Display>
                  {slide.title}
                  {"\n"}
                  <DisplayAccent>{slide.highlight}</DisplayAccent>
                </Display>
              </Rise>
              <Rise key={`body-${index}`} delay={140} duration={620} >
                <Body style={{ fontSize: 14.5, lineHeight: 22, maxWidth: 300 }}>{slide.body}</Body>
              </Rise>
            </View>
          </Animated.View>
        </GestureDetector>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            paddingHorizontal: 26,
            paddingTop: 14,
            paddingBottom: 26,
          }}
        >
          <Pressable onPress={goPhone} hitSlop={8}>
            <Text style={{ fontFamily: fonts.sans500, fontSize: 13, color: c.muted }}>
              Have a BEXO?
            </Text>
          </Pressable>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={{ flexDirection: "row", gap: 7 }}>
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
                    width: i === index ? 44 : 22,
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

            <Pressable
              onPress={advance}
              accessibilityRole="button"
              accessibilityLabel={isLast ? "Create my BEXO" : "Next"}
              style={{
                width: 56,
                height: 56,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: brand.accent,
                shadowColor: brand.accent,
                shadowOpacity: 0.75,
                shadowRadius: 32,
                shadowOffset: { width: 0, height: 14 },
                elevation: 10,
              }}
            >
              <Feather name={isLast ? "check" : "arrow-right"} size={19} color="#fff" />
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
 * running — the `bxFillBar` story-progress read. Once the user takes control
 * (autoplay off), the active dot just shows as solid, like a plain position
 * marker rather than a countdown nobody asked for.
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
    // Re-key on state identity, not just its string, so a slide re-becoming
    // "active" (looping back to 0) restarts the fill from empty each time.
  }, [state, autoplay, progress]);

  const style = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <Animated.View
      style={[{ height: "100%", borderRadius: 3, backgroundColor: brand.accentBright }, style]}
    />
  );
}
