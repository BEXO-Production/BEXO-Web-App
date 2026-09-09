import { useEffect } from "react";
import { Pressable, type PressableProps, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { feel } from "@/lib/haptics";
import { ease } from "@/lib/motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Press physics.
 *
 * Two springs, deliberately mismatched: the press-in is fast and slightly
 * over-damped so the surface arrives under the finger immediately, and the
 * release is looser so it rebounds with a hint of overshoot. Matching them
 * makes a button feel like a fading opacity; mismatching them makes it feel
 * like something with mass.
 */
const PRESS_IN = { damping: 20, stiffness: 480, mass: 0.5 } as const;
const PRESS_OUT = { damping: 13, stiffness: 320, mass: 0.6 } as const;

/** How far a surface travels under the finger, by its apparent size. */
const SQUEEZE = {
  /** Full-width cards and rows — big surfaces barely move. */
  card: 0.985,
  /** Buttons, pills, chips. */
  control: 0.96,
  /** Icon buttons and swatches, which need a visible squeeze to register. */
  icon: 0.9,
} as const;

type Weight = keyof typeof SQUEEZE;

/** The haptic verbs a press may fire — `false` opts out entirely. */
type PressFeel = "tap" | "select" | "commit" | "lift" | "pop" | "snap" | false;

export interface PressProps extends Omit<PressableProps, "style"> {
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** Apparent size of the surface — decides how far it sinks. */
  weight?: Weight;
  /** Which feel to fire on touch-down. Defaults to a light tap. */
  haptic?: PressFeel;
  /** Dim slightly while held, on top of the scale. */
  dim?: boolean;
  /** Override the resting scale — used to grow a selected item. */
  restScale?: number;
}

/**
 * The app's tappable surface. Springs under the finger and fires its haptic on
 * *press-in*, not on press: the feedback should land with the touch, not after
 * the handler has run.
 */
export function Press({
  children,
  style,
  weight = "control",
  haptic = "tap",
  dim = false,
  restScale = 1,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: PressProps) {
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);
  const rest_ = useSharedValue(restScale);

  useEffect(() => {
    rest_.value = withSpring(restScale, PRESS_OUT);
  }, [restScale, rest_]);

  const animated = useAnimatedStyle(() => {
    const target = SQUEEZE[weight];
    const sink = 1 - (1 - target) * pressed.value;
    return {
      transform: [{ scale: reduced ? rest_.value : rest_.value * sink }],
      opacity: dim ? 1 - 0.25 * pressed.value : 1,
    };
  });

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={(e) => {
        pressed.value = withSpring(1, PRESS_IN);
        if (haptic && !disabled) feel[haptic]();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withSpring(0, PRESS_OUT);
        onPressOut?.(e);
      }}
      style={[style as ViewStyle, animated]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * A one-shot "this just became true" flourish: 1 → 1.18 → 1 on a spring.
 * Drives selection checkmarks and swatches, where the state change itself
 * should have a physical beat rather than appearing instantly.
 */
export function usePopOnChange(trigger: unknown, amount = 0.18) {
  const reduced = useReducedMotion();
  const pop = useSharedValue(0);
  const first = useSharedValue(true);

  useEffect(() => {
    if (first.value) {
      first.value = false;
      return;
    }
    pop.value = withSequence(
      withTiming(1, { duration: 130, easing: ease.soft }),
      withSpring(0, { damping: 9, stiffness: 260, mass: 0.5 }),
    );
  }, [trigger, pop, first]);

  return useAnimatedStyle(() => ({
    transform: [{ scale: reduced ? 1 : 1 + pop.value * amount }],
  }));
}

/**
 * A slow breath for anything that wants to be noticed without shouting —
 * the unsaved-changes dot, a live indicator.
 */
export function useBreathe(active: boolean, amount = 0.12, ms = 1400) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);

  useEffect(() => {
    if (!active || reduced) {
      p.value = withTiming(0, { duration: 220 });
      return;
    }
    p.value = withTiming(1, { duration: ms, easing: ease.soft });
    const id = setInterval(() => {
      p.value = withSequence(
        withTiming(0, { duration: ms / 2, easing: ease.soft }),
        withTiming(1, { duration: ms / 2, easing: ease.soft }),
      );
    }, ms);
    return () => clearInterval(id);
  }, [active, reduced, ms, p]);

  return useAnimatedStyle(() => ({
    transform: [{ scale: 1 + p.value * amount }],
    opacity: 0.65 + p.value * 0.35,
  }));
}
