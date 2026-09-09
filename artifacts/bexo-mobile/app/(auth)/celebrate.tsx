import { useEffect, useState } from "react";
import { Rise } from "@/components/ui/Motion";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { CardFront, identityFrom } from "@/components/IdentityCard";
import { useCardDesign } from "@/lib/card-design-store";
import { useProfile } from "@/lib/use-profile";
import { useOverlay } from "@/lib/overlay-context";
import { ease } from "@/lib/motion";
import { STUDIO_DIMS } from "@/lib/design-data";
import { fonts } from "@/lib/fonts";

const CONFETTI_COLORS = ["#5B8CFF", "#7FB0FF", "#34D399", "#FDA4AF", "#FBBF24"];

/**
 * "05b Celebrate" — the one screen where the primary action is the hero object
 * itself. Tapping the finished card flashes, rings out, and steps into the app.
 */
export default function Celebrate() {
  const { wipe } = useOverlay();
  const { design } = useCardDesign();
  const { data } = useProfile();
  const [activated, setActivated] = useState(false);

  const pop = useSharedValue(0);
  const flash = useSharedValue(0);

  useEffect(() => {
    pop.value = withTiming(1, { duration: 600, easing: ease.soft });
  }, [pop]);

  const identity = identityFrom({
    name: data?.user?.name ?? undefined,
    site: data?.profile?.handle ? `${data.profile.handle}.atbexo.com` : undefined,
  });

  const activate = () => {
    if (activated) return;
    setActivated(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    flash.value = withTiming(1, { duration: 500, easing: ease.soft });
    setTimeout(() => wipe(() => router.replace("/(app)/home")), 620);
  };

  const wrapStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pop.value, [0, 1], [0, 1]) * (activated ? 1 - flash.value : 1),
    transform: [{ scale: interpolate(pop.value, [0, 0.6, 1], [0.4, 1.08, 1]) }],
  }));

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flash.value,
    transform: [{ scale: interpolate(flash.value, [0, 1], [0.4, 1.6]) }],
  }));

  const ring1 = useAnimatedStyle(() => ({
    opacity: interpolate(flash.value, [0, 0.3, 1], [0, 0.7, 0]),
    transform: [{ scale: interpolate(flash.value, [0, 1], [0.6, 1.9]) }],
  }));
  const ring2 = useAnimatedStyle(() => ({
    opacity: interpolate(flash.value, [0, 0.3, 1], [0, 0.5, 0]),
    transform: [{ scale: interpolate(flash.value, [0, 1], [0.6, 2.6]) }],
  }));

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <StatusBar style="light" />
      <LinearGradient colors={["#0B0F1E", "#141b34", "#0B0F1E"]} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={["rgba(91,140,255,0.32)", "transparent"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.8 }}
        style={StyleSheet.absoluteFill}
      />

      {Array.from({ length: 24 }).map((_, i) => (
        <Confetti key={i} index={i} />
      ))}

      <Animated.View style={[{ alignItems: "center", gap: 22, paddingHorizontal: 30 }, wrapStyle]}>
        <Pressable onPress={activate} accessibilityRole="button" accessibilityLabel="Enter your dashboard">
          <CardFront identity={identity} design={design} d={STUDIO_DIMS} />
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 160,
                height: 160,
                marginLeft: -80,
                marginTop: -80,
                borderRadius: 80,
                backgroundColor: "rgba(255,255,255,0.9)",
              },
              flashStyle,
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 200,
                height: 200,
                marginLeft: -100,
                marginTop: -100,
                borderRadius: 100,
                borderWidth: 1.5,
                borderColor: "rgba(91,140,255,0.6)",
              },
              ring1,
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 200,
                height: 200,
                marginLeft: -100,
                marginTop: -100,
                borderRadius: 100,
                borderWidth: 1.5,
                borderColor: "rgba(91,140,255,0.4)",
              },
              ring2,
            ]}
          />
        </Pressable>

        <Rise delay={200}  style={{ alignItems: "center", gap: 8 }}>
          <Text
            style={{
              fontFamily: fonts.serif600Italic,
              fontSize: 30,
              letterSpacing: -0.4,
              color: "#fff",
            }}
          >
            You’re all set
          </Text>
          <Text
            style={{
              fontFamily: fonts.sans400,
              fontSize: 14.5,
              lineHeight: 22,
              textAlign: "center",
              maxWidth: 280,
              color: "rgba(255,255,255,0.68)",
            }}
          >
            Your BEXO card is live. Tap it to step into your dashboard.
          </Text>
        </Rise>

        <Rise delay={320}  style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <Feather name="arrow-up" size={14} color="rgba(255,255,255,0.5)" />
          <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: "rgba(255,255,255,0.5)" }}>
            Tap the card
          </Text>
        </Rise>
      </Animated.View>
    </View>
  );
}

/** One falling, rotating piece. 24 of them, each on its own loop offset. */
function Confetti({ index }: { index: number }) {
  const fall = useSharedValue(0);
  const size = 6 + (index % 3) * 2;

  useEffect(() => {
    fall.value = withDelay(
      index * 80,
      withRepeat(
        withTiming(1, { duration: 2400 + (index % 5) * 400, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
        -1,
        false,
      ),
    );
  }, [fall, index]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(fall.value, [0, 0.1, 1], [0, 0.9, 0]),
    transform: [
      { translateY: interpolate(fall.value, [0, 1], [0, 680]) },
      { rotate: `${fall.value * 340}deg` },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: -20,
          left: `${index * 4.2 + (index % 3) * 2}%`,
          width: size,
          height: size,
          borderRadius: index % 2 ? size / 2 : 2,
          backgroundColor: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        },
        style,
      ]}
    />
  );
}
