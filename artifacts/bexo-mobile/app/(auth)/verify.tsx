import { useEffect, useRef, useState } from "react";
import { RevealText } from "@/components/ui/Motion";
import { AppState, Keyboard, Platform, Pressable, Text, TextInput, View } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Screen } from "@/components/Screen";
import { CircleIconButton } from "@/components/ui/Controls";
import { useAuth } from "@/lib/auth-context";
import { verifyWidgetOtp, retryWidgetOtp } from "@/lib/msg91-bridge";
import { describeError } from "@/lib/errors";
import { useTheme } from "@/lib/theme-context";
import { useOverlay } from "@/lib/overlay-context";
import { fonts } from "@/lib/fonts";

/** Matches the MSG91 OTP Widget's configured OTP length (Widget Settings). */
const OTP_LENGTH = 4;

/** "04 VERIFY" screen, ported from the design canvas. */
export default function VerifyScreen() {
  const { phone, reqId: initialReqId } = useLocalSearchParams<{ phone: string; reqId?: string }>();
  const { confirmWidgetToken } = useAuth();
  const { c } = useTheme();
  const { wipe } = useOverlay();
  const inputRef = useRef<TextInput>(null);
  const [otp, setOtp] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  // MSG91 can rotate the reqId on retry; keep whichever is current so
  // verify always targets the right challenge.
  const reqIdRef = useRef(initialReqId || undefined);
  // Mirrors `otp`/`loading` for the clipboard-watcher effect below, which
  // intentionally only subscribes once (see its own comment) and so can't
  // close over fresh state directly.
  const otpRef = useRef(otp);
  const loadingRef = useRef(loading);
  otpRef.current = otp;
  loadingRef.current = loading;

  const shakeX = useSharedValue(0);
  const cursorOpacity = useSharedValue(1);

  useEffect(() => {
    cursorOpacity.value = withRepeat(withSequence(withTiming(0, { duration: 500 }), withTiming(1, { duration: 500 })), -1, true);
  }, [cursorOpacity]);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));
  const cursorStyle = useAnimatedStyle(() => ({ opacity: cursorOpacity.value }));

  const handleVerify = async (code: string) => {
    if (code.length !== OTP_LENGTH || loadingRef.current) return;
    Keyboard.dismiss();
    inputRef.current?.blur();
    setError("");
    setLoading(true);
    try {
      // MSG91 verifies the OTP itself and hands back a short-lived widget
      // token; our server independently confirms that token before it will
      // ever mint a BEXO session from it (see widget-verify route).
      const widgetToken = await verifyWidgetOtp(code, reqIdRef.current);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const { hasCompletedOnboarding } = await confirmWidgetToken(widgetToken);
      wipe(() => router.replace(hasCompletedOnboarding ? "/(app)/home" : "/(auth)/onboarding-wizard"));
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      shakeX.value = withSequence(
        withTiming(-10, { duration: 45 }),
        withTiming(10, { duration: 90 }),
        withTiming(-8, { duration: 90 }),
        withTiming(6, { duration: 70 }),
        withTiming(0, { duration: 60 }),
      );
      setError(describeError(err).message);
      setOtp("");
      setSelection({ start: 0, end: 0 });
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await retryWidgetOtp(reqIdRef.current);
      setResent(true);
      setTimeout(() => setResent(false), 2500);
    } catch (err) {
      setError(describeError(err).message);
    }
  };

  const handleChange = (text: string) => {
    const next = text.replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (next.length > otp.length) Haptics.selectionAsync();
    setOtp(next);
    setSelection({ start: next.length, end: next.length });
    setError("");
    if (next.length === OTP_LENGTH) {
      Keyboard.dismiss();
      inputRef.current?.blur();
      handleVerify(next);
    }
  };

  // Tapping a specific box moves the cursor there: onto the existing digit
  // (so typing overwrites it) if the box is filled, or to the end of what's
  // typed so far otherwise — you can't place a cursor past the text you
  // actually have.
  const handleBoxPress = (index: number) => {
    inputRef.current?.focus();
    const pos = Math.min(index, otp.length);
    setSelection({ start: pos, end: index < otp.length ? pos + 1 : pos });
  };

  /**
   * "Auto paste": Expo Go can't read incoming SMS directly (that needs a
   * native module, which would force a dev-client build — see
   * msg91-bridge.ts's comment on the same tradeoff). The practical
   * equivalent within Expo Go: when the user switches back to BEXO after
   * copying the code from their Messages app, check the clipboard right
   * then and fill it in automatically. Runs once per foreground return, only
   * fills an otherwise-empty field, and only acts on a code it hasn't
   * already tried — so it can never clobber someone mid-edit or resubmit a
   * stale code on every app switch.
   */
  useEffect(() => {
    let lastTried = "";
    const checkClipboard = async () => {
      try {
        const text = await Clipboard.getStringAsync();
        const match = text.match(/\b\d{4}\b/);
        if (!match || match[0] === lastTried || otpRef.current.length > 0) return;
        lastTried = match[0];
        setOtp(match[0]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Keyboard.dismiss();
        inputRef.current?.blur();
        handleVerify(match[0]);
      } catch {
        // Clipboard access can be denied/unavailable — silently skip; typing
        // the code by hand still works.
      }
    };
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkClipboard();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pretty = phone?.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;

  return (
    <Screen style={{ paddingHorizontal: 0 }} edges={["bottom"]}>
      <Pressable onPress={Keyboard.dismiss} style={{ flex: 1, paddingHorizontal: 22, paddingTop: 58, paddingBottom: 26 }}>
        <View style={{ marginTop: 10, marginBottom: 26, alignSelf: "flex-start" }}>
          <CircleIconButton icon="arrow-left" accessibilityLabel="Go back" onPress={() => router.back()} />
        </View>

        <RevealText
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
          delay={80} duration={620} y={18} from={0.98}  style={{
            marginTop: 10,
            fontFamily: fonts.serif600,
            fontSize: 34,
            lineHeight: 39,
            letterSpacing: -0.9,
            color: c.ink,
          }}
        >
          Enter the code
        </RevealText>
        <RevealText
          delay={160}  style={{ marginTop: 12, fontFamily: fonts.sans400, fontSize: 15, lineHeight: 23, color: c.muted }}
        >
          Sent by SMS to +91 {pretty}.
        </RevealText>

        {/* One hidden input drives the visual cells — native RN has no
            multi-box OTP field. Controlled `selection` lets a tap on any box
            move the real cursor there, so editing a specific digit works
            exactly like a native multi-box input would. */}
        <Animated.View style={[{ marginTop: 30 }, shakeStyle]}>
          <TextInput
            ref={inputRef}
            value={otp}
            selection={selection}
            onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
            onChangeText={handleChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            autoFocus
            textContentType="oneTimeCode"
            autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
            style={{ position: "absolute", opacity: 0, height: 58, width: "100%" }}
          />
          <View style={{ flexDirection: "row", gap: 9 }}>
            {Array.from({ length: OTP_LENGTH }).map((_, i) => {
              const char = otp[i];
              const isCursor = focused && !char && i === Math.min(selection.start, OTP_LENGTH - 1) && otp.length === i;
              return (
                <Pressable key={i} onPress={() => handleBoxPress(i)} style={{ flex: 1 }}>
                  <View
                    style={{
                      height: 58,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: c.panel,
                      borderWidth: 1,
                      borderColor: char ? c.accentEdge : focused && isCursor ? c.accentEdge : c.border,
                      ...(char
                        ? {
                            shadowColor: c.accent,
                            shadowOpacity: 0.18,
                            shadowRadius: 7,
                            shadowOffset: { width: 0, height: 0 },
                            elevation: 3,
                          }
                        : null),
                    }}
                  >
                    {char ? (
                      <RevealText
                        duration={160} y={0}  style={{ fontFamily: fonts.sans700, fontSize: 23, color: c.ink }}
                      >
                        {char}
                      </RevealText>
                    ) : isCursor ? (
                      <Animated.View
                        style={[
                          { width: 2, height: 24, borderRadius: 1, backgroundColor: c.accentSoft },
                          cursorStyle,
                        ]}
                      />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {error ? (
          <RevealText
            duration={200} y={0}  style={{
              marginTop: 14,
              fontFamily: fonts.sans500,
              fontSize: 12.5,
              color: c.danger,
            }}
          >
            {error}
          </RevealText>
        ) : null}

        <Pressable onPress={handleResend} style={{ marginTop: 18, alignSelf: "flex-start" }}>
          <Text style={{ fontFamily: fonts.sans400, fontSize: 12.5, color: c.faint }}>
            {resent ? "Code resent · " : "Didn't get it? "}
            <Text style={{ fontFamily: fonts.sans600, color: c.accentSoft }}>Resend code</Text>
          </Text>
        </Pressable>

        <View style={{ flex: 1, minHeight: 20 }} />

        <Pressable
          onPress={() => handleVerify(otp)}
          disabled={otp.length !== OTP_LENGTH || loading}
          style={{
            minHeight: 56,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: otp.length === OTP_LENGTH ? c.cta : c.deep,
            borderWidth: otp.length === OTP_LENGTH ? 0 : 1,
            borderColor: c.border,
          }}
        >
          <Text
            style={{
              fontFamily: fonts.sans700,
              fontSize: 15,
              color: otp.length === OTP_LENGTH ? c.onCta : c.faint,
            }}
          >
            {loading ? "Verifying…" : "Verify and continue"}
          </Text>
        </Pressable>
      </Pressable>
    </Screen>
  );
}
