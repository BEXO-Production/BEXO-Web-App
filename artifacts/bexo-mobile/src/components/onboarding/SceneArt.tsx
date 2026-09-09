import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { MotiView, AnimatePresence } from "moti";
import Svg, { Circle, Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";
import { PhoneBezel } from "./PhoneBezel";

/**
 * The four onboarding scenes from the design canvas. Scenes 1/2/3 still run
 * their original 6.2s Reanimated interpolation loop (matching `bxScan`,
 * `bxArrowTravel`, `bxOrbit`) — appropriate for a fixed, precisely-timed
 * multi-keyframe cycle. Scene 0 (TapScene) is a Moti state machine instead —
 * see its own comment for why.
 */
const LOOP_MS = 6200;

export function SceneArt({ index }: { index: number }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      {index === 0 ? <TapScene /> : null}
      {index === 1 ? <AnalyticsScene /> : null}
      {index === 2 ? <PublishScene /> : null}
      {index === 3 ? <NetworkScene /> : null}
    </View>
  );
}

/** Scene 0 — an NFC card drops in, taps the phone, and bounces away. */
/** Card float states through one loop: drops in over the phone, taps, settles, bounces off. */
type TapPhase = "enter" | "landed" | "exit";

function TapScene() {
  const { c } = useTheme();
  const [phase, setPhase] = useState<TapPhase>("enter");
  const [ringKey, setRingKey] = useState(0);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    // One authored loop rather than the raw CSS's 6-keyframe timeline — a
    // three-phase state machine is far more robust across RN/web than chained
    // percentage keyframes, and was the actual source of the misaligned card
    // reported earlier (translateX/Y baked for a specific container size that
    // didn't hold once this scene was embedded at a different width).
    let cancelled = false;
    async function loop() {
      while (!cancelled) {
        setPhase("enter");
        setShowToast(false);
        await sleep(650);
        if (cancelled) return;
        setPhase("landed");
        setRingKey((k) => k + 1);
        setShowToast(true);
        await sleep(2200);
        if (cancelled) return;
        setPhase("exit");
        setShowToast(false);
        await sleep(900);
      }
    }
    loop();
    return () => {
      cancelled = true;
    };
  }, []);

  // Anchor everything to this box explicitly — no reliance on a parent's
  // alignItems to center absolutely-positioned children, which is what broke
  // under different container widths before.
  const BOX = 220;
  const cardTarget =
    phase === "enter"
      ? { x: BOX - 60, y: -8, rotate: 14, scale: 0.82, opacity: 0 }
      : phase === "landed"
        ? { x: BOX / 2 - 75, y: BOX / 2 - 10, rotate: 0, scale: 1, opacity: 1 }
        : { x: BOX - 40, y: BOX + 20, rotate: 10, scale: 0.9, opacity: 0 };

  return (
    <View style={{ width: BOX, height: BOX + 40, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", left: (BOX - 174) / 2, top: 0 }}>
        <PhoneBezel>
          <MotiView
            from={{ opacity: 0.35 }}
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ type: "timing", duration: 3100, loop: true }}
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 140 }}
          >
            <LinearGradient
              colors={["rgba(91,140,255,0.34)", "transparent"]}
              style={{ flex: 1 }}
            />
          </MotiView>
        </PhoneBezel>
      </View>

      {phase === "landed" ? (
        <MotiView
          key={ringKey}
          from={{ opacity: 0.6, scale: 0.4 }}
          animate={{ opacity: 0, scale: 1.6 }}
          transition={{ type: "timing", duration: 900 }}
          style={{
            position: "absolute",
            left: BOX / 2 - 50,
            top: BOX / 2 - 20,
            width: 100,
            height: 100,
            borderRadius: 50,
            borderWidth: 1.5,
            borderColor: "rgba(91,140,255,0.5)",
          }}
        />
      ) : null}

      {/* the card — Moti tweens between the three explicit phase targets above */}
      <MotiView
        animate={{
          translateX: cardTarget.x,
          translateY: cardTarget.y,
          rotate: `${cardTarget.rotate}deg`,
          scale: cardTarget.scale,
          opacity: cardTarget.opacity,
        }}
        transition={{ type: "timing", duration: phase === "landed" ? 480 : 620, easing: Easing.out(Easing.cubic) }}
        style={{ position: "absolute", left: 0, top: 0 }}
      >
        <LinearGradient
          colors={["#5A90FF", "#2F6BFF", "#17399C"]}
          locations={[0, 0.48, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 150,
            height: 96,
            borderRadius: 14,
            padding: 12,
            justifyContent: "space-between",
            shadowColor: c.accent,
            shadowOpacity: 0.6,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 16 },
            elevation: 12,
          }}
        >
          <View
            style={{
              width: 18,
              height: 14,
              borderRadius: 3,
              borderWidth: 1.4,
              borderColor: "rgba(255,255,255,0.85)",
            }}
          />
          <Text style={{ fontFamily: fonts.sans800, fontSize: 10.5, letterSpacing: 0.3, color: "#fff" }}>
            KAVINBALAJI S K
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontFamily: fonts.sans400, fontSize: 8, color: "rgba(255,255,255,0.75)" }}>
              kavin.atbexo.com
            </Text>
            <Text style={{ fontFamily: fonts.sans700, fontSize: 8, letterSpacing: 1.6, color: "#fff" }}>
              BEXO
            </Text>
          </View>
        </LinearGradient>
      </MotiView>

      {/* "Connected" toast */}
      <AnimatePresence>
        {showToast ? (
          <MotiView
            from={{ opacity: 0, translateY: -10 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0, translateY: -6 }}
            transition={{ type: "timing", duration: 260 }}
            style={{ position: "absolute", top: 6, alignSelf: "center" }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 7,
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 999,
                backgroundColor: "rgba(20,26,20,0.9)",
                borderWidth: 1,
                borderColor: "rgba(52,211,153,0.4)",
              }}
            >
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(52,211,153,0.18)",
                }}
              >
                <Feather name="check" size={10} color="#34D399" />
              </View>
              <Text style={{ fontFamily: fonts.sans600, fontSize: 12, color: "#fff" }}>Connected</Text>
            </View>
          </MotiView>
        ) : null}
      </AnimatePresence>
    </View>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BAR_HEIGHTS = [52, 88, 68, 124, 96, 152, 118];

