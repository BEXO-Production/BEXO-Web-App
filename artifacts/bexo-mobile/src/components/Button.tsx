import { ActivityIndicator, Pressable, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/theme-context";

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary";
}

export function Button({ label, onPress, disabled, loading, variant = "primary" }: ButtonProps) {
  const { c } = useTheme();
  const isPrimary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className={`h-14 items-center justify-center rounded-pill ${
        isPrimary ? "bg-cta" : "bg-transparent border border-borderStrong"
      } ${disabled || loading ? "opacity-50" : ""}`}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? c.onCta : c.ink} />
      ) : (
        <Text
          className={`text-base font-semibold ${isPrimary ? "text-white" : "text-ink"}`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
