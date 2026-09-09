import { Pressable, Text, View, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { fonts } from "@/lib/fonts";
import { ease } from "@/lib/motion";
import { brand, radii } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";

/** 46×28 track, 22px knob — the canvas's `switchStyles()`. */
export function Switch({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  const { c } = useTheme();
  const p = useDerivedValue(() => withTiming(value ? 1 : 0, { duration: 220, easing: ease.soft }), [value]);

  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * 18 }] }));
  const track = useAnimatedStyle(() => ({
    backgroundColor: p.value > 0.5 ? brand.accent : c.deep,
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onToggle();
      }}
      hitSlop={8}
    >
      <Animated.View
        style={[{ width: 46, height: 28, borderRadius: 999, padding: 3, justifyContent: "center" }, track]}
      >
        <Animated.View
          style={[
            {
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: "#fff",
              shadowColor: "#000",
              shadowOpacity: 0.25,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
            },
            knob,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

/** The 40px-tall selectable pill used for gender, pronouns, hiring options. */
export function Chip({
  label,
  active,
  onPress,
  fontFamily,
  fontSize = 13.5,
}: {
  label: string;
  active: boolean;
  onPress?: () => void;
  fontFamily?: string;
  fontSize?: number;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={{
        minHeight: 40,
        paddingHorizontal: 16,
        borderRadius: radii.pill,
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: active ? c.accent : c.border,
        backgroundColor: active ? c.accentWash : c.panel,
      }}
    >
      <Text
        style={{
          fontFamily: fontFamily ?? fonts.sans600,
          fontSize,
          color: active ? c.accentSoft : c.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** The smaller filter/suggestion pill (`pill()` in the canvas). */
export function FilterPill({
  label,
  active,
  onPress,
  fontFamily,
}: {
  label: string;
  active: boolean;
  onPress?: () => void;
  fontFamily?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 9,
        paddingHorizontal: 15,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: active ? c.accentEdge : c.border,
        backgroundColor: active ? c.accentWash : c.panel,
      }}
    >
      <Text
        style={{
          fontFamily: fontFamily ?? fonts.sans600,
          fontSize: 12.5,
          color: active ? c.accentSoft : c.muted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Thin rounded track with the blue gradient fill used app-wide. */
export function ProgressBar({
  pct,
  height = 8,
  trackColor,
  style,
}: {
  pct: number;
  height?: number;
  trackColor?: string;
  style?: ViewStyle;
}) {
  const { c } = useTheme();
  return (
    <View
      style={[
        { height, borderRadius: height, backgroundColor: trackColor ?? c.deep, overflow: "hidden" },
        style,
      ]}
    >
      <LinearGradient
        colors={[brand.accentBright, brand.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", borderRadius: height }}
      />
    </View>
  );
}

/** All-caps 10.5px section label with 2px tracking. */
export function SectionLabel({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { c } = useTheme();
  return (
    <Text
      style={[
        {
          fontFamily: fonts.sans700,
          fontSize: 10.5,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: c.faint,
        },
        style as never,
      ]}
    >
      {children}
    </Text>
  );
}

/** The 38px circular back button that heads every pushed screen. */
export function CircleIconButton({
  icon,
  onPress,
  size = 38,
  iconSize = 18,
  accessibilityLabel,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress?: () => void;
  size?: number;
  iconSize?: number;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: c.panel,
        borderWidth: 1,
        borderColor: c.border,
      }}
    >
      <Feather name={icon} size={iconSize} color={c.muted} />
    </Pressable>
  );
}