/** Scene 1 — analytics bars growing under a sweeping scan line, with stat chips. */
function AnalyticsScene() {
  const { c } = useTheme();
  const sweep = useSharedValue(0);

  useEffect(() => {
    sweep.value = withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1, false);
  }, [sweep]);

  const scanStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(sweep.value, [0, 1], [-20, 260]) }],
  }));

  return (
    <View style={{ width: 300, height: 300, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: 260,
          height: 200,
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 10,
          paddingHorizontal: 6,
        }}
      >
        {BAR_HEIGHTS.map((h, i) => (
          <GrowBar key={i} height={h} delay={i * 90} />
        ))}
        <Animated.View
          style={[
            { position: "absolute", top: 0, bottom: 0, width: 30 },
            scanStyle,
          ]}
        >
          <LinearGradient
            colors={["transparent", "rgba(91,140,255,0.16)", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      </View>

      <StatChip icon="eye" label="1,284 views" style={{ top: 6, left: 4 }} delay={200} />
      <StatChip icon="mail" label="4 new enquiries" style={{ top: 64, right: 0 }} delay={420} />
      <StatChip
        icon="trending-up"
        label="+38% this week"
        style={{ bottom: 30, left: 12 }}
        delay={640}
      />
    </View>
  );
}

function GrowBar({ height, delay }: { height: number; delay: number }) {
  const { c } = useTheme();
  const grow = useSharedValue(0);

  useEffect(() => {
    grow.value = withDelay(delay, withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }));
  }, [grow, delay]);

  const style = useAnimatedStyle(() => ({
    height: grow.value * height,
    opacity: grow.value,
  }));

  return (
    <Animated.View style={[{ flex: 1, borderRadius: 6, overflow: "hidden" }, style]}>
      <LinearGradient colors={["#5B8CFF", "#2F6BFF"]} style={{ flex: 1 }} />
    </Animated.View>
  );
}

function StatChip({
  icon,
  label,
  style,
  delay,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  style: object;
  delay: number;
}) {
  const { c } = useTheme();
  return (
    <Animated.View
      entering={undefined}
      style={[
        {
          position: "absolute",
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: c.panel,
          borderWidth: 1,
          borderColor: c.border,
          shadowColor: "#16171B",
          shadowOpacity: 0.09,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 4,
        },
        style,
      ]}
    >
      <Feather name={icon} size={13} color={c.accent} />
      <Text style={{ fontFamily: fonts.sans600, fontSize: 12, color: c.ink }}>{label}</Text>
    </Animated.View>
  );
}

