import { createContext, forwardRef, useContext, useMemo } from "react";
import { type LayoutChangeEvent, type ScrollViewProps, type ViewStyle } from "react-native";
import Animated, {
  interpolate,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { feelOnUI } from "@/lib/haptics";
import { ease } from "@/lib/motion";

/**
 * Scroll choreography.
 *
 * A `ScrollStage` publishes its live scroll offset and viewport height on the
 * UI thread; anything inside can then react to the scroll without a single
 * bridge crossing. Two things are built on that:
 *
 * - `Reveal` — content that arrives as it enters the viewport rather than all
 *   at once on mount, with an optional haptic detent as each section locks in.
 * - `useStageScroll` — raw access, for screens that want to drive their own
 *   scroll-linked effects (a header that shrinks, a preview that recedes).
 *
 * `Reveal` measures itself with `onLayout`, which reports a position relative
 * to its parent — so keep `Reveal` a direct child of the stage's content
 * container, or its trigger point will be off by the wrapper's offset.
 */

type StageValue = {
  scrollY: SharedValue<number>;
  viewportH: SharedValue<number>;
};

const StageContext = createContext<StageValue | null>(null);

export function useStageScroll() {
  return useContext(StageContext);
}

/**
 * Create the stage's values in the screen instead of inside the scroll view.
 * Needed whenever something *outside* the scroller — a pinned header, a
 * floating control — has to react to the same offset.
 */
export function useStage(): StageValue {
  const scrollY = useSharedValue(0);
  const viewportH = useSharedValue(0);
  return useMemo(() => ({ scrollY, viewportH }), [scrollY, viewportH]);
}

export interface ScrollStageProps extends ScrollViewProps {
  children?: React.ReactNode;
  /** Share values owned by the screen, from `useStage()`. */
  stage?: StageValue;
}

export const ScrollStage = forwardRef<Animated.ScrollView, ScrollStageProps>(function ScrollStage(
  { children, stage, onLayout, onScroll, scrollEventThrottle = 16, ...rest },
  ref,
) {
  const own = useStage();
  const { scrollY, viewportH } = stage ?? own;

  const handler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const value = useMemo<StageValue>(() => ({ scrollY, viewportH }), [scrollY, viewportH]);

  return (
    <StageContext.Provider value={value}>
      <Animated.ScrollView
        ref={ref}
        onScroll={handler}
        scrollEventThrottle={scrollEventThrottle}
        onLayout={(e: LayoutChangeEvent) => {
          viewportH.value = e.nativeEvent.layout.height;
          onLayout?.(e);
        }}
        {...rest}
      >
        {children}
      </Animated.ScrollView>
    </StageContext.Provider>
  );
});

export interface RevealProps {
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** Position in the stagger queue for content already on screen at mount. */
  index?: number;
  /** Per-index stagger, in ms. */
  stagger?: number;
  /** Travel distance on the way in. */
  distance?: number;
  /** Start scale — a touch under 1 reads as arriving from behind the glass. */
  from?: number;
  /**
   * How far into the viewport the item's top edge must come before it plays.
   * Higher fires later; the default waits until it is comfortably in view.
   */
  threshold?: number;
  /** Fire a rate-limited haptic detent the moment this section locks in. */
  haptic?: boolean;
}

/**
 * Content that animates itself in as it crosses into view, and stays put once
 * it has. Deliberately one-way: replaying on the way back up turns a scroll
 * into a strobe.
 */
export function Reveal({
  children,
  style,
  index = 0,
  stagger = 70,
  distance = 24,
  from = 0.98,
  threshold = 90,
  haptic = false,
}: RevealProps) {
  const stage = useStageScroll();
  const reduced = useReducedMotion();

  const shown = useSharedValue(0);
  const top = useSharedValue(-1);
  const played = useSharedValue(false);

  const scrollY = stage?.scrollY;
  const viewportH = stage?.viewportH;

  // Outside a stage (or with reduced motion on) content is simply present.
  const inert = !stage || reduced;

  const trigger = useDerivedValue(() => {
    if (inert || !scrollY || !viewportH) return 0;
    if (top.value < 0 || viewportH.value === 0) return 0;
    const enters = scrollY.value + viewportH.value - threshold;
    return enters > top.value ? 1 : 0;
  }, [inert, threshold]);

  useAnimatedReaction(
    () => trigger.value,
    (visible) => {
      if (!visible || played.value) return;
      played.value = true;
      // Items already on screen at mount cascade; anything scrolled into view
      // later has earned its entrance and plays immediately.
      const scrolled = !scrollY || scrollY.value > 8;
      shown.value = withDelay(
        scrolled ? 0 : index * stagger,
        withSpring(1, { damping: 18, stiffness: 140, mass: 0.9 }),
      );
      // A detent belongs to a section the reader *scrolled* to. Firing during
      // the mount cascade would buzz the phone for content already on screen.
      if (haptic && scrolled) feelOnUI("tick");
    },
    [index, stagger, haptic],
  );

  const animated = useAnimatedStyle(() => {
    if (inert) return { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] };
    return {
      opacity: shown.value,
      transform: [
        { translateY: interpolate(shown.value, [0, 1], [distance, 0]) },
        { scale: interpolate(shown.value, [0, 1], [from, 1]) },
      ],
    };
  });

  return (
    <Animated.View
      style={[style, animated]}
      onLayout={(e) => {
        top.value = e.nativeEvent.layout.y;
      }}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Progress from 0 → 1 over the first `distance` points of scroll. The building
 * block for headers that condense and hero content that recedes as the page
 * moves under them.
 */
export function useScrollProgress(distance = 120, stage?: StageValue) {
  const fromContext = useStageScroll();
  const reduced = useReducedMotion();
  const scrollY = (stage ?? fromContext)?.scrollY;

  return useDerivedValue(() => {
    if (!scrollY || reduced) return 0;
    return Math.min(Math.max(scrollY.value, 0), distance) / distance;
  }, [distance, reduced]);
}

/**
 * A fade-and-lift bound to a shared progress value, for elements that should
 * step out of the way as the page scrolls (`hide`) or arrive with it.
 */
export function useRecede(progress: SharedValue<number>, opts?: { scale?: number; lift?: number; fade?: number }) {
  const scale = opts?.scale ?? 0.94;
  const lift = opts?.lift ?? 10;
  const fade = opts?.fade ?? 0.35;

  return useAnimatedStyle(() => ({
    opacity: 1 - progress.value * fade,
    transform: [
      { translateY: -progress.value * lift },
      { scale: 1 - progress.value * (1 - scale) },
    ],
  }));
}

/** Collapse a fixed-height element to nothing as progress runs 0 → 1. */
export function useCollapseHeight(progress: SharedValue<number>, height: number) {
  return useAnimatedStyle(() => ({
    height: height * (1 - progress.value),
    opacity: withTiming(progress.value > 0.85 ? 0 : 1, { duration: 160, easing: ease.soft }),
  }));
}
