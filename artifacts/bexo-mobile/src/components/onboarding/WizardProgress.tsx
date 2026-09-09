import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { ease } from "@/lib/motion";
import { brand } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";

/**
 * The wizard's progress bar: nine segments filling as you advance, a flag at
 * the finish — and a tiny figure that physically runs along the track, arms
 * and legs swinging, a motion trail behind it. It is decoration, but it is the
 * decoration that makes a nine-step form feel like progress instead of a
 * queue, so it is built rather than skipped.
 */
export function WizardProgress({ step, total }: { step: number; total: number }) {
  const { c } = useTheme();
  const runnerLeft = useSharedValue((step - 1) / total);

  useEffect(() => {
    runnerLeft.value = withTiming((step - 1) / total, { duration: 420, easing: ease.soft });
  }, [step, total, runnerLeft]);

  const runnerStyle = useAnimatedStyle(() => ({
    left: `${runnerLeft.value * 100}%`,
  }));

  return (
    <View style={{ paddingTop: 22 }}>
      <Animated.View style={[{ position: "absolute", top: -8 }, runnerStyle]}>
        <Runner />
      </Animated.View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {Array.from({ length: total }).map((_, i) => (
          <Segment key={i} state={i + 1 < step ? "done" : i + 1 === step ? "active" : "todo"} />
        ))}
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            backgroundColor: step >= total ? "transparent" : c.deep,
          }}
        >
          {step >= total ? (
            <LinearGradient
              colors={["#34D399", "#0E9F5D"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            />
          ) : null}
          <Feather name="flag" size={12} color={step >= total ? "#fff" : c.faint} />
        </View>
      </View>
    </View>
  );
}

function Segment({ state }: { state: "done" | "active" | "todo" }) {
  const { c } = useTheme();
  const fill = useSharedValue(state === "todo" ? 0 : 1);
  const pulse = useSharedValue(0);

  useEffect(() => {
    fill.value = withTiming(state === "todo" ? 0 : 1, { duration: 420, easing: ease.soft });
  }, [state, fill]);

  useEffect(() => {
    if (state !== "active") return;
    pulse.value = withRepeat(withTiming(1, { duration: 700, easing: ease.soft }), -1, true);
  }, [state, pulse]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scaleX: fill.value }],
    opacity: state === "active" ? interpolate(pulse.value, [0, 1], [0.85, 1]) : 1,
  }));

  return (
    <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: c.deep, overflow: "hidden" }}>
      <Animated.View style={[{ height: "100%", transformOrigin: "left" }, style]}>
        <LinearGradient
          colors={state === "active" ? [brand.accentBright, brand.accentPale] : [brand.accentBright, brand.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1, borderRadius: 3 }}
        />
      </Animated.View>
    </View>
  );
}

/** A 20×26 sprite: bobbing body, counter-swinging limbs, two trail dashes. */
function Runner() {
  const cycle = useSharedValue(0);

  useEffect(() => {
    cycle.value = withRepeat(withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [cycle]);

  const body = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(cycle.value, [0, 1], [0, -2.5]) }],
  }));
  const legFront = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(cycle.value, [0, 1], [38, -38])}deg` }],
  }));
  const legBack = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(cycle.value, [0, 1], [-38, 38])}deg` }],
  }));
  const armFront = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(cycle.value, [0, 1], [-34, 34])}deg` }],
  }));
  const armBack = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(cycle.value, [0, 1], [34, -34])}deg` }],
  }));
  const trail = useAnimatedStyle(() => ({
    transform: [{ scaleX: interpolate(cycle.value, [0, 1], [1, 0.4]) }],
    opacity: interpolate(cycle.value, [0, 1], [0.8, 0.1]),
  }));

  return (
    <Animated.View style={[{ width: 20, height: 26 }, body]}>
      <Animated.View
        style={[
          { position: "absolute", left: 7, top: 11, width: 6, height: 2, borderRadius: 1, backgroundColor: brand.accentPale, transformOrigin: "top center" },
          armBack,
        ]}
      />
      <Animated.View
        style={[
          { position: "absolute", left: 7, top: 11, width: 6, height: 2, borderRadius: 1, backgroundColor: brand.accent, transformOrigin: "top center" },
          armFront,
        ]}
      />
      <View
        style={{
          position: "absolute",
          left: 5,
          top: 6,
          width: 10,
          height: 10,
          borderTopLeftRadius: 5,
          borderTopRightRadius: 5,
          borderBottomLeftRadius: 4,
          borderBottomRightRadius: 4,
          backgroundColor: brand.accent,
          transform: [{ rotate: "8deg" }],
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 6.5,
          top: 0,
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: brand.accentBright,
        }}
      />
      <Animated.View
        style={[
          { position: "absolute", left: 9, top: 14, width: 2.6, height: 8, borderRadius: 1.5, backgroundColor: "#1A3FAE", transformOrigin: "top center" },
          legBack,
        ]}
      />
      <Animated.View
        style={[
          { position: "absolute", left: 9, top: 14, width: 2.6, height: 8, borderRadius: 1.5, backgroundColor: brand.accent, transformOrigin: "top center" },
          legFront,
        ]}
      />
      <Animated.View
        style={[
          { position: "absolute", right: 19, top: 16, width: 8, height: 1.5, borderRadius: 1, backgroundColor: "rgba(91,140,255,0.5)", transformOrigin: "right center" },
          trail,
        ]}
      />
      <Animated.View
        style={[
          { position: "absolute", right: 25, top: 16, width: 6, height: 1.5, borderRadius: 1, backgroundColor: "rgba(91,140,255,0.28)", transformOrigin: "right center" },
          trail,
        ]}
      />
    </Animated.View>
  );
}
