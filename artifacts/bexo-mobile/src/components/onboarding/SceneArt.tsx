import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
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
import Svg, { Line, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";
import { PhoneBezel } from "./PhoneBezel";

const LOOP_MS = 6200;

export function SceneArt({ index }: { index: number }) {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      {index === 0 ? <TapScene /> : null}
      {index === 1 ? <AnalyticsScene /> : null}
      {index === 2 ? <PublishScene /> : null}
      {index === 3 ? <NetworkScene /> : null}
    </View>
  );
}

/* ==========================================================================
   SCENE 0: NFC Card Tap (Physical to Digital Handshake)
   ========================================================================== */

type TapPhase = "enter" | "landed" | "exit";

function TapScene() {
  const { c } = useTheme();
  const [phase, setPhase] = useState<TapPhase>("enter");
  const [ringKey, setRingKey] = useState(0);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
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
        await sleep(2400);
        if (cancelled) return;
        setPhase("exit");
        setShowToast(false);
        await sleep(850);
      }
    }
    loop();
    return () => {
      cancelled = true;
    };
  }, []);

  const BOX = 230;
  const cardTarget =
    phase === "enter"
      ? { x: BOX - 55, y: -12, rotate: 16, scale: 0.82, opacity: 0 }
      : phase === "landed"
        ? { x: BOX / 2 - 76, y: BOX / 2 - 8, rotate: 0, scale: 1, opacity: 1 }
        : { x: BOX - 30, y: BOX + 24, rotate: 12, scale: 0.88, opacity: 0 };

  return (
    <View style={{ width: BOX, height: BOX + 50, alignItems: "center", justifyContent: "center" }}>
      {/* Phone Screen Bezel with glowing aura */}
      <View style={{ position: "absolute", left: (BOX - 174) / 2, top: 0 }}>
        <PhoneBezel>
          <MotiView
            from={{ opacity: 0.3 }}
            animate={{ opacity: [0.3, 0.9, 0.3] }}
            transition={{ type: "timing", duration: 3200, loop: true }}
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 160 }}
          >
            <LinearGradient
              colors={["rgba(59,130,246,0.42)", "transparent"]}
              style={{ flex: 1 }}
            />
          </MotiView>
        </PhoneBezel>
      </View>

      {/* Satisfying NFC Pulse Rings on Impact */}
      {phase === "landed" ? (
        <>
          <MotiView
            key={`ring-1-${ringKey}`}
            from={{ opacity: 0.7, scale: 0.3 }}
            animate={{ opacity: 0, scale: 2.0 }}
            transition={{ type: "timing", duration: 1100, easing: Easing.out(Easing.cubic) }}
            style={{
              position: "absolute",
              left: BOX / 2 - 50,
              top: BOX / 2 - 20,
              width: 100,
              height: 100,
              borderRadius: 50,
              borderWidth: 2,
              borderColor: "rgba(59,130,246,0.6)",
            }}
          />
          <MotiView
            key={`ring-2-${ringKey}`}
            from={{ opacity: 0.5, scale: 0.3 }}
            animate={{ opacity: 0, scale: 2.5 }}
            transition={{ type: "timing", duration: 1400, delay: 180, easing: Easing.out(Easing.cubic) }}
            style={{
              position: "absolute",
              left: BOX / 2 - 50,
              top: BOX / 2 - 20,
              width: 100,
              height: 100,
              borderRadius: 50,
              borderWidth: 1.5,
              borderColor: "rgba(99,102,241,0.4)",
            }}
          />
        </>
      ) : null}

      {/* Holographic Metal Smart NFC Card */}
      <MotiView
        animate={{
          translateX: cardTarget.x,
          translateY: cardTarget.y,
          rotate: `${cardTarget.rotate}deg`,
          scale: cardTarget.scale,
          opacity: cardTarget.opacity,
        }}
        transition={{
          type: "timing",
          duration: phase === "landed" ? 520 : 640,
          easing: Easing.out(Easing.cubic),
        }}
        style={{ position: "absolute", left: 0, top: 0 }}
      >
        <LinearGradient
          colors={["#3B82F6", "#1D4ED8", "#0F172A"]}
          locations={[0, 0.45, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 154,
            height: 98,
            borderRadius: 14,
            padding: 12,
            justifyContent: "space-between",
            shadowColor: "#3B82F6",
            shadowOpacity: 0.65,
            shadowRadius: 26,
            shadowOffset: { width: 0, height: 16 },
            elevation: 14,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.22)",
            overflow: "hidden",
          }}
        >
          {/* Subtle Sheen Bar */}
          <MotiView
            from={{ translateX: -120 }}
            animate={{ translateX: 220 }}
            transition={{ type: "timing", duration: 2200, loop: true, delay: 400 }}
            style={{
              position: "absolute",
              top: -20,
              width: 32,
              height: 140,
              transform: [{ rotate: "25deg" }],
            }}
          >
            <LinearGradient
              colors={["transparent", "rgba(255,255,255,0.25)", "transparent"]}
              style={{ flex: 1 }}
            />
          </MotiView>

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View
              style={{
                width: 20,
                height: 15,
                borderRadius: 3.5,
                borderWidth: 1.4,
                borderColor: "rgba(255,255,255,0.9)",
                backgroundColor: "rgba(255,255,255,0.15)",
              }}
            />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.14)",
              }}
            >
              <Feather name="radio" size={9} color="#fff" />
              <Text style={{ fontFamily: fonts.mono500, fontSize: 8, color: "#fff" }}>NFC</Text>
            </View>
          </View>

          <View>
            <Text style={{ fontFamily: fonts.sans800, fontSize: 11, letterSpacing: 0.4, color: "#fff" }}>
              KAVINBALAJI S K
            </Text>
            <Text style={{ fontFamily: fonts.sans400, fontSize: 7.5, color: "rgba(255,255,255,0.8)" }}>
              Product Architect & Founder
            </Text>
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: fonts.mono500, fontSize: 8, color: "rgba(255,255,255,0.85)" }}>
              kavin.atbexo.com
            </Text>
            <Text style={{ fontFamily: fonts.sans800, fontSize: 8.5, letterSpacing: 1.8, color: "#fff" }}>
              BEXO
            </Text>
          </View>
        </LinearGradient>
      </MotiView>

      {/* "Instant Connected" Pill Toast */}
      <AnimatePresence>
        {showToast ? (
          <MotiView
            from={{ opacity: 0, translateY: -12, scale: 0.92 }}
            animate={{ opacity: 1, translateY: 0, scale: 1 }}
            exit={{ opacity: 0, translateY: -8, scale: 0.94 }}
            transition={{ type: "timing", duration: 280 }}
            style={{ position: "absolute", top: 4, alignSelf: "center", zIndex: 10 }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 16,
                paddingVertical: 9,
                borderRadius: 999,
                backgroundColor: "rgba(16,24,39,0.92)",
                borderWidth: 1,
                borderColor: "rgba(52,211,153,0.45)",
                shadowColor: "#10B981",
                shadowOpacity: 0.35,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 6 },
                elevation: 8,
              }}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(52,211,153,0.22)",
                }}
              >
                <Feather name="check" size={11} color="#34D399" />
              </View>
              <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: "#fff" }}>
                Connected in 0.1s
              </Text>
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

