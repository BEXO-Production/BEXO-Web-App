import { type ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { ScreenIn } from "@/components/ui/Motion";
import { useTheme } from "@/lib/theme-context";

/**
 * Every screen enters the same way — `bxScreen`: fade + 16px slide-up + a
 * 0.988 → 1 scale over 420ms on the expo-out curve. Backgrounds read from the
 * theme so the in-app dark switch is a single token swap.
 */
export function Screen({
  children,
  style,
  edges = ["top", "bottom"],
  animate = true,
  background,
}: {
  children: ReactNode;
  style?: ViewStyle;
  /** Screens that own their own top padding (per the canvas's 58px) opt out of the top inset. */
  edges?: Edge[];
  animate?: boolean;
  background?: string;
}) {
  const { c } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: background ?? c.paper }} edges={edges}>
      {animate ? (
        <ScreenIn style={[{ flex: 1 }, style as ViewStyle]}>{children}</ScreenIn>
      ) : (
        <View style={[{ flex: 1 }, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}
