import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { PersonSheet } from "@/components/PersonSheet";
import { fonts } from "@/lib/fonts";
import { ease } from "@/lib/motion";
import { brand } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { useProfile } from "@/lib/use-profile";
import { connectionColor, personInitials, useConnections, type ConnectionEdge } from "@/lib/connections-api";
import { projectPoint, spherePoint } from "@/lib/network-data";

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The projection plane the graph draws into: 560×560, centred on "you". */
const PLANE = 560;
const CENTER = PLANE / 2;
const RADIUS = 210;
const NODE_BOX = 44;

type Filter = "all" | "accepted" | "pending";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "accepted", label: "Connected" },
  { key: "pending", label: "Pending" },
];

/**
 * "08 Network" — the real connection graph, on a fibonacci sphere projected by
 * hand with a perspective divide so node size, opacity and paint order all
 * read off the same depth value. Drag orbits, pinch dollies, and a slow
 * constant spin runs whenever nothing else is happening.
 *
 * Nodes are the people this account has actually scanned or been scanned by
 * (`GET /api/connections`) — there is no placeholder roster here. An empty
 * network shows an empty globe with a way to go scan someone, not fake people.
 */
export default function Network() {
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { data: profile } = useProfile();
  const { data, isLoading, refetch, isRefetching } = useConnections();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canvasHeight, setCanvasHeight] = useState(0);

  const edges = data?.connections ?? [];
  const visibleEdges = useMemo(
    () => (filter === "all" ? edges : edges.filter((e) => e.status === filter)),
    [edges, filter],
  );
  const count = edges.length;
  const acceptedCount = edges.filter((e) => e.status === "accepted").length;

  // Expo web has no worklet runtime, so shared-value writes never reach the
  // projection. There the globe starts fully built at its resting zoom — a
  // still, correct sphere rather than one that never fills in.
  const animatable = Platform.OS !== "web";

  const rotY = useSharedValue(0.55);
  const rotX = useSharedValue(0.28);
  const zoom = useSharedValue(animatable ? 1.6 : 1);
  const built = useSharedValue(animatable ? 0 : visibleEdges.length);
  const spinning = useSharedValue(1);

  const planeScale = Math.min(width, height * 0.62) / PLANE;

  const basePoints = useMemo(
    () => visibleEdges.map((_, i) => spherePoint(i, Math.max(visibleEdges.length, 1))),
    [visibleEdges],
  );

  /** Opens tight, then dollies back as connections arrive in one batch. */
  useEffect(() => {
    built.value = 0;
    if (!animatable || visibleEdges.length === 0) {
      built.value = visibleEdges.length;
      return;
    }
    const timer = setTimeout(() => {
      built.value = visibleEdges.length;
      zoom.value = withTiming(1, { duration: 900, easing: ease.screen });
      Haptics.selectionAsync().catch(() => {});
    }, 260);
    return () => clearTimeout(timer);
  }, [animatable, visibleEdges.length, built, zoom]);

  useFrameCallback(() => {
    if (spinning.value > 0.5) rotY.value += 0.0022;
  }, animatable);

  useEffect(() => {
    spinning.value = selectedId === null ? 1 : 0;
  }, [selectedId, spinning]);

  const startRotY = useSharedValue(0);
  const startRotX = useSharedValue(0);
  const startZoom = useSharedValue(1);

  const pan = Gesture.Pan()
    .onStart(() => {
      spinning.value = 0;
      startRotY.value = rotY.value;
      startRotX.value = rotX.value;
    })
    .onUpdate((e) => {
      rotY.value = startRotY.value + e.translationX * 0.0072;
      rotX.value = Math.max(-0.85, Math.min(0.85, startRotX.value - e.translationY * 0.0072));
    })
    .onEnd(() => {
      spinning.value = 1;
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      spinning.value = 0;
      startZoom.value = zoom.value;
    })
    .onUpdate((e) => {
      zoom.value = Math.max(0.55, Math.min(2.4, startZoom.value * e.scale));
    })
    .onEnd(() => {
      spinning.value = 1;
    });

  const gesture = Gesture.Simultaneous(pan, pinch);

  const setZoom = (next: number) => {
    zoom.value = withTiming(Math.max(0.6, Math.min(2.1, next)), { duration: 280, easing: ease.soft });
  };

  const selected = selectedId ? (edges.find((e) => e.id === selectedId) ?? null) : null;
  const myInitials = personInitials({ name: profile?.user?.name ?? null, handle: profile?.profile?.handle ?? null });

  return (
    <View style={{ flex: 1, backgroundColor: dark ? "#070912" : "#EDEBE4" }}>
      <LinearGradient
        colors={dark ? ["rgba(47,107,255,0.16)", "transparent"] : ["rgba(47,107,255,0.10)", "transparent"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 420 }}
      />

      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ gap: 2 }}>
          <Text style={{ fontFamily: fonts.serif600, fontSize: 24, letterSpacing: -0.4, color: dark ? "#fff" : "#16171B" }}>
            Network
          </Text>
          <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: dark ? "rgba(255,255,255,0.5)" : "rgba(22,23,27,0.55)" }}>
            {count === 0
              ? "No connections yet"
              : `${acceptedCount} connected${count > acceptedCount ? ` · ${count - acceptedCount} pending` : ""}`}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/(app)/profile")}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: dark ? "rgba(255,255,255,0.08)" : "rgba(22,23,27,0.06)",
            borderWidth: 1,
            borderColor: dark ? "rgba(255,255,255,0.14)" : "rgba(22,23,27,0.14)",
            overflow: "hidden",
          }}
        >
          {profile?.user?.photoUrl ? (
            <Image
              source={{ uri: profile.user.photoUrl }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          ) : (
            <Text style={{ fontFamily: fonts.sans700, fontSize: 13, color: dark ? "#fff" : "#16171B" }}>
              {myInitials}
            </Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 7, paddingHorizontal: 20, paddingTop: 11, paddingBottom: 2 }}
        style={{ flexGrow: 0 }}
      >
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <Pressable
              key={key}
              onPress={() => setFilter(key)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 1,
                backgroundColor: dark
                  ? active
                    ? "rgba(255,255,255,0.16)"
                    : "rgba(255,255,255,0.06)"
                  : active
                    ? "#16171B"
                    : "rgba(255,255,255,0.7)",
                borderColor: dark
                  ? active
                    ? "rgba(255,255,255,0.32)"
                    : "rgba(255,255,255,0.12)"
                  : active
                    ? "#16171B"
                    : "rgba(22,23,27,0.14)",
              }}
            >
              <Text
                style={{
                  fontFamily: fonts.sans600,
                  fontSize: 12,
                  color: dark ? (active ? "#fff" : "rgba(255,255,255,0.6)") : active ? "#fff" : "rgba(22,23,27,0.65)",
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={brand.accentBright} />
        </View>
      ) : visibleEdges.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 40 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: dark ? "rgba(255,255,255,0.08)" : "rgba(22,23,27,0.06)",
            }}
          >
            <Feather name="share-2" size={26} color={brand.accentBright} />
          </View>
          <Text style={{ fontFamily: fonts.serif600, fontSize: 19, color: dark ? "#fff" : "#16171B", textAlign: "center" }}>
            {count === 0 ? "No connections yet" : "Nothing in this filter"}
          </Text>
          <Text
            style={{
              fontFamily: fonts.sans400,
              fontSize: 13,
              lineHeight: 20,
              textAlign: "center",
              color: dark ? "rgba(255,255,255,0.6)" : "rgba(22,23,27,0.6)",
            }}
          >
            {count === 0
              ? "Scan someone's BEXO card from the Scan tab, or share yours, to start building your network."
              : "Try a different filter."}
          </Text>
        </View>
      ) : (
        <GestureDetector gesture={gesture}>
          <View style={{ flex: 1, overflow: "hidden" }} onLayout={(e) => setCanvasHeight(e.nativeEvent.layout.height)}>
            <View
              style={{
                position: "absolute",
                left: (width - PLANE * planeScale) / 2,
                top: Math.max(0, (canvasHeight - PLANE * planeScale) / 2),
                width: PLANE,
                height: PLANE,
                transform: [{ scale: planeScale }],
                transformOrigin: "top left",
              }}
            >
              <Svg width={PLANE} height={PLANE} style={{ position: "absolute" }}>
                <SpokeEdges edges={visibleEdges} points={basePoints} rotY={rotY} rotX={rotX} zoom={zoom} built={built} dark={dark} />
              </Svg>

              {visibleEdges.map((edge, i) => (
                <Node
                  key={edge.id}
                  index={i}
                  point={basePoints[i]}
                  photoUrl={edge.person.photoUrl}
                  initials={personInitials(edge.person)}
                  firstName={(edge.person.name ?? edge.person.handle ?? "").split(" ")[0] ?? ""}
                  color={connectionColor(edge)}
                  faded={edge.status === "pending"}
                  rotY={rotY}
                  rotX={rotX}
                  zoom={zoom}
                  built={built}
                  dark={dark}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setSelectedId(edge.id);
                  }}
                />
              ))}

              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  zIndex: 200,
                  left: CENTER - 28,
                  top: CENTER - 28,
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  borderWidth: 2,
                  borderColor: dark ? "rgba(255,255,255,0.5)" : "#fff",
                }}
              >
                <LinearGradient
                  colors={[brand.accentBright, brand.accent]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                />
                {profile?.user?.photoUrl ? (
                  <Image
                    source={{ uri: profile.user.photoUrl }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: "#fff" }}>YOU</Text>
                )}
              </View>
            </View>
          </View>
        </GestureDetector>
      )}

      <View style={{ position: "absolute", right: 12, top: insets.top + 96, gap: 8 }}>
        <ZoomButton icon="plus" onPress={() => setZoom(zoom.value + 0.24)} />
        <ZoomButton icon="minus" onPress={() => setZoom(zoom.value - 0.24)} />
        <ZoomButton icon="crosshair" onPress={() => setZoom(1)} />
        <ZoomButton icon="refresh-cw" onPress={() => refetch()} spinning={isRefetching} />
      </View>

      <PersonSheet edge={selected} onClose={() => setSelectedId(null)} />
    </View>
  );
}

