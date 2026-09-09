import { Modal, Pressable, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Rise } from "@/components/ui/Motion";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { fonts } from "@/lib/fonts";
import { brand } from "@/lib/theme";
import { CARD_PRESETS, TOUR_STEPS } from "@/lib/design-data";
import { findSkin } from "@/lib/card-design";

export type Rect = { x: number; y: number; width: number; height: number; radius?: number };

/**
 * The first-run walkthrough on Home: a dark scrim with one lit cut-out, and a
 * card explaining what is lit. Step 0 also carries the starting-style picker,
 * so the very first thing a new user does is make the card theirs.
 *
 * Rendered in a transparent Modal over the window so spotlight coordinates
 * align directly with window-space measurements, ensuring zero offset errors
 * and preventing any collision with the bottom floating nav bar.
 */
export function CoachTour({
  visible = true,
  step,
  targets,
  presetId,
  onPickPreset,
  onNext,
  onSkip,
  onFlipCard,
}: {
  visible?: boolean;
  step: number;
  targets: { card?: Rect; insights?: Rect; fab?: Rect; nav?: Rect };
  presetId: string;
  onPickPreset: (preset: (typeof CARD_PRESETS)[number]) => void;
  onNext: () => void;
  onSkip: () => void;
  onFlipCard?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const total = TOUR_STEPS.length + 1;
  const isPreset = step === 0;
  const detail = TOUR_STEPS[Math.max(step - 1, 0)];
  const rect = [targets.card, targets.card, targets.insights, targets.fab, targets.nav][step];

  const placement = getCardPlacement(rect, windowHeight, insets, isPreset);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onSkip}
    >
      <View style={{ flex: 1 }}>
        <Spotlight rect={rect} />

        {/* If user taps the lit card on step 1 ("flip to your QR"), allow flipping the card */}
        {step === 1 && rect && onFlipCard ? (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onFlipCard();
            }}
            accessibilityLabel="Tap card to flip"
            style={{
              position: "absolute",
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              zIndex: 10,
            }}
          />
        ) : null}

        <Rise
          key={step}
          duration={280}
          style={{
            position: "absolute",
            left: 20,
            right: 20,
            ...placement,
            backgroundColor: "rgba(16,18,26,0.96)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.14)",
            borderRadius: 22,
            padding: 18,
            gap: 10,
            shadowColor: "#000",
            shadowOpacity: 0.7,
            shadowRadius: 40,
            shadowOffset: { width: 0, height: 18 },
            elevation: 24,
            zIndex: 20,
          }}
        >
          <Text
            style={{
              fontFamily: fonts.sans700,
              fontSize: 10.5,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              color: brand.accentMist,
            }}
          >
            Step {step + 1} of {total}
          </Text>
          <Text style={{ fontFamily: fonts.serif600, fontSize: 18.5, lineHeight: 24, color: "#fff" }}>
            {isPreset ? "Pick a starting style" : detail.title}
          </Text>
          <Text style={{ fontFamily: fonts.sans400, fontSize: 13, lineHeight: 19, color: "rgba(255,255,255,0.74)" }}>
            {isPreset ? "Tap a swatch — your card above updates instantly." : detail.body}
          </Text>

          {isPreset ? (
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 12, paddingTop: 4 }}>
              {CARD_PRESETS.map((preset) => {
                const selected = preset.id === presetId;
                return (
                  <Pressable
                    key={preset.id}
                    accessibilityLabel={preset.name}
                    onPress={() => onPickPreset(preset)}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      borderWidth: 2.5,
                      borderColor: selected ? brand.accentBright : "rgba(255,255,255,0.15)",
                      overflow: "hidden",
                    }}
                  >
                    <LinearGradient
                      colors={findSkin(preset.skin).gradient as readonly [string, string, ...string[]]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ flex: 1 }}
                    />
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
            <Pressable onPress={onSkip} hitSlop={12}>
              <Text style={{ fontFamily: fonts.sans600, fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
                Skip tour
              </Text>
            </Pressable>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flexDirection: "row", gap: 5 }}>
                {Array.from({ length: total }).map((_, i) => (
                  <View
                    key={i}
                    style={{
                      width: i === step ? 16 : 5,
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: i === step ? brand.accentBright : "rgba(255,255,255,0.3)",
                    }}
                  />
                ))}
              </View>
              <Pressable
                onPress={onNext}
                style={{
                  minHeight: 38,
                  paddingHorizontal: 18,
                  borderRadius: 999,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: brand.accent,
                }}
              >
                <Text style={{ fontFamily: fonts.sans700, fontSize: 13.5, color: "#fff" }}>
                  {step === total - 1 ? "Got it" : "Next"}
                </Text>
                <Feather name="arrow-right" size={14} color="#fff" />
              </Pressable>
            </View>
          </View>
        </Rise>
      </View>
    </Modal>
  );
}

