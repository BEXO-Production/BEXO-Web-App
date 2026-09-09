import { useEffect, useState } from "react";
import { Pop, RevealText, Rise } from "@/components/ui/Motion";
import { Image, Keyboard, Pressable, Text, TextInput, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { LegalSheet } from "@/components/LegalSheet";
import { LightSweep } from "@/components/ui/Effects";
import { sendWidgetOtp } from "@/lib/msg91-bridge";
import { normalizePhone } from "@/lib/auth-api";
import { describeError } from "@/lib/errors";
import { brand } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { useOverlay } from "@/lib/overlay-context";
import { fonts } from "@/lib/fonts";

const LOGO = require("../../assets/brand/bexo-logo.png");

/**
 * "03 Phone" — the first real step. One field, a glowing focus ring, and a
 * plain statement of how the code arrives.
 *
 * Note the channel copy: the canvas says WhatsApp, but this build sends
 * through MSG91 (SMS first, WhatsApp as fallback), so the copy states what
 * actually happens. Promising a channel we don't send on is the one place
 * where matching the mockup word-for-word would be a lie to the user.
 */
export default function PhoneScreen() {
  const { c } = useTheme();
  const { wipe } = useOverlay();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [legal, setLegal] = useState<"terms" | "privacy" | null>(null);

  const digits = phone.replace(/\D/g, "");
  const isValid = digits.length === 10;

  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [glow]);

  const fieldGlow = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(glow.value, [0, 1], [0.1, 0.22]),
    shadowRadius: interpolate(glow.value, [0, 1], [6, 12]),
  }));

  const handlePhoneChange = (value: string) => {
    const next = value.replace(/\D/g, "").slice(0, 10);
    setPhone(next);
    if (next.length === 10) {
      Keyboard.dismiss();
    }
  };

  const submit = async () => {
    Keyboard.dismiss();
    if (!isValid) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { reqId } = await sendWidgetOtp(normalizePhone(digits));
      wipe(() =>
        router.push({ pathname: "/(auth)/verify", params: { phone: digits, reqId: reqId ?? "" } }),
      );
    } catch (err) {
      setError(describeError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const formatted = digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;

  return (
    <Screen style={{ paddingHorizontal: 0 }} edges={["bottom"]}>
      <LinearGradient
        colors={["rgba(37,211,102,0.14)", "transparent"]}
        start={{ x: 0.85, y: 0 }}
        end={{ x: 0.2, y: 0.6 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 360 }}
      />

      <Pressable onPress={Keyboard.dismiss} style={{ flex: 1, paddingHorizontal: 22, paddingTop: 58, paddingBottom: 26 }}>
        <Pop>
          <Image source={LOGO} style={{ width: 38, height: 38, marginTop: 14, marginBottom: 28 }} resizeMode="contain" />
        </Pop>

        <RevealText
          delay={50}
          style={{
            fontFamily: fonts.sans700,
            fontSize: 10.5,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: c.accentSoft,
          }}
        >
          Step 1 of 9
        </RevealText>

        <RevealText
          delay={120}
          duration={620}
          y={18}
          from={0.98}
          style={{
            marginTop: 10,
            fontFamily: fonts.serif600,
            fontSize: 34,
            lineHeight: 39,
            letterSpacing: -0.9,
            color: c.ink,
          }}
        >
          What’s your{"\n"}
          <Text style={{ fontFamily: fonts.serif600Italic, color: c.accentSoft }}>number?</Text>
        </RevealText>

        <RevealText
          delay={220}
          duration={600}
          style={{ marginTop: 14, fontFamily: fonts.sans400, fontSize: 15.5, lineHeight: 24, color: c.muted }}
        >
          A verification code confirms it’s you. This number becomes your sign-in.
        </RevealText>

        <Rise delay={320} duration={600} style={{ marginTop: 30, gap: 9 }}>
          <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, letterSpacing: 0.2, color: c.muted }}>
            Mobile number
          </Text>

          <Animated.View
            style={[
              {
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                minHeight: 56,
                paddingHorizontal: 16,
                borderRadius: 14,
                backgroundColor: c.panel,
                borderWidth: 1,
                borderColor: c.accentEdge,
                shadowColor: brand.accent,
                shadowOffset: { width: 0, height: 0 },
                elevation: 3,
              },
              fieldGlow,
            ]}
          >
            <Text style={{ fontFamily: fonts.sans500, fontSize: 15, color: c.ink }}>+91</Text>
            <View style={{ width: 1, height: 22, backgroundColor: c.border }} />
            <TextInput
              value={formatted}
              onChangeText={handlePhoneChange}
              placeholder="98765 43210"
              placeholderTextColor={c.faint}
              keyboardType="number-pad"
              autoFocus
              style={{
                flex: 1,
                fontFamily: fonts.sans500,
                fontSize: 17,
                letterSpacing: 0.8,
                color: c.ink,
                paddingVertical: 16,
              }}
            />
            {isValid ? (
              <Pop duration={340}>
                <Feather name="check" size={16} color={c.success} />
              </Pop>
            ) : null}
          </Animated.View>

          {error ? (
            <Text style={{ fontFamily: fonts.sans500, fontSize: 12.5, color: c.danger }}>{error}</Text>
          ) : null}
        </Rise>

        <View style={{ flex: 1, minHeight: 20 }} />

        <Rise delay={420} duration={500} style={{ gap: 12, paddingTop: 22 }}>
          <Pressable
            onPress={submit}
            disabled={!isValid || loading}
            style={{
              minHeight: 56,
              borderRadius: 999,
              overflow: "hidden",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              backgroundColor: isValid ? c.cta : c.deep,
            }}
          >
            {isValid ? <LightSweep width={340} height={56} delay={2400} duration={2400} /> : null}
            <Feather name="arrow-right" size={18} color={isValid ? c.onCta : c.faint} />
            <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: isValid ? c.onCta : c.faint }}>
              {loading ? "Sending…" : "Continue"}
            </Text>
          </Pressable>

          <Text style={{ textAlign: "center", fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}>
            By continuing you agree to our{" "}
            <Text style={{ color: c.accentSoft }} onPress={() => setLegal("terms")}>
              Terms
            </Text>{" "}
            ·{" "}
            <Text style={{ color: c.accentSoft }} onPress={() => setLegal("privacy")}>
              Privacy Policy
            </Text>
          </Text>
        </Rise>
      </Pressable>

      <LegalSheet which={legal} onClose={() => setLegal(null)} />
    </Screen>
  );
}