/* ==========================================================================
   SCENE 1: Analytics & Discovery (Search-Ready + Real-time Inquiries)
   ========================================================================== */

const BAR_HEIGHTS = [56, 92, 74, 134, 108, 164, 126];

function AnalyticsScene() {
  const sweep = useSharedValue(0);

  useEffect(() => {
    sweep.value = withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1, false);
  }, [sweep]);

  const scanStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(sweep.value, [0, 1], [-20, 270]) }],
  }));

  return (
    <View style={{ width: 310, height: 280, alignItems: "center", justifyContent: "center" }}>
      {/* Background card container with subtle grid */}
      <View
        style={{
          width: 276,
          height: 190,
          borderRadius: 18,
          backgroundColor: "rgba(15,23,42,0.45)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          padding: 16,
          justifyContent: "flex-end",
          overflow: "hidden",
        }}
      >
        {/* Subtle horizontal grid lines */}
        <View style={{ position: "absolute", left: 16, right: 16, top: 40, height: 1, backgroundColor: "rgba(255,255,255,0.05)" }} />
        <View style={{ position: "absolute", left: 16, right: 16, top: 80, height: 1, backgroundColor: "rgba(255,255,255,0.05)" }} />
        <View style={{ position: "absolute", left: 16, right: 16, top: 120, height: 1, backgroundColor: "rgba(255,255,255,0.05)" }} />

        {/* Bars */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 11,
            height: 140,
          }}
        >
          {BAR_HEIGHTS.map((h, i) => (
            <GrowBar key={i} height={h} delay={i * 90} />
          ))}

          {/* Sweeping laser scan line */}
          <Animated.View
            style={[
              { position: "absolute", top: 0, bottom: 0, width: 36 },
              scanStyle,
            ]}
          >
            <LinearGradient
              colors={["transparent", "rgba(59,130,246,0.32)", "rgba(59,130,246,0.7)", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </View>
      </View>

      {/* Floating Insight Chips */}
      <StatChip icon="eye" label="1,284 visitors" delta="+42%" style={{ top: 8, left: 6 }} delay={200} />
      <StatChip icon="mail" label="4 direct inquiries" delta="Instant" style={{ top: 56, right: -4 }} delay={420} accent />
      <StatChip
        icon="trending-up"
        label="Top 1% Portfolio"
        delta="SEO Ready"
        style={{ bottom: 20, left: 18 }}
        delay={640}
      />
    </View>
  );
}