function ZoomButton({
  icon,
  onPress,
  spinning,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  spinning?: boolean;
}) {
  const { dark } = useTheme();
  return (
    <Pressable
      accessibilityLabel={icon}
      onPress={onPress}
      disabled={spinning}
      style={{
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: dark ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.7)",
        borderWidth: 1,
        borderColor: dark ? "rgba(255,255,255,0.16)" : "rgba(22,23,27,0.12)",
        opacity: spinning ? 0.5 : 1,
      }}
    >
      <Feather name={icon} size={icon === "crosshair" ? 15 : 16} color={dark ? "#fff" : "#16171B"} />
    </Pressable>
  );
}

type Shared = { value: number };
type Point = { x: number; y: number; z: number };

function Node({
  index,
  point,
  photoUrl,
  initials,
  firstName,
  color,
  faded,
  rotY,
  rotX,
  zoom,
  built,
  dark,
  onPress,
}: {
  index: number;
  point: Point;
  photoUrl?: string | null;
  initials: string;
  firstName: string;
  color: string;
  faded: boolean;
  rotY: Shared;
  rotX: Shared;
  zoom: Shared;
  built: Shared;
  dark: boolean;
  onPress: () => void;
}) {
  const wrap = useAnimatedStyle(() => {
    "worklet";
    const q = projectPoint(point, RADIUS, rotY.value, rotX.value, zoom.value, CENTER);
    const t = Math.max(0, Math.min(1, (RADIUS - q.z) / (RADIUS * 2)));
    const size = 22 + 20 * t;
    const arrived = index < built.value;
    return {
      transform: [
        { translateX: q.sx - NODE_BOX / 2 },
        { translateY: q.sy - NODE_BOX / 2 },
        { scale: withTiming(arrived ? size / NODE_BOX : 0.2, { duration: 520 }) },
      ],
      opacity: withTiming(!arrived ? 0 : faded ? 0.55 : 0.6 + 0.4 * t, { duration: 420 }),
      zIndex: Math.round(t * 100),
    };
  });

  const labelStyle = useAnimatedStyle(() => {
    "worklet";
    const q = projectPoint(point, RADIUS, rotY.value, rotX.value, zoom.value, CENTER);
    const t = Math.max(0, Math.min(1, (RADIUS - q.z) / (RADIUS * 2)));
    return { opacity: withTiming(t > 0.62 ? 1 : 0, { duration: 200 }) };
  });

  return (
    <Animated.View style={[{ position: "absolute", width: NODE_BOX, alignItems: "center", gap: 3 }, wrap]}>
      <Pressable
        onPress={onPress}
        style={{
          width: NODE_BOX,
          height: NODE_BOX,
          borderRadius: NODE_BOX / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: dark ? "rgba(255,255,255,0.07)" : "#fff",
          borderWidth: 1.5,
          borderStyle: faded ? "dashed" : "solid",
          borderColor: color,
          shadowColor: color,
          shadowOpacity: 0.35,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          overflow: "hidden",
        }}
      >
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        ) : (
          <Text style={{ fontFamily: fonts.sans700, fontSize: 12, color: dark ? "#fff" : "#16171B" }}>{initials}</Text>
        )}
      </Pressable>
      <Animated.Text
        numberOfLines={1}
        style={[
          { fontFamily: fonts.sans600, fontSize: 9.5, color: dark ? "rgba(255,255,255,0.68)" : "rgba(22,23,27,0.62)" },
          labelStyle,
        ]}
      >
        {firstName}
      </Animated.Text>
    </Animated.View>
  );
}

/** Every connection's line back to "you", batched into one path. */
function SpokeEdges({
  edges,
  points,
  rotY,
  rotX,
  zoom,
  built,
  dark,
}: {
  edges: ConnectionEdge[];
  points: Point[];
  rotY: Shared;
  rotX: Shared;
  zoom: Shared;
  built: Shared;
  dark: boolean;
}) {
  const animatedProps = useAnimatedProps(() => {
    "worklet";
    let d = "";
    for (let i = 0; i < points.length; i++) {
      if (i >= built.value) continue;
      const q = projectPoint(points[i], RADIUS, rotY.value, rotX.value, zoom.value, CENTER);
      d += `M ${CENTER} ${CENTER} L ${q.sx.toFixed(1)} ${q.sy.toFixed(1)} `;
    }
    return { d };
  });

  return (
    <AnimatedPath
      animatedProps={animatedProps}
      fill="none"
      stroke={dark ? "rgba(255,255,255,0.18)" : "rgba(22,23,27,0.16)"}
      strokeWidth={0.9}
      strokeLinecap="round"
    />
  );
}
