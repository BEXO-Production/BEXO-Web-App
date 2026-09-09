import { Pressable, Text } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { Orbit } from "@/components/ui/Loaders";
import { feel } from "@/lib/haptics";
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
        scale.value = withSpring(0.97, { damping: 20, stiffness: 480, mass: 0.5 });
        // On touch-down, not on release — the primary action of a screen should
        // answer the finger before the handler has done anything.
        if (!inactive) feel.commit();
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 13, stiffness: 320, mass: 0.6 });
      }}
      onPress={onPress}
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
        <Orbit size={22} color={c.faint} thickness={2} />
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
