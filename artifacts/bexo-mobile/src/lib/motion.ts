import { Easing, Keyframe } from "react-native-reanimated";

/**
 * The canvas uses exactly two easing curves everywhere: an "expo out" for
 * screen entrances (`cubic-bezier(.16,1,.3,1)`) and a slightly softer one for
 * element choreography (`cubic-bezier(.22,1,.36,1)`).
 */
export const ease = {
  screen: Easing.bezier(0.16, 1, 0.3, 1),
  soft: Easing.bezier(0.22, 1, 0.36, 1),
  linear: Easing.linear,
  inOut: Easing.bezier(0.4, 0, 0.2, 1),
  swipeOut: Easing.bezier(0.7, 0, 0.84, 0),
} as const;

export const duration = {
  screen: 420,
  rise: 500,
  word: 620,
  pop: 400,
  sheet: 400,
  toast: 1900,
  flip: 680,
  wipeCover: 340,
  wipeReveal: 420,
  wipeTotal: 1000,
} as const;

/** `bxScreen` — fade + 16px slide-up + scale 0.988 → 1 over 420ms. */
export const bxScreen = () =>
  new Keyframe({
    0: { opacity: 0, transform: [{ translateY: 16 }, { scale: 0.988 }] },
    100: {
      opacity: 1,
      transform: [{ translateY: 0 }, { scale: 1 }],
      easing: ease.screen,
    },
  }).duration(duration.screen);

/** `bxRise` — opacity 0 → 1 with a 14px lift. The workhorse stagger. */
export const bxRise = (delay = 0, ms: number = duration.rise) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ translateY: 14 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }], easing: ease.soft },
  })
    .duration(ms)
    .delay(delay);

/** `bxWordIn` — headline reveal: 18px lift + a touch of scale, slower. */
export const bxWordIn = (delay = 0, ms: number = duration.word) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ translateY: 18 }, { scale: 0.98 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: ease.soft },
  })
    .duration(ms)
    .delay(delay);

/** `bxPop` — 0.86 → 1.04 → 1 overshoot, for checkmarks and confirmations. */
export const bxPop = (delay = 0, ms: number = duration.pop) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ scale: 0.86 }] },
    60: { opacity: 1, transform: [{ scale: 1.04 }], easing: ease.soft },
    100: { opacity: 1, transform: [{ scale: 1 }], easing: ease.soft },
  })
    .duration(ms)
    .delay(delay);

/** `bxSlideLeft` — list rows arriving from the right, staggered. */
export const bxSlideLeft = (delay = 0, ms: number = 420) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ translateX: 22 }] },
    100: { opacity: 1, transform: [{ translateX: 0 }], easing: ease.soft },
  })
    .duration(ms)
    .delay(delay);

/** `bxSheet` — bottom sheet rising with a 6px overshoot. */
export const bxSheet = () =>
  new Keyframe({
    0: { opacity: 0, transform: [{ translateY: 600 }] },
    62: { opacity: 1, transform: [{ translateY: -6 }], easing: ease.screen },
    100: { opacity: 1, transform: [{ translateY: 0 }], easing: ease.soft },
  }).duration(duration.sheet);

/** `bxFade` — plain cross-fade, used for scrims. */
export const bxFade = (delay = 0, ms: number = 240) =>
  new Keyframe({
    0: { opacity: 0 },
    100: { opacity: 1, easing: ease.inOut },
  })
    .duration(ms)
    .delay(delay);

/** `bxNodeIn` — network node arriving: scale 0.5 → 1. */
export const bxNodeIn = (delay = 0) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ scale: 0.5 }] },
    100: { opacity: 1, transform: [{ scale: 1 }], easing: ease.screen },
  })
    .duration(460)
    .delay(delay);
