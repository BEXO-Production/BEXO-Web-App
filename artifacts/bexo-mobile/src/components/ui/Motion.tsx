import { useEffect } from "react";
import { type TextStyle, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { duration as timing, ease } from "@/lib/motion";

/**
 * Entrance animations, driven by an explicit shared value rather than
 * Reanimated's `entering=` layout-animation subsystem.
 *
 * The layout-animation path proved unreliable here: an entering animation that
 * fails to resolve leaves its element parked on the *first* keyframe, which for
 * a fade means an invisible screen — the worst failure mode a screen entrance
 * can have. A plain `withTiming` on a shared value always lands on its final
 * value, so a screen can never be left blank by its own intro.
 */

type RevealProps = {
  delay?: number;
  duration?: number;
  /** Distance to travel on the way in. */
  y?: number;
  x?: number;
  /** Starting scale; 1 disables the scale leg. */
  from?: number;
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
  onLayout?: React.ComponentProps<typeof Animated.View>["onLayout"];
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
};

function useReveal(delay: number, ms: number, y: number, x: number, from: number) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: ms, easing: ease.soft }));
  }, [progress, delay, ms]);

  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * y },
      { translateX: (1 - progress.value) * x },
      { scale: from + (1 - from) * progress.value },
    ],
  }));
}

/** `bxRise` — the workhorse: fade up 14px. */
export function Rise({
  delay = 0,
  duration: ms = timing.rise,
  y = 14,
  x = 0,
  from = 1,
  style,
  children,
  onLayout,
  pointerEvents,
}: RevealProps) {
  const animated = useReveal(delay, ms, y, x, from);
  return (
    <Animated.View style={[style, animated]} onLayout={onLayout} pointerEvents={pointerEvents}>
      {children}
    </Animated.View>
  );
}

/** `bxScreen` — 16px lift plus a 0.988 → 1 scale, 420ms. */
export function ScreenIn({ style, children }: { style?: ViewStyle | ViewStyle[]; children?: React.ReactNode }) {
  const animated = useReveal(0, timing.screen, 16, 0, 0.988);
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** `bxWordIn` — the headline reveal: 18px lift, slight scale, slower. */
export function WordIn(props: RevealProps) {
  return <Rise y={18} from={0.98} duration={timing.word} {...props} />;
}

/** `bxPop` — scale up from 0.86 for checkmarks and confirmations. */
export function Pop(props: RevealProps) {
  return <Rise y={0} from={0.86} duration={timing.pop} {...props} />;
}

/** `bxSlideLeft` — list rows arriving from the right. */
export function SlideLeft(props: RevealProps) {
  return <Rise y={0} x={22} duration={420} {...props} />;
}

/** A plain cross-fade, for scrims and overlays. */
export function FadeInView(props: RevealProps) {
  return <Rise y={0} duration={240} {...props} />;
}

/** The text equivalent of `Rise`, so headlines animate without a wrapper box. */
export function RevealText({
  delay = 0,
  duration: ms = timing.rise,
  y = 14,
  from = 1,
  style,
  numberOfLines,
  children,
}: {
  delay?: number;
  duration?: number;
  y?: number;
  from?: number;
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
  children?: React.ReactNode;
}) {
  const animated = useReveal(delay, ms, y, 0, from);
  return (
    <Animated.Text style={[style, animated]} numberOfLines={numberOfLines}>
      {children}
    </Animated.Text>
  );
}