function GrowBar({ height, delay }: { height: number; delay: number }) {
  const grow = useSharedValue(0);

  useEffect(() => {
    grow.value = withDelay(delay, withTiming(1, { duration: 680, easing: Easing.out(Easing.cubic) }));
  }, [grow, delay]);

  const style = useAnimatedStyle(() => ({
    height: grow.value * height,
    opacity: grow.value,
  }));

  return (
    <Animated.View style={[{ flex: 1, borderRadius: 6, overflow: "hidden" }, style]}>
      <LinearGradient
        colors={["#60A5FA", "#2563EB", "#1D4ED8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ flex: 1 }}
      >
        <View style={{ width: "100%", height: 3, backgroundColor: "rgba(255,255,255,0.7)" }} />
      </LinearGradient>
    </Animated.View>
  );
}

function StatChip({
  icon,
  label,
  delta,
  style,
  delay,
  accent,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  delta: string;
  style: object;
  delay: number;
  accent?: boolean;
}) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 10, scale: 0.9 }}
      animate={{ opacity: 1, translateY: 0, scale: 1 }}
      transition={{ type: "timing", duration: 520, delay }}
      style={[
        {
          position: "absolute",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 999,
          backgroundColor: accent ? "rgba(16,185,129,0.18)" : "rgba(15,23,42,0.88)",
          borderWidth: 1,
          borderColor: accent ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.14)",
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        },
        style,
      ]}
    >
      <Feather name={icon} size={13} color={accent ? "#34D399" : "#60A5FA"} />
      <Text style={{ fontFamily: fonts.sans600, fontSize: 11.5, color: "#fff" }}>{label}</Text>
      <View
        style={{
          paddingHorizontal: 5,
          paddingVertical: 1.5,
          borderRadius: 999,
          backgroundColor: accent ? "rgba(52,211,153,0.25)" : "rgba(59,130,246,0.25)",
        }}
      >
        <Text
          style={{
            fontFamily: fonts.mono500,
            fontSize: 8.5,
            color: accent ? "#34D399" : "#93C5FD",
          }}
        >
          {delta}
        </Text>
      </View>
    </MotiView>
  );
}

/* ==========================================================================
   SCENE 2: Upload Once -> AI Reads -> Live Portfolio (Screen 3 Highlight!)
   ========================================================================== */

