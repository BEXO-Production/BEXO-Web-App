import { useEffect, useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { brand } from "@/lib/theme";
import { ease } from "@/lib/motion";

/**
 * The payoff.
 *
 * A burst of paper thrown up and out, then pulled down by gravity — each piece
 * on its own parabola, its own spin, its own delay. The physics matter more
 * than the particle count: confetti that merely fades outward reads as a
 * screensaver, confetti that *falls* reads as something having happened.
 *
 * Fully deterministic per index, so a re-render never reshuffles a burst
 * that is already in flight.
 */

const DEFAULT_COLORS = [brand.accentBright, brand.mint, "#F59E0B", "#E11D48", brand.accentPale];

/** A cheap, stable hash — same index always yields the same piece. */
function seeded(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export interface CelebrationProps {
  /** Flip to true to fire. Re-arms whenever it goes false → true. */
  play: boolean;
  /** Extra colours mixed into the default palette — pass the live accent. */
  tint?: string;
  count?: number;
  /** Where the burst originates, as a fraction of the overlay's height. */
  originY?: number;
  duration?: number;
}

export function Celebration({
  play,
  tint,
  count = 18,
  originY = 0.5,
  duration = 1500,
}: CelebrationProps) {
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();

  const palette = useMemo(() => (tint ? [tint, ...DEFAULT_COLORS] : DEFAULT_COLORS), [tint]);

  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        // Fan the launch angles across a 140° arc centred straight up, so the
        // burst opens like a cone rather than a uniform explosion.
        const spread = (seeded(i, 1) - 0.5) * 2;
        return {
          id: i,
          dx: spread * width * 0.42,
          launch: 90 + seeded(i, 2) * 130,
          gravity: 340 + seeded(i, 3) * 220,
          spin: (seeded(i, 4) - 0.5) * 900,
          size: 5 + seeded(i, 5) * 6,
          round: seeded(i, 6) > 0.55,
          delay: seeded(i, 7) * 160,
          color: palette[i % palette.length],
        };
      }),
    [count, width, palette],
  );

  if (reduced) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map(({ id, ...piece }) => (
        <Piece key={id} play={play} originY={originY} duration={duration} {...piece} />
      ))}
    </View>
  );
}

function Piece({
  play,
  dx,
  launch,
  gravity,
  spin,
  size,
  round,
  delay,
  color,
  originY,
  duration,
}: {
  play: boolean;
  dx: number;
  launch: number;
  gravity: number;
  spin: number;
  size: number;
  round: boolean;
  delay: number;
  color: string;
  originY: number;
  duration: number;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    if (!play) {
      t.value = 0;
      return;
    }
    // Linear in time — the arc comes from the parabola below, not the easing.
    // Easing the clock too would flatten the fall into a drift.
    t.value = withDelay(delay, withTiming(1, { duration, easing: ease.linear }));
  }, [play, t, delay, duration]);

  const animated = useAnimatedStyle(() => {
    const p = t.value;
    return {
      opacity: p === 0 ? 0 : interpolate(p, [0, 0.06, 0.72, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: dx * p },
        { translateY: -launch * p + gravity * p * p },
        { rotate: `${spin * p}deg` },
        { scale: interpolate(p, [0, 0.12, 1], [0.4, 1, 0.85]) },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: "50%",
          top: `${originY * 100}%`,
          width: round ? size : size * 0.7,
          height: round ? size : size * 1.5,
          borderRadius: round ? size : 1.5,
          backgroundColor: color,
        },
        animated,
      ]}
    />
  );
}
