import { type ReactNode } from "react";
import { MotiView } from "moti";
import { Easing } from "react-native-reanimated";

/**
 * The canvas's `bxScreen` entrance, ported onto Moti — the React Native
 * counterpart to Framer Motion (same author/lineage, same declarative
 * `from`/`animate`/`transition` API; on web Moti renders through Framer
 * Motion itself, so this genuinely is "Framer Motion" wherever the app runs
 * in a browser, and its Reanimated-driven equivalent on iOS/Android):
 *   from { opacity:0; translateY(16px) scale(.988) }
 *   to   { opacity:1; none }
 *   .42s cubic-bezier(.16,1,.3,1)
 *
 * The CSS also blurs 3px on entry; React Native has no cheap per-view blur, so
 * the opacity/translate/scale trio carries the motion instead.
 */
const BX_SCREEN_EASING = Easing.bezier(0.16, 1, 0.3, 1);

export function ScreenTransition({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: object;
}) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 16, scale: 0.988 }}
      animate={{ opacity: 1, translateY: 0, scale: 1 }}
      transition={{ type: "timing", duration: 420, delay, easing: BX_SCREEN_EASING }}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </MotiView>
  );
}

/**
 * `bxRise` — the stagger the canvas applies to cards within a screen:
 * from { opacity:0; translateY(14px) } to { opacity:1; none }.
 */
export function Rise({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: object;
}) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 14 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 500, delay, easing: Easing.bezier(0.22, 1, 0.36, 1) }}
      style={style}
    >
      {children}
    </MotiView>
  );
}
