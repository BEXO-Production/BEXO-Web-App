import { useEffect } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { fonts } from "@/lib/fonts";
import { ease } from "@/lib/motion";
import { useTheme } from "@/lib/theme-context";

/**
 * Waiting states.
 *
 * The rule here: a loading state should tell you *what shape* is coming, and
 * it should move in one direction. A spinner that just rotates says only "not
 * yet"; a sheen travelling left-to-right across the exact silhouette of the
 * content says "this block, imminently" — and the eye tracks it instead of
 * counting the seconds.
 */

/**
 * A skeleton block with a specular sheen travelling across it. Replaces a
 * plain opacity breath, which reads as flickering rather than loading.
 */
export function SweepShimmer({
  height = 66,
  radius = 16,
  delay = 0,
  width,
  style,
}: {
  height?: number;
  radius?: number;
  delay?: number;
  width?: ViewStyle["width"];
  style?: ViewStyle;
}) {
  const { c, dark } = useTheme();
  const reduced = useReducedMotion();
  const p = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    const id = setTimeout(() => {
      p.value = withRepeat(withTiming(1, { duration: 1250, easing: ease.inOut }), -1, false);
    }, delay);
    return () => clearTimeout(id);
  }, [p, delay, reduced]);

  const sheen = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(p.value, [0, 1], [-160, 420]) }],
    opacity: interpolate(p.value, [0, 0.15, 0.85, 1], [0, 1, 1, 0]),
  }));

  return (
    <View
      style={[
        { height, width: width ?? "100%", borderRadius: radius, backgroundColor: c.deep, overflow: "hidden" },
        style,
      ]}
    >
      <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, width: 150 }, sheen]}>
        <LinearGradient
          colors={[
            "transparent",
            dark ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.85)",
            "transparent",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

/**
 * The brand spinner: a ring with one bright arc, spinning inside a slow
 * counter-pulse. Two speeds beat one — the eye reads it as a mechanism rather
 * than a loop.
 */
export function Orbit({
  size = 26,
  color,
  thickness = 2.5,
}: {
  size?: number;
  color?: string;
  thickness?: number;
}) {
  const { c } = useTheme();
  const tint = color ?? c.accent;
  const reduced = useReducedMotion();
  const spin = useSharedValue(0);
  const breathe = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    spin.value = withRepeat(withTiming(1, { duration: 820, easing: Easing.linear }), -1, false);
    breathe.value = withRepeat(withTiming(1, { duration: 1100, easing: ease.inOut }), -1, true);
  }, [spin, breathe, reduced]);

  const arc = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const halo = useAnimatedStyle(() => ({
    opacity: interpolate(breathe.value, [0, 1], [0.12, 0.28]),
    transform: [{ scale: interpolate(breathe.value, [0, 1], [0.92, 1.12]) }],
  }));

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={[
          {
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: tint,
          },
          halo,
        ]}
      />
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: thickness,
            borderColor: `${tint}26`,
            borderTopColor: tint,
            borderRightColor: tint,
          },
          arc,
        ]}
      />
    </View>
  );
}

/**
 * Three dots rising in sequence — the quiet inline wait, for a line of text
 * that is about to be replaced rather than a block that is about to appear.
 */
export function DotsPulse({ color, size = 5, gap = 5 }: { color?: string; size?: number; gap?: number }) {
  const { c } = useTheme();
  const tint = color ?? c.muted;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap }}>
      {[0, 1, 2].map((i) => (
        <PulseDot key={i} delay={i * 140} size={size} color={tint} />
      ))}
    </View>
  );
}

function PulseDot({ delay, size, color }: { delay: number; size: number; color: string }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    p.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 340, easing: ease.soft }),
          withTiming(0, { duration: 420, easing: ease.soft }),
        ),
        -1,
        false,
      ),
    );
  }, [p, delay, reduced]);

  const animated = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 1], [0.3, 1]),
    transform: [{ translateY: interpolate(p.value, [0, 1], [0, -3]) }],
  }));

  return (
    <Animated.View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, animated]}
    />
  );
}

/** A labelled wait: the orbit plus a line of copy, centred in whatever it fills. */
export function LoadingBlock({ label, tint }: { label: string; tint?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: "center", justifyContent: "center", gap: 12 }}>
      <Orbit size={28} color={tint} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <Text style={{ fontFamily: fonts.sans500, fontSize: 11.5, color: c.muted }}>{label}</Text>
        <DotsPulse size={3.5} gap={3.5} />
      </View>
    </View>
  );
}