/** Scene 2 — a resume page turns into a published site. */
function PublishScene() {
  const { c } = useTheme();
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1, false);
  }, [t]);

  const arrowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.08, 0.4, 0.52, 1], [0.5, 0.5, 1, 0.5, 0.5]),
    transform: [{ translateX: interpolate(t.value, [0, 0.08, 0.4, 0.52, 1], [0, 0, 10, 10, 10]) }],
  }));

  return (
    <View style={{ width: 300, height: 260, alignItems: "center", justifyContent: "center" }}>
      {/* resume sheet */}
      <View
        style={{
          position: "absolute",
          left: 22,
          width: 126,
          height: 164,
          borderRadius: 12,
          backgroundColor: "#fff",
          padding: 14,
          gap: 6,
          transform: [{ rotate: "-4deg" }],
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 18 },
          elevation: 10,
        }}
      >
        <View style={{ width: "60%", height: 8, borderRadius: 2, backgroundColor: c.ink }} />
        <View
          style={{
            width: "40%",
            height: 4,
            borderRadius: 2,
            backgroundColor: "rgba(22,23,27,0.3)",
            marginBottom: 6,
          }}
        />
        {[100, 92, 96, 74, 88, 60].map((w, i) => (
          <View
            key={i}
            style={{
              width: `${w}%`,
              height: 4,
              borderRadius: 2,
              backgroundColor: "rgba(22,23,27,0.14)",
            }}
          />
        ))}
      </View>

      <Animated.View style={[{ position: "absolute", zIndex: 3 }, arrowStyle]}>
        <Feather name="arrow-right" size={22} color="#5B8CFF" />
      </Animated.View>

      {/* published site */}
      <LinearGradient
        colors={["#0B0D14", "#161B27"]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={{
          position: "absolute",
          right: 18,
          width: 150,
          height: 174,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          padding: 12,
          gap: 8,
          transform: [{ rotate: "4deg" }],
          shadowColor: c.accent,
          shadowOpacity: 0.4,
          shadowRadius: 26,
          shadowOffset: { width: 0, height: 20 },
          elevation: 12,
        }}
      >
        <View style={{ flexDirection: "row", gap: 4 }}>
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
            <View key={c} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c }} />
          ))}
        </View>
        <View style={{ width: "70%", height: 9, borderRadius: 2, backgroundColor: "#5B8CFF" }} />
        <View
          style={{
            width: "50%",
            height: 5,
            borderRadius: 2,
            backgroundColor: "rgba(255,255,255,0.3)",
          }}
        />
        <View
          style={{
            flex: 1,
            borderRadius: 8,
            backgroundColor: "rgba(91,140,255,0.12)",
            borderWidth: 1,
            borderColor: "rgba(91,140,255,0.28)",
          }}
        />
      </LinearGradient>
    </View>
  );
}

const NODES = [
  { initials: "KB", x: 140, y: 140, size: 46, primary: true },
  { initials: "AR", x: 44, y: 74, size: 34 },
  { initials: "MS", x: 232, y: 66, size: 34 },
  { initials: "JP", x: 30, y: 198, size: 32 },
  { initials: "DN", x: 236, y: 206, size: 32 },
  { initials: "SV", x: 140, y: 254, size: 30 },
];

/** Scene 3 — the connection mesh, orbiting slowly. */
function NetworkScene() {
  const { c } = useTheme();
  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1, false);
  }, [spin]);

  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  return (
    <View style={{ width: 280, height: 300, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={[
          {
            position: "absolute",
            width: 280,
            height: 280,
            borderRadius: 140,
            borderWidth: 1,
            borderColor: "rgba(22,23,27,0.10)",
            borderStyle: "dashed",
          },
          orbitStyle,
        ]}
      />

      <Svg width={280} height={280} style={{ position: "absolute" }}>
        {NODES.slice(1).map((n, i) => (
          <Path
            key={i}
            d={`M140 140 L${n.x} ${n.y}`}
            stroke="rgba(47,107,255,0.28)"
            strokeWidth={1.2}
          />
        ))}
        <Circle cx={140} cy={140} r={64} stroke="rgba(47,107,255,0.14)" strokeWidth={1} fill="none" />
      </Svg>

      {NODES.map((n) => (
        <View
          key={n.initials}
          style={{
            position: "absolute",
            left: n.x - n.size / 2,
            top: n.y - n.size / 2,
            width: n.size,
            height: n.size,
            borderRadius: n.size / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: n.primary ? c.accent : c.panel,
            borderWidth: 1,
            borderColor: n.primary ? c.accent : c.border,
            shadowColor: "#16171B",
            shadowOpacity: 0.12,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 5 },
            elevation: 4,
          }}
        >
          <Text
            style={{
              fontFamily: fonts.sans700,
              fontSize: n.primary ? 14 : 11,
              color: n.primary ? "#fff" : c.ink,
            }}
          >
            {n.initials}
          </Text>
        </View>
      ))}
    </View>
  );
}
