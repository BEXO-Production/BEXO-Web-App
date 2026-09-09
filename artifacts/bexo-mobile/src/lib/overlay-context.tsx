import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Rise } from "@/components/ui/Motion";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { fonts } from "@/lib/fonts";
import { duration, ease } from "@/lib/motion";
import { brand } from "@/lib/theme";

/**
 * Two app-wide overlays that sit above every screen: the toast pill and the
 * route wipe.
 *
 * The wipe is a deliberate brand beat, not a spinner — the canvas reserves it
 * for onboarding/auth hops and for a simulated slow network, never for a plain
 * tab switch (see `transition()` and the ONBOARD_ROUTES guard in the canvas).
 */

type OverlayValue = {
  toast: (message: string) => void;
  /** Cover the screen, run `fn` at full coverage, then sweep away. */
  wipe: (fn: () => void) => void;
};

const OverlayContext = createContext<OverlayValue>({ toast: () => {}, wipe: (fn) => fn() });

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [wiping, setWiping] = useState(false);
  const cover = useSharedValue(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wipeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const toast = useCallback((next: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setMessage(next);
    toastTimer.current = setTimeout(() => setMessage(null), duration.toast);
  }, []);

  const wipe = useCallback(
    (fn: () => void) => {
      wipeTimers.current.forEach(clearTimeout);
      wipeTimers.current = [];
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      setWiping(true);
      cover.value = 0;
      cover.value = withSequence(
        withTiming(1, { duration: duration.wipeCover, easing: ease.screen }),
        withDelay(200, withTiming(0, { duration: duration.wipeReveal, easing: ease.swipeOut })),
      );

      wipeTimers.current.push(setTimeout(fn, 460));
      wipeTimers.current.push(setTimeout(() => setWiping(false), duration.wipeTotal));
    },
    [cover],
  );

  const value = useMemo<OverlayValue>(() => ({ toast, wipe }), [toast, wipe]);

  const coverStyle = useAnimatedStyle(() => ({
    opacity: cover.value,
    transform: [{ translateY: (1 - cover.value) * 10 }],
  }));

  const markStyle = useAnimatedStyle(() => ({
    opacity: cover.value * 0.95,
    transform: [{ scale: 0.85 + cover.value * 0.15 }],
  }));

  return (
    <OverlayContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}

      {message ? (
        <Rise
          duration={260}  pointerEvents="none"
          style={{
            position: "absolute",
            left: 20,
            right: 20,
            bottom: 124,
            zIndex: 95,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 16,
            backgroundColor: "rgba(16,16,20,0.94)",
            shadowColor: "#101014",
            shadowOpacity: 0.34,
            shadowRadius: 34,
            shadowOffset: { width: 0, height: 16 },
            elevation: 12,
          }}
        >
          <Feather name="check-circle" size={17} color={brand.accentBright} />
          <Text style={{ fontFamily: fonts.sans600, fontSize: 13.5, color: "rgba(255,255,255,0.95)" }}>
            {message}
          </Text>
        </Rise>
      ) : null}

      {wiping ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { zIndex: 999, backgroundColor: "rgba(8,9,13,0.94)", alignItems: "center", justifyContent: "center" },
            coverStyle,
          ]}
        >
          <Animated.View style={markStyle}>
            <Image
              source={require("../../assets/brand/bexo-logo.png")}
              style={{ width: 38, height: 38 }}
              resizeMode="contain"
            />
          </Animated.View>
        </Animated.View>
      ) : null}
      </View>
    </OverlayContext.Provider>
  );
}

export function useOverlay() {
  return useContext(OverlayContext);
}

/** Convenience: the exact easing used by the wipe, for screens that echo it. */
export const wipeEasing = Easing.bezier(0.16, 1, 0.3, 1);
