import { type ReactNode } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop, Circle } from "react-native-svg";

const WIDTH = 174;
const HEIGHT = 256;
const RADIUS = 34;
const BEZEL = 7;
const SCREEN_RADIUS = RADIUS - BEZEL * 0.6;

/**
 * A realistic device bezel, hand-built in SVG (react-native-svg — already a
 * dependency) rather than a bundled photo: a raster phone mockup at this
 * size either looks soft when scaled or bloats the bundle, and every asset
 * pack we could vendor ships as a web `<img>`, not an RN-safe local file.
 * This gives the same brushed-metal-and-glass read at any density for free.
 *
 * `children` renders inside the actual glass area, absolutely positioned and
 * clipped to `SCREEN_RADIUS` — nothing painted here can escape the screen
 * bounds the way the previous free-floating card animation did.
 */
export function PhoneBezel({ children }: { children?: ReactNode }) {
  return (
    <View style={{ width: WIDTH, height: HEIGHT }}>
      <Svg width={WIDTH} height={HEIGHT} style={{ position: "absolute" }}>
        <Defs>
          <LinearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#E2E3E6" />
            <Stop offset="0.22" stopColor="#A9ABB0" />
            <Stop offset="0.48" stopColor="#6D6E73" />
            <Stop offset="0.68" stopColor="#C7C9CC" />
            <Stop offset="1" stopColor="#8B8D92" />
          </LinearGradient>
          <LinearGradient id="glass" x1="0" y1="0" x2="0.3" y2="1">
            <Stop offset="0" stopColor="#0C1626" />
            <Stop offset="0.62" stopColor="#040507" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={WIDTH} height={HEIGHT} rx={RADIUS} fill="url(#metal)" />
        <Rect
          x={BEZEL}
          y={BEZEL}
          width={WIDTH - BEZEL * 2}
          height={HEIGHT - BEZEL * 2}
          rx={SCREEN_RADIUS}
          fill="url(#glass)"
        />
        {/* dynamic island */}
        <Rect x={WIDTH / 2 - 23} y={9} width={46} height={14} rx={8} fill="#000" />
        {/* side buttons */}
        <Rect x={-2} y={64} width={2} height={22} rx={1} fill="#7C7D82" />
        <Rect x={-2} y={94} width={2} height={38} rx={1} fill="#7C7D82" />
        <Rect x={WIDTH} y={100} width={2} height={46} rx={1} fill="#7C7D82" />
      </Svg>

      {/* screen glow, matching the canvas's bxScreenGlow */}
      <View
        style={{
          position: "absolute",
          left: BEZEL,
          top: BEZEL,
          width: WIDTH - BEZEL * 2,
          height: HEIGHT - BEZEL * 2,
          borderRadius: SCREEN_RADIUS,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}

export const PHONE_BEZEL_SIZE = { width: WIDTH, height: HEIGHT, bezel: BEZEL };