/**
 * Four scrim panels around the lit rect rather than one masked overlay —
 * composites cheaply and reliably on all mobile architectures.
 */
function Spotlight({ rect }: { rect?: Rect }) {
  const scrim = "rgba(5,7,15,0.72)";
  if (!rect) {
    return <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: scrim }} />;
  }
  const pad = 6;
  const x = Math.max(0, rect.x - pad);
  const y = Math.max(0, rect.y - pad);
  const w = rect.width + pad * 2;
  const h = rect.height + pad * 2;
  const isCircle = Math.abs(rect.width - rect.height) < 4;
  const radius = isCircle ? w / 2 : rect.radius ? rect.radius + pad : 24;

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
      {/* Top panel */}
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: Math.max(0, y), backgroundColor: scrim }} />
      {/* Bottom panel */}
      <View style={{ position: "absolute", left: 0, right: 0, top: y + h, bottom: 0, backgroundColor: scrim }} />
      {/* Left panel */}
      <View style={{ position: "absolute", left: 0, width: Math.max(0, x), top: y, height: h, backgroundColor: scrim }} />
      {/* Right panel */}
      <View style={{ position: "absolute", left: x + w, right: 0, top: y, height: h, backgroundColor: scrim }} />

      {/* Spotlight outline highlight */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: w,
          height: h,
          borderRadius: radius,
          borderWidth: 2,
          borderColor: "rgba(91,140,255,0.85)",
          shadowColor: brand.accent,
          shadowOpacity: 0.6,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
    </View>
  );
}

/** Keep the explainer card clear of the lit element and clear of the bottom floating navigation bar. */
function getCardPlacement(
  rect: Rect | undefined,
  windowHeight: number,
  insets: { top: number; bottom: number },
  isPresetStep: boolean
): { top?: number; bottom?: number } {
  // Nav bar occupies safe bottom + 12 (bottom pad) + 58 (pill height) + 12 (margin) = insets.bottom + 82
  const navClearance = Math.max(insets.bottom, 12) + 76;
  const safeTop = Math.max(insets.top, 20) + 16;
  const safeBottom = windowHeight - navClearance;
  const estimatedCardHeight = isPresetStep ? 220 : 165;

  if (!rect) {
    return { bottom: navClearance + 16 };
  }

  const spaceBelow = safeBottom - (rect.y + rect.height + 16);
  const spaceAbove = rect.y - safeTop - 16;

  // If there is enough room below the target and clear of the bottom nav bar
  if (spaceBelow >= estimatedCardHeight) {
    return { top: rect.y + rect.height + 16 };
  }

  // Otherwise, place above the target with clearance above FAB / nav
  if (spaceAbove >= estimatedCardHeight) {
    return { bottom: Math.max(navClearance + 16, windowHeight - rect.y + 16) };
  }

  // Fallback if screen is very short: pick whichever side has more room
  if (spaceBelow >= spaceAbove) {
    return { top: Math.max(safeTop, rect.y + rect.height + 12) };
  } else {
    return { bottom: Math.max(navClearance + 16, windowHeight - rect.y + 12) };
  }
}