function PublishScene() {
  const scanProgress = useSharedValue(0);
  const floatAnim = useSharedValue(0);

  useEffect(() => {
    // Laser scan sweeping up and down across the resume sheet
    scanProgress.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );

    // Subtle breathing floating hover
    floatAnim.value = withRepeat(
      withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [scanProgress, floatAnim]);

  const laserStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scanProgress.value, [0, 1], [0, 165]) }],
  }));

  const floatWebsiteStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(floatAnim.value, [0, 1], [0, -6]) }],
  }));

  return (
    <View style={{ width: 330, height: 280, alignItems: "center", justifyContent: "center" }}>
      {/* 1. Left: Scanned Resume Document with Animated Laser Beam */}
      <View
        style={{
          position: "absolute",
          left: 12,
          top: 36,
          width: 134,
          height: 182,
          borderRadius: 14,
          backgroundColor: "#FFFFFF",
          padding: 12,
          transform: [{ rotate: "-4.5deg" }],
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 16 },
          elevation: 12,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(0,0,0,0.06)",
        }}
      >
        {/* Document Header with Mini Avatar & Name */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 }}>
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: "#2563EB",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: fonts.sans700, fontSize: 10, color: "#fff" }}>KB</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ width: "70%", height: 6, borderRadius: 3, backgroundColor: "#0F172A" }} />
            <View
              style={{
                width: "45%",
                height: 4,
                borderRadius: 2,
                backgroundColor: "rgba(15,23,42,0.4)",
                marginTop: 3,
              }}
            />
          </View>
        </View>

        {/* Mini Section: Experience */}
        <View style={{ width: "35%", height: 5, borderRadius: 2, backgroundColor: "#3B82F6", marginBottom: 5 }} />
        <View style={{ width: "95%", height: 4, borderRadius: 2, backgroundColor: "rgba(15,23,42,0.18)", marginBottom: 3 }} />
        <View style={{ width: "80%", height: 4, borderRadius: 2, backgroundColor: "rgba(15,23,42,0.12)", marginBottom: 7 }} />

        {/* Mini Section: Projects */}
        <View style={{ width: "40%", height: 5, borderRadius: 2, backgroundColor: "#3B82F6", marginBottom: 5 }} />
        <View style={{ width: "90%", height: 4, borderRadius: 2, backgroundColor: "rgba(15,23,42,0.18)", marginBottom: 3 }} />
        <View style={{ width: "75%", height: 4, borderRadius: 2, backgroundColor: "rgba(15,23,42,0.12)", marginBottom: 7 }} />

        {/* Mini Skills Chips */}
        <View style={{ flexDirection: "row", gap: 3, marginTop: 2 }}>
          <View style={{ width: 28, height: 7, borderRadius: 3, backgroundColor: "rgba(37,99,235,0.16)" }} />
          <View style={{ width: 22, height: 7, borderRadius: 3, backgroundColor: "rgba(37,99,235,0.16)" }} />
          <View style={{ width: 34, height: 7, borderRadius: 3, backgroundColor: "rgba(37,99,235,0.16)" }} />
        </View>

        {/* SATISFYING NEON LASER SCANNER BEAM */}
        <Animated.View
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: 22,
              zIndex: 10,
            },
            laserStyle,
          ]}
        >
          <LinearGradient
            colors={["transparent", "rgba(59,130,246,0.35)", "rgba(6,182,212,0.9)", "transparent"]}
            locations={[0, 0.4, 0.5, 1]}
            style={{ flex: 1 }}
          />
          {/* Laser bright leading line */}
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 10,
              height: 2,
              backgroundColor: "#22D3EE",
              shadowColor: "#06B6D4",
              shadowOpacity: 1,
              shadowRadius: 6,
              elevation: 4,
            }}
          />
        </Animated.View>
      </View>

      {/* 2. Middle: Glowing Stream of AI Data Particles flying from Resume to Site */}
      <View style={{ position: "absolute", zIndex: 6, alignItems: "center", justifyContent: "center" }}>
        {/* Animated Flying Sparkles Badge */}
        <MotiView
          from={{ opacity: 0.6, scale: 0.85, translateY: 4 }}
          animate={{ opacity: 1, scale: 1.05, translateY: -4 }}
          transition={{ type: "timing", duration: 1800, loop: true }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: "rgba(30,27,75,0.85)",
            borderWidth: 1,
            borderColor: "rgba(168,85,247,0.5)",
            shadowColor: "#8B5CF6",
            shadowOpacity: 0.45,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          <Feather name="zap" size={11} color="#A855F7" />
          <Text style={{ fontFamily: fonts.sans700, fontSize: 10, color: "#E9D5FF" }}>
            AI Extracting
          </Text>
        </MotiView>

        {/* Subtle arrow indicator */}
        <MotiView
          from={{ translateX: -6, opacity: 0.4 }}
          animate={{ translateX: 6, opacity: 1 }}
          transition={{ type: "timing", duration: 1200, loop: true }}
          style={{ marginTop: 6 }}
        >
          <Feather name="chevrons-right" size={20} color="#60A5FA" />
        </MotiView>
      </View>

      {/* 3. Right: High-Fidelity Miniature Web Browser with Published Site */}
      <Animated.View
        style={[
          {
            position: "absolute",
            right: 10,
            top: 28,
            width: 168,
            height: 204,
            borderRadius: 16,
            backgroundColor: "#0B0F19",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.16)",
            transform: [{ rotate: "3.5deg" }],
            shadowColor: "#3B82F6",
            shadowOpacity: 0.5,
            shadowRadius: 30,
            shadowOffset: { width: 0, height: 20 },
            elevation: 16,
            overflow: "hidden",
          },
          floatWebsiteStyle,
        ]}
      >
        {/* Browser Chrome Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 9,
            paddingVertical: 7,
            backgroundColor: "rgba(255,255,255,0.06)",
            borderBottomWidth: 1,
            borderBottomColor: "rgba(255,255,255,0.07)",
            gap: 6,
          }}
        >
          <View style={{ flexDirection: "row", gap: 3.5 }}>
            <View style={{ width: 5.5, height: 5.5, borderRadius: 3, backgroundColor: "#EF4444" }} />
            <View style={{ width: 5.5, height: 5.5, borderRadius: 3, backgroundColor: "#F59E0B" }} />
            <View style={{ width: 5.5, height: 5.5, borderRadius: 3, backgroundColor: "#10B981" }} />
          </View>
          {/* Mini URL pill */}
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 3,
              backgroundColor: "rgba(0,0,0,0.4)",
              borderRadius: 4,
              paddingHorizontal: 5,
              paddingVertical: 2,
            }}
          >
            <Feather name="lock" size={6} color="#60A5FA" />
            <Text style={{ fontFamily: fonts.mono500, fontSize: 6.5, color: "#93C5FD" }}>
              kavin.atbexo.com
            </Text>
          </View>
        </View>

        {/* Miniature Portfolio Web Page Preview (Sleek Dark Luxury Editorial) */}
        <View style={{ flex: 1, padding: 10, justifyContent: "space-between" }}>
          {/* Hero Row with live pill */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: "#3B82F6",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.4)",
                }}
              />
              <View>
                <Text style={{ fontFamily: fonts.sans800, fontSize: 8, color: "#fff" }}>
                  KAVIN BALAJI
                </Text>
                <Text style={{ fontFamily: fonts.sans400, fontSize: 5.5, color: "rgba(255,255,255,0.6)" }}>
                  Design Engineer
                </Text>
              </View>
            </View>

            {/* Pulsing Green LIVE Beacon */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 3.5,
                paddingHorizontal: 5,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: "rgba(16,185,129,0.18)",
                borderWidth: 0.8,
                borderColor: "rgba(16,185,129,0.4)",
              }}
            >
              <MotiView
                from={{ opacity: 0.4 }}
                animate={{ opacity: 1 }}
                transition={{ type: "timing", duration: 800, loop: true }}
                style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#10B981" }}
              />
              <Text style={{ fontFamily: fonts.mono500, fontSize: 6.5, color: "#34D399" }}>
                LIVE
              </Text>
            </View>
          </View>

          {/* Featured Project Showcase Card */}
          <LinearGradient
            colors={["rgba(59,130,246,0.22)", "rgba(30,58,138,0.15)"]}
            style={{
              borderRadius: 8,
              padding: 8,
              borderWidth: 1,
              borderColor: "rgba(59,130,246,0.3)",
              gap: 4,
            }}
          >
            <View style={{ width: "80%", height: 7, borderRadius: 2, backgroundColor: "#60A5FA" }} />
            <View style={{ width: "55%", height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.4)" }} />
            <View
              style={{
                height: 28,
                borderRadius: 4,
                backgroundColor: "rgba(0,0,0,0.3)",
                marginTop: 2,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text style={{ fontFamily: fonts.mono500, fontSize: 6, color: "rgba(255,255,255,0.7)" }}>
                ⚡ 12 Projects · 6 Awards
              </Text>
            </View>
          </LinearGradient>

          {/* Published Speed Pill */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 6,
              paddingVertical: 4,
              borderRadius: 6,
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <Text style={{ fontFamily: fonts.sans500, fontSize: 6.5, color: "rgba(255,255,255,0.7)" }}>
              SEO Optimized
            </Text>
            <Text style={{ fontFamily: fonts.mono500, fontSize: 6.5, color: "#34D399" }}>
              ⚡ 4.2s
            </Text>
          </View>
        </View>
      </Animated.View>

      {/* Floating Celebration Pill: "Ready in 10 Minutes" */}
      <MotiView
        from={{ opacity: 0, translateY: 14, scale: 0.9 }}
        animate={{ opacity: 1, translateY: 0, scale: 1 }}
        transition={{ type: "timing", duration: 600, delay: 500 }}
        style={{
          position: "absolute",
          bottom: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: "rgba(15,23,42,0.92)",
          borderWidth: 1,
          borderColor: "rgba(96,165,250,0.4)",
          shadowColor: "#3B82F6",
          shadowOpacity: 0.35,
          shadowRadius: 16,
          elevation: 10,
        }}
      >
        <Feather name="check-circle" size={13} color="#34D399" />
        <Text style={{ fontFamily: fonts.sans600, fontSize: 12, color: "#fff" }}>
          Published in 4.2s · Zero Coding
        </Text>
      </MotiView>
    </View>
  );
}

/* ==========================================================================
   SCENE 3: Living Neural Network & Connection Mesh (Screen 4 Highlight!)
   ========================================================================== */

interface NetworkNode {
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
  size: number;
  isCenter?: boolean;
  avatar?: any;
}

const NETWORK_NODES: NetworkNode[] = [
  {
    id: "you",
    name: "You",
    role: "Architect",
    x: 155,
    y: 135,
    size: 54,
    isCenter: true,
  },
  {
    id: "marcus",
    name: "Marcus Chen",
    role: "VC Partner",
    x: 48,
    y: 62,
    size: 42,
    avatar: require("../../../assets/portraits/img-1.png"),
  },
  {
    id: "sarah",
    name: "Sarah Lin",
    role: "VP Design",
    x: 260,
    y: 56,
    size: 42,
    avatar: require("../../../assets/portraits/img-2.png"),
  },
  {
    id: "alex",
    name: "Alex Rivera",
    role: "AI Founder",
    x: 36,
    y: 208,
    size: 40,
    avatar: require("../../../assets/portraits/img-3.png"),
  },
  {
    id: "priya",
    name: "Priya Sharma",
    role: "Tech Lead",
    x: 268,
    y: 202,
    size: 40,
    avatar: require("../../../assets/portraits/img-4.png"),
  },
  {
    id: "david",
    name: "David Kim",
    role: "Angel Investor",
    x: 155,
    y: 248,
    size: 38,
    avatar: require("../../../assets/portraits/img-5.png"),
  },
];

function NetworkScene() {
  const orbitAngle = useSharedValue(0);
  const photonProgress = useSharedValue(0);

  useEffect(() => {
    // Celestial subtle orbit rotation for ambient rings
    orbitAngle.value = withRepeat(
      withTiming(1, { duration: 22000, easing: Easing.linear }),
      -1,
      false
    );

    // Light energy packets traveling between nodes
    photonProgress.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.linear }),
      -1,
      false
    );
  }, [orbitAngle, photonProgress]);

  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbitAngle.value * 360}deg` }],
  }));

  const photon1Style = useAnimatedStyle(() => {
    // Center (155, 135) to Marcus (48, 62)
    const x = interpolate(photonProgress.value, [0, 1], [155, 48]);
    const y = interpolate(photonProgress.value, [0, 1], [135, 62]);
    const opacity = interpolate(photonProgress.value, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);
    return {
      transform: [{ translateX: x - 4 }, { translateY: y - 4 }],
      opacity,
    };
  });

  const photon2Style = useAnimatedStyle(() => {
    // Center (155, 135) to Sarah (260, 56)
    const x = interpolate(photonProgress.value, [0, 1], [155, 260]);
    const y = interpolate(photonProgress.value, [0, 1], [135, 56]);
    const opacity = interpolate(photonProgress.value, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);
    return {
      transform: [{ translateX: x - 4 }, { translateY: y - 4 }],
      opacity,
    };
  });

  const photon3Style = useAnimatedStyle(() => {
    // Sarah (260, 56) to Marcus (48, 62) — Mutual 2nd-degree link!
    const x = interpolate(photonProgress.value, [0, 1], [260, 48]);
    const y = interpolate(photonProgress.value, [0, 1], [56, 62]);
    const opacity = interpolate(photonProgress.value, [0, 0.15, 0.85, 1], [0, 1, 1, 0]);
    return {
      transform: [{ translateX: x - 4 }, { translateY: y - 4 }],
      opacity,
    };
  });

  return (
    <View style={{ width: 320, height: 300, alignItems: "center", justifyContent: "center" }}>
      {/* 1. Radar Ripples Expanding from Center User Node */}
      <MotiView
        from={{ opacity: 0.6, scale: 0.4 }}
        animate={{ opacity: 0, scale: 2.2 }}
        transition={{ type: "timing", duration: 3400, loop: true, easing: Easing.out(Easing.quad) }}
        style={{
          position: "absolute",
          width: 140,
          height: 140,
          borderRadius: 70,
          borderWidth: 1.5,
          borderColor: "rgba(59,130,246,0.45)",
          top: 135 - 70,
          left: 155 - 70,
        }}
      />
      <MotiView
        from={{ opacity: 0.5, scale: 0.4 }}
        animate={{ opacity: 0, scale: 2.7 }}
        transition={{ type: "timing", duration: 3400, delay: 1100, loop: true, easing: Easing.out(Easing.quad) }}
        style={{
          position: "absolute",
          width: 140,
          height: 140,
          borderRadius: 70,
          borderWidth: 1,
          borderColor: "rgba(6,182,212,0.35)",
          top: 135 - 70,
          left: 155 - 70,
        }}
      />

      {/* 2. Ambient Celestial Orbit Circles */}
      <Animated.View
        style={[
          {
            position: "absolute",
            width: 250,
            height: 250,
            borderRadius: 125,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.09)",
            borderStyle: "dashed",
            top: 135 - 125,
            left: 155 - 125,
          },
          orbitStyle,
        ]}
      />

      {/* 3. SVG Constellation Connection Lines */}
      <Svg width={310} height={290} style={{ position: "absolute", top: 0, left: 0 }}>
        <Defs>
          <SvgGradient id="beam" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#3B82F6" stopOpacity="0.5" />
            <Stop offset="100%" stopColor="#06B6D4" stopOpacity="0.2" />
          </SvgGradient>
          <SvgGradient id="mutual" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#A855F7" stopOpacity="0.6" />
            <Stop offset="100%" stopColor="#EC4899" stopOpacity="0.6" />
          </SvgGradient>
        </Defs>

        {/* Connections from center (155, 135) to all outer nodes */}
        {NETWORK_NODES.slice(1).map((n) => (
          <Line
            key={n.id}
            x1={155}
            y1={135}
            x2={n.x}
            y2={n.y}
            stroke="url(#beam)"
            strokeWidth={1.5}
            strokeDasharray="4, 3"
          />
        ))}

        {/* 2nd-Degree Mesh Connections (Who knows Who!) */}
        <Line
          x1={48}
          y1={62}
          x2={260}
          y2={56}
          stroke="url(#mutual)"
          strokeWidth={1.8}
        />
        <Line
          x1={36}
          y1={208}
          x2={155}
          y2={248}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={1}
        />
        <Line
          x1={268}
          y1={202}
          x2={155}
          y2={248}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={1}
        />
      </Svg>

      {/* 4. Traveling Glowing Photons along connections */}
      <Animated.View
        style={[
          {
            position: "absolute",
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: "#38BDF8",
            shadowColor: "#38BDF8",
            shadowOpacity: 1,
            shadowRadius: 8,
            elevation: 6,
          },
          photon1Style,
        ]}
      />
      <Animated.View
        style={[
          {
            position: "absolute",
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: "#22D3EE",
            shadowColor: "#06B6D4",
            shadowOpacity: 1,
            shadowRadius: 8,
            elevation: 6,
          },
          photon2Style,
        ]}
      />
      <Animated.View
        style={[
          {
            position: "absolute",
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: "#F472B6",
            shadowColor: "#EC4899",
            shadowOpacity: 1,
            shadowRadius: 8,
            elevation: 6,
          },
          photon3Style,
        ]}
      />

      {/* 5. Nodes with Authentic Photos, Ring Halos & Name Tags */}
      {NETWORK_NODES.map((n) => {
        if (n.isCenter) {
          return (
            <View
              key={n.id}
              style={{
                position: "absolute",
                left: n.x - n.size / 2,
                top: n.y - n.size / 2,
                width: n.size,
                height: n.size,
                borderRadius: n.size / 2,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: "#3B82F6",
                shadowOpacity: 0.8,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 8 },
                elevation: 12,
              }}
            >
              <LinearGradient
                colors={["#60A5FA", "#2563EB", "#1E40AF"]}
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: n.size / 2,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 2.5,
                  borderColor: "#FFFFFF",
                }}
              >
                <Feather name="user" size={20} color="#fff" />
                <View
                  style={{
                    position: "absolute",
                    bottom: -6,
                    paddingHorizontal: 6,
                    paddingVertical: 1.5,
                    borderRadius: 999,
                    backgroundColor: "#0F172A",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.3)",
                  }}
                >
                  <Text style={{ fontFamily: fonts.sans800, fontSize: 8, color: "#fff" }}>
                    YOU
                  </Text>
                </View>
              </LinearGradient>
            </View>
          );
        }

        return (
          <View
            key={n.id}
            style={{
              position: "absolute",
              left: n.x - n.size / 2,
              top: n.y - n.size / 2,
              alignItems: "center",
            }}
          >
            {/* Avatar Photo Frame */}
            <View
              style={{
                width: n.size,
                height: n.size,
                borderRadius: n.size / 2,
                borderWidth: 2,
                borderColor: "rgba(255,255,255,0.35)",
                overflow: "hidden",
                backgroundColor: "#1E293B",
                shadowColor: "#000",
                shadowOpacity: 0.35,
                shadowRadius: 10,
                elevation: 6,
              }}
            >
              {n.avatar ? (
                <Image
                  source={n.avatar}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="cover"
                />
              ) : (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: fonts.sans700, fontSize: 12, color: "#fff" }}>
                    {n.name.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>

            {/* Mini Name Pill */}
            <View
              style={{
                marginTop: 4,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: "rgba(15,23,42,0.88)",
                borderWidth: 0.8,
                borderColor: "rgba(255,255,255,0.14)",
                maxWidth: 82,
              }}
            >
              <Text
                numberOfLines={1}
                style={{ fontFamily: fonts.sans600, fontSize: 7.5, color: "#fff", textAlign: "center" }}
              >
                {n.name.split(" ")[0]}
              </Text>
            </View>
          </View>
        );
      })}

      {/* 6. Smart 2nd-Degree Intro Badge at the top (The Magic of BEXO!) */}
      <MotiView
        from={{ opacity: 0, translateY: -10, scale: 0.9 }}
        animate={{ opacity: 1, translateY: 0, scale: 1 }}
        transition={{ type: "timing", duration: 550, delay: 350 }}
        style={{
          position: "absolute",
          top: 0,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: "rgba(30,27,75,0.92)",
          borderWidth: 1,
          borderColor: "rgba(236,72,153,0.45)",
          shadowColor: "#EC4899",
          shadowOpacity: 0.4,
          shadowRadius: 14,
          elevation: 8,
        }}
      >
        <Feather name="share-2" size={11} color="#F472B6" />
        <Text style={{ fontFamily: fonts.sans600, fontSize: 11, color: "#FCE7F3" }}>
          2nd-Degree Intro: Marcus via Sarah
        </Text>
      </MotiView>
    </View>
  );
}
