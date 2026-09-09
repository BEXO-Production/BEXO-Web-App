import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { feel } from "@/lib/haptics";
import { fonts } from "@/lib/fonts";
import { ease } from "@/lib/motion";
import { useTheme } from "@/lib/theme-context";

/** Minimal local shape of what we read from React Navigation's bottom-tabs
 * `tabBar` render prop — `@react-navigation/bottom-tabs` is only a
 * transitive dependency (via expo-router), not a declared one, so this
 * avoids importing its types directly. */
interface TabBarProps {
  state: {
    index: number;
    routes: { key: string; name: string }[];
  };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: {
    emit: (event: { type: "tabPress"; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
}

/** Icons per the design canvas's nav bar (NAV BAR section) — note these
 * differ from generic tab-bar defaults: Network uses "share-2" (not
 * git-branch), Scan uses "maximize" (not camera), Website uses "layout"
 * (not globe). Order matches `tabs.home/network/scan/website/profile`. */
const TAB_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  home: "home",
  network: "share-2",
  scan: "maximize",
  portfolio: "layout",
  profile: "user",
};

/** The 5 real tabs, in order — everything else registered on the
 * navigator (Update, Inbox, Analytics, ...) is a pushed screen with
 * `href: null` and must never appear here. */
const VISIBLE_TABS = ["home", "network", "scan", "portfolio", "profile"];

/**
 * Floating pill nav bar, ported from the design canvas exactly: a single
 * dark (#15171b) rounded-pill bar floating above the content (not
 * edge-to-edge, not translucent, not screen-dependent like the default tab
 * bar this replaced) — the active tab grows wider and reveals its label,
 * inactive tabs collapse to icon-only. See NAV BAR / `tab()` helper in the
 * .dc.html source for the exact flex/color/shadow values mirrored below.
 */
export function FloatingTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { c, dark } = useTheme();
  if (!state?.routes || !descriptors) return null;
  const routes = state.routes.filter((r) => r && VISIBLE_TABS.includes(r.name) && descriptors[r.key]);

  return (
    <View
      pointerEvents="box-none"
      style={{
        paddingHorizontal: 14,
        paddingBottom: Math.max(insets.bottom, 12) + 12,
      }}
    >
      {/* Seamless gradient fade so content scrolling under the floating pill fades gracefully to the screen background */}
      <LinearGradient
        colors={[
          "transparent",
          dark ? "rgba(5, 7, 15, 0.72)" : "rgba(243, 241, 236, 0.72)",
          c.paper,
        ]}
        locations={[0, 0.45, 1]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: Math.max(insets.bottom, 12) + 78,
        }}
        pointerEvents="none"
      />

      <View
        style={{
          backgroundColor: "#15171b",
          borderRadius: 999,
          padding: 6,
          flexDirection: "row",
          alignItems: "center",
          gap: 2,
          borderWidth: 1,
          borderColor: dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
          shadowColor: "#000",
          shadowOpacity: dark ? 0.6 : 0.35,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 10 },
          elevation: 12,
        }}
      >
        {routes.map((route) => {
          const routeIndex = state.routes.findIndex((r) => r.key === route.key);
          const focused = state.index === routeIndex;
          const { options } = descriptors[route.key];
          const label = typeof options.title === "string" ? options.title : route.name;

          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (event.defaultPrevented) return;
            if (focused) {
              // Re-tapping the tab you are on is not a navigation — a soft
              // acknowledgement beats silence and beats a full selection tick.
              feel.lift();
              return;
            }
            feel.select();
            navigation.navigate(route.name);
          };

          return (
            <TabPill
              key={route.key}
              focused={focused}
              label={label}
              icon={TAB_ICONS[route.name] ?? "circle"}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

function TabPill({
  focused,
  label,
  icon,
  onPress,
}: {
  focused: boolean;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
}) {
  const pressed = useSharedValue(0);

  const pillStyle = useAnimatedStyle(() => ({
    flex: withTiming(focused ? 1.5 : 1, { duration: 320, easing: ease.soft }),
  }));
  const labelStyle = useAnimatedStyle(() => ({
    maxWidth: withTiming(focused ? 90 : 0, { duration: 280, easing: ease.soft }),
    opacity: withTiming(focused ? 1 : 0, { duration: 200 }),
  }));
  // The whole pill sinks under the finger; the icon leads it slightly, which
  // reads as the glyph being what you actually pushed.
  const sinkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.06 * pressed.value }],
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(focused ? 1 : 0.94, { damping: 12, stiffness: 260 }) }],
  }));

  return (
    <Animated.View style={[pillStyle, sinkStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          pressed.value = withSpring(1, { damping: 20, stiffness: 480, mass: 0.5 });
        }}
        onPressOut={() => {
          pressed.value = withSpring(0, { damping: 13, stiffness: 320, mass: 0.6 });
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: focused }}
        style={{
          minHeight: 44,
          borderRadius: 999,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          overflow: "hidden",
          backgroundColor: focused ? undefined : "transparent",
        }}
      >
        {focused ? (
          <LinearGradient
            colors={["#5B8CFF", "#2F6BFF"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 999,
              shadowColor: "#2F6BFF",
              shadowOpacity: 0.6,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }}
          />
        ) : null}
        <Animated.View style={iconStyle}>
          <Feather name={icon} size={18} color={focused ? "#fff" : "rgba(255,255,255,0.55)"} />
        </Animated.View>
        <Animated.Text
          numberOfLines={1}
          style={[
            { fontFamily: fonts.sans700, fontSize: 12.5, color: focused ? "#fff" : "rgba(255,255,255,0.55)" },
            labelStyle,
          ]}
        >
          {label}
        </Animated.Text>
      </Pressable>
    </Animated.View>
  );
}
