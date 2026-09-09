import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface CtaButtonProps {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Feather.glyphMap;
  disabled?: boolean;
  loading?: boolean;
}

/**
 * The primary pill CTA from the design canvas: 56px tall, fully rounded,
 * ink background, and — per `verifyBtnStyle` there — a flat `deep`/`faint`
 * disabled state rather than a dimmed enabled one.
 */
export function CtaButton({ label, onPress, icon, disabled, loading }: CtaButtonProps) {
  const { c } = useTheme();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const inactive = disabled || loading;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 18, stiffness: 320 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 18, stiffness: 320 });
      }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={[
        {
          minHeight: 56,
          borderRadius: 999,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          backgroundColor: inactive ? c.deep : c.cta,
          borderWidth: inactive ? 1 : 0,
          borderColor: c.border,
        },
        animatedStyle,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.faint} />
      ) : (
        <>
          {icon ? (
            <Feather name={icon} size={18} color={inactive ? c.faint : c.onCta} />
          ) : null}
          <Text
            style={{
              fontFamily: fonts.sans700,
              fontSize: 15,
              color: inactive ? c.faint : c.onCta,
            }}
          >
            {label}
          </Text>
        </>
      )}
    </AnimatedPressable>
  );
}
