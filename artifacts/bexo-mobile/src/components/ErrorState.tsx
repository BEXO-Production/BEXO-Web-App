import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Rise } from "@/components/ui/Motion";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";
import { describeError } from "@/lib/errors";

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  /** "screen" is the canvas's full "14 Error" layout; "inline" fits inside a scroll view. */
  variant?: "screen" | "inline";
}

/**
 * The single error surface for the app, matching the "14 Error" screen in the
 * design canvas: 74px danger-tinted ring, Playfair headline, muted body, pill CTA.
 * Adds the API's request id when there is one, so a support ticket maps to logs.
 */
export function ErrorState({ error, onRetry, variant = "screen" }: ErrorStateProps) {
  const { c } = useTheme();
  const { title, message, requestId, isOffline } = describeError(error);
  const isScreen = variant === "screen";

  return (
    <Rise
      duration={420}  style={
        isScreen
          ? {
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              paddingHorizontal: 32,
              paddingVertical: 40,
            }
          : {
              alignItems: "center",
              gap: 12,
              padding: 24,
              borderRadius: 22,
              backgroundColor: c.panel,
              borderWidth: 1,
              borderColor: c.border,
            }
      }
    >
      <View
        style={{
          width: isScreen ? 74 : 56,
          height: isScreen ? 74 : 56,
          borderRadius: isScreen ? 37 : 28,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(217,56,67,0.08)",
          borderWidth: 1,
          borderColor: "rgba(217,56,67,0.34)",
        }}
      >
        <Feather
          name={isOffline ? "wifi-off" : "alert-triangle"}
          size={isScreen ? 28 : 22}
          color={c.danger}
        />
      </View>

      <Text
        style={{
          fontFamily: fonts.serif600,
          fontSize: isScreen ? 25 : 20,
          color: c.ink,
          textAlign: "center",
        }}
      >
        {title}
      </Text>

      <Text
        style={{
          fontFamily: fonts.sans400,
          fontSize: 14,
          lineHeight: 21,
          color: c.muted,
          textAlign: "center",
        }}
      >
        {message}
      </Text>

      {requestId ? (
        <Text
          style={{
            fontFamily: fonts.mono500,
            fontSize: 11,
            color: c.faint,
            textAlign: "center",
          }}
        >
          Reference: {requestId}
        </Text>
      ) : null}

      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onRetry();
          }}
          style={{
            minHeight: 48,
            paddingHorizontal: 26,
            borderRadius: 999,
            backgroundColor: c.cta,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 8,
          }}
        >
          <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: c.onCta }}>
            Try again
          </Text>
        </Pressable>
      ) : null}
    </Rise>
  );
}
