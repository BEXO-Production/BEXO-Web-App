import { useEffect } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ease } from "@/lib/motion";

/**
 * The looping decorations from the canvas's keyframe catalog — radar rings,
 * light sweeps, shimmer, spin, float. Each one is driven by a single shared
 * value on the UI thread, so they cost nothing on the JS side.
 */

/** `bxRing` — an expanding, fading ring pulse. "This is live / listening." */
export function PulseRing({
  size,
  color,
  borderWidth = 1,
  delay = 0,
  duration = 2400,
  style,
}: {
  size: number;
  color: string;
  borderWidth?: number;
  delay?: number;
  duration?: number;
  style?: ViewStyle;
}) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = 0;
    const id = setTimeout(() => {
      p.value = withRepeat(withTiming(1, { duration, easing: ease.soft }), -1, false);
    }, delay);
    return () => clearTimeout(id);
  }, [p, delay, duration]);

  const animated = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.7, 1], [0.55, 0, 0]),
    transform: [{ scale: interpolate(p.value, [0, 0.7, 1], [0.9, 1.5, 1.5]) }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          borderColor: color,
        },
        style,
        animated,
      ]}
    />
  );
}

/** `bxSweep` / `bxCtaSweep` — a soft diagonal gleam drifting across a surface. */
export function LightSweep({
  width,
  height,
  duration = 2400,
  delay = 2400,
  opacity = 0.35,
  once = false,
  tint = "255,255,255",
}: {
  width: number;
  height: number;
  duration?: number;
  delay?: number;
  opacity?: number;
  once?: boolean;
  /** RGB triplet for the gleam — the splash bar sweeps blue, buttons white. */
  tint?: string;
}) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = 0;
    const id = setTimeout(() => {
      const anim = withTiming(1, { duration, easing: ease.soft });
      p.value = once ? anim : withRepeat(anim, -1, false);
    }, delay);
    return () => clearTimeout(id);
  }, [p, delay, duration, once]);

  const bandWidth = width * 0.4;
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(p.value, [0, 0.5, 1], [-bandWidth, -bandWidth, width + bandWidth]) }],
  }));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      <Animated.View style={[{ position: "absolute", top: -height, height: height * 3, width: bandWidth }, animated]}>
        <LinearGradient
          colors={["transparent", `rgba(${tint},${opacity})`, "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.35 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

/** `bxShimmer` — the loading-skeleton breath, 0.5 → 1 → 0.5 opacity. */
export function Shimmer({
  delay = 0,
  style,
  children,
}: {
  delay?: number;
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
}) {
  const p = useSharedValue(0);

  useEffect(() => {
    const id = setTimeout(() => {
      p.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true);
    }, delay);
    return () => clearTimeout(id);
  }, [p, delay]);

  const animated = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0, 1], [0.5, 1]) }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** `bxSpin` — a plain 360° loop; wrap a ring or icon in it. */
export function Spin({
  duration = 900,
  children,
  style,
}: {
  duration?: number;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
  }, [p, duration]);

  const animated = useAnimatedStyle(() => ({ transform: [{ rotate: `${p.value * 360}deg` }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** `bxFloat` — a gentle 6px bob, used on the splash mark and floating chips. */
export function Float({
  distance = 6,
  duration = 1800,
  delay = 0,
  children,
  style,
}: {
  distance?: number;
  duration?: number;
  delay?: number;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const p = useSharedValue(0);

  useEffect(() => {
    const id = setTimeout(() => {
      p.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }), -1, true);
    }, delay);
    return () => clearTimeout(id);
  }, [p, duration, delay]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(p.value, [0, 1], [0, -distance]) }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
