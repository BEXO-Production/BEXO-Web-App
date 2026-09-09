import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { Rise } from "@/components/ui/Motion";
import { Sheet } from "@/components/ui/Sheet";
import { QrCode } from "@/components/ui/QrCode";
import { brand } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { useOverlay } from "@/lib/overlay-context";
import { useProfile } from "@/lib/use-profile";
import { useQueryClient } from "@tanstack/react-query";
import { personInitials, useScanCard, type ScanResult } from "@/lib/connections-api";
import { fonts } from "@/lib/fonts";

/**
 * "09 Scan" — the camera, and the user's own code.
 *
 * A BEXO QR encodes a URL ending in that person's card code. Scanning one
 * sends the code to the server, which records the scan, opens a connection
 * request with the card's owner, and hands back their portfolio URL — so one
 * scan both introduces you and gives you somewhere to go.
 *
 * Camera access is asked for in context, the first time the viewfinder is
 * actually needed, behind an explaining sheet — never at launch.
 */
export default function Scan() {
  const { c, dark } = useTheme();
  const { toast } = useOverlay();
  const insets = useSafeAreaInsets();
  const { data } = useProfile();
  const scanCard = useScanCard();

  const [mode, setMode] = useState<"camera" | "mine">("camera");
  const [torch, setTorch] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [askVisible, setAskVisible] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  // The camera reports the same code many times a second — take the first.
  const busy = useRef(false);

  const handle = data?.profile?.handle ?? null;
  const site = handle ? `${handle}.atbexo.com` : null;
  const myCardUrl = data?.user?.cardUrl ?? null;
  const granted = permission?.granted ?? false;

  useEffect(() => {
    if (mode === "camera" && permission && !permission.granted) setAskVisible(true);
  }, [mode, permission]);

  const onCode = useCallback(
    async (value: string) => {
      if (busy.current) return;
      busy.current = true;
      setScanError(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      try {
        const scan = await scanCard.mutateAsync({ code: value, source: "qr" });
        setResult(scan);
      } catch (err) {
        setScanError(err instanceof Error ? err.message : "That code isn't a BEXO card.");
        setResult(null);
      } finally {
        // Let the same card be scanned again a moment later.
        setTimeout(() => {
          busy.current = false;
        }, 1500);
      }
    },
    [scanCard],
  );

  const surface = dark ? "#05070f" : "#EDEBE4";
  const onSurface = dark ? "#fff" : "#16171B";
  const glass = dark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.7)";
  const glassEdge = dark ? "rgba(255,255,255,0.16)" : "rgba(22,23,27,0.12)";

  return (
    <View style={{ flex: 1, backgroundColor: surface }}>
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 22,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          accessibilityLabel="Close"
          onPress={() => router.replace("/(app)/home")}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: glass,
            borderWidth: 1,
            borderColor: glassEdge,
          }}
        >
          <Feather name="x" size={18} color={onSurface} />
        </Pressable>

        <Text
          style={{
            fontFamily: fonts.sans700,
            fontSize: 10.5,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: dark ? "rgba(255,255,255,0.7)" : "rgba(22,23,27,0.6)",
          }}
        >
          {mode === "camera" ? "Scan a BEXO" : "My BEXO"}
        </Text>

        <Pressable
          accessibilityLabel="Toggle torch"
          onPress={() => setTorch((t) => !t)}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: torch ? onSurface : glass,
            borderWidth: 1,
            borderColor: torch ? onSurface : glassEdge,
          }}
        >
          <Feather name="zap" size={17} color={torch ? surface : onSurface} />
        </Pressable>
      </View>

      {mode === "camera" ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 26 }}>
          <View style={{ width: 258, height: 258 }}>
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: 28,
                overflow: "hidden",
                backgroundColor: dark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.5)",
                borderWidth: 1,
                borderColor: glassEdge,
              }}
            >
              {granted ? (
                <CameraView
                  style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                  facing="back"
                  enableTorch={torch}
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={({ data: value }) => onCode(value)}
                />
              ) : null}
              <ScanLine />
            </View>
            <Corner top left />
            <Corner top />
            <Corner left />
            <Corner />
          </View>

          <View style={{ alignItems: "center", gap: 8, paddingHorizontal: 40 }}>
            <Text style={{ fontFamily: fonts.serif600, fontSize: 21, color: onSurface }}>
              Point at a BEXO card
            </Text>
            <Text
              style={{
                fontFamily: fonts.sans400,
                fontSize: 13,
                lineHeight: 20,
                textAlign: "center",
                color: scanError ? c.danger : dark ? "rgba(255,255,255,0.6)" : "rgba(22,23,27,0.6)",
              }}
            >
              {scanError ?? "Scan the QR on the back of any BEXO card to connect and open their portfolio."}
            </Text>
          </View>

          {scanCard.isPending ? <ActivityIndicator color={brand.accentBright} /> : null}
        </View>
      ) : (
        <Rise duration={340} style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 20 }}>
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 26,
              padding: 22,
              shadowColor: brand.accent,
              shadowOpacity: 0.6,
              shadowRadius: 60,
              shadowOffset: { width: 0, height: 26 },
              elevation: 14,
            }}
          >
            {myCardUrl ? (
              <QrCode value={myCardUrl} size={212} color="#16171B" />
            ) : (
              <View style={{ width: 212, height: 212, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color={brand.accent} />
              </View>
            )}
          </View>
          <View style={{ alignItems: "center", gap: 6 }}>
            <Text style={{ fontFamily: fonts.mono500, fontSize: 16, color: onSurface }}>
              {site ?? "Loading your card…"}
            </Text>
            <Text
              style={{
                fontFamily: fonts.sans400,
                fontSize: 13,
                color: dark ? "rgba(255,255,255,0.6)" : "rgba(22,23,27,0.6)",
              }}
            >
              Scan to open my portfolio and connect
            </Text>
          </View>
          {myCardUrl ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <GlassButton
                icon="copy"
                label="Copy link"
                onPress={() => {
                  Clipboard.setStringAsync(myCardUrl);
                  toast("Link copied");
                }}
              />
              <GlassButton icon="share-2" label="Share" onPress={() => toast("Opening share sheet…")} />
            </View>
          ) : null}
        </Rise>
      )}

      <View style={{ paddingHorizontal: 22, paddingBottom: 34, alignItems: "center" }}>
        <View
          style={{
            flexDirection: "row",
            padding: 5,
            borderRadius: 999,
            backgroundColor: dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.65)",
            borderWidth: 1,
            borderColor: glassEdge,
          }}
        >
          {(["camera", "mine"] as const).map((key) => {
            const active = mode === key;
            return (
              <Pressable
                key={key}
                onPress={() => setMode(key)}
                style={{
                  paddingVertical: 9,
                  paddingHorizontal: 22,
                  borderRadius: 999,
                  backgroundColor: active ? onSurface : "transparent",
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.sans700,
                    fontSize: 13,
                    color: active
                      ? surface
                      : dark
                        ? "rgba(255,255,255,0.72)"
                        : "rgba(22,23,27,0.6)",
                  }}
                >
                  {key === "camera" ? "Scan" : "My QR"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Sheet visible={askVisible} onClose={() => setAskVisible(false)} scrim="rgba(5,7,15,0.6)">
        <View
          style={{
            width: 54,
            height: 54,
            borderRadius: 18,
            alignSelf: "center",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.accentWash,
            borderWidth: 1,
            borderColor: c.accentEdge,
          }}
        >
          <Feather name="camera" size={24} color={c.accentSoft} />
        </View>
        <View style={{ gap: 7, alignItems: "center" }}>
          <Text style={{ fontFamily: fonts.serif600, fontSize: 21, color: c.ink }}>Allow camera access</Text>
          <Text
            style={{
              fontFamily: fonts.sans400,
              fontSize: 13,
              lineHeight: 20,
              textAlign: "center",
              color: c.muted,
            }}
          >
            BEXO uses your camera to scan BEXO cards and QR codes, and to photograph certificates. Nothing is
            uploaded until you choose to save it.
          </Text>
        </View>
        <View style={{ gap: 10 }}>
          <Pressable
            onPress={async () => {
              await requestPermission();
              setAskVisible(false);
            }}
            style={{
              minHeight: 52,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: c.cta,
            }}
          >
            <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: c.onCta }}>Allow camera</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setAskVisible(false);
              setMode("mine");
            }}
            style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontFamily: fonts.sans600, fontSize: 14, color: c.muted }}>Not now</Text>
          </Pressable>
        </View>
      </Sheet>

      <ScanResultSheet result={result} onClose={() => setResult(null)} />
    </View>
  );
}

/** What a scan produced: who it was, and what now stands between you. */
function ScanResultSheet({ result, onClose }: { result: ScanResult | null; onClose: () => void }) {
  const { c } = useTheme();
  if (!result) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  const queryClient = useQueryClient();
  const { person, isSelf, connection, mutual, autoConnected } = result;
  const isConnected = mutual || connection?.status === "accepted" || autoConnected;

  const status = isSelf
    ? { icon: "user" as const, tint: c.accentSoft, text: "This is your own card" }
    : isConnected
      ? { icon: "check-circle" as const, tint: c.success, text: autoConnected ? "Instant Auto-Connect!" : "You’re connected" }
      : connection?.incoming
        ? { icon: "user-plus" as const, tint: c.accentSoft, text: "They asked to connect too" }
        : { icon: "clock" as const, tint: c.warn, text: "Request sent — waiting for them" };

  return (
    <Sheet visible onClose={onClose} scrim="rgba(5,7,15,0.6)">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "center" }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${status.tint}1f`,
          }}
        >
          <Feather name={status.icon} size={19} color={status.tint} />
        </View>
        <Text style={{ fontFamily: fonts.sans700, fontSize: 13.5, color: status.tint }}>{status.text}</Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          padding: 16,
          borderRadius: 20,
          backgroundColor: c.panel,
          borderWidth: 1,
          borderColor: isConnected ? c.accent : c.border,
        }}
      >
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.deep,
            borderWidth: 1,
            borderColor: c.border,
            overflow: "hidden",
          }}
        >
          {person.photoUrl ? (
            <Image
              source={{ uri: person.photoUrl }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          ) : (
            <Text style={{ fontFamily: fonts.serif600, fontSize: 20, color: c.muted }}>
              {personInitials(person)}
            </Text>
          )}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: fonts.sans700, fontSize: 16, color: c.ink }}>
            {person.name ?? "A BEXO member"}
          </Text>
          {person.headline ? (
            <Text numberOfLines={1} style={{ fontFamily: fonts.sans400, fontSize: 12.5, color: c.muted }}>
              {person.headline}
            </Text>
          ) : null}
          {person.handle ? (
            <Text style={{ fontFamily: fonts.mono500, fontSize: 11.5, color: c.accentSoft }}>
              {person.handle}.atbexo.com
            </Text>
          ) : null}
        </View>
      </View>

      {/* Action buttons */}
      <View style={{ flexDirection: "column", gap: 10 }}>
        {isConnected && !isSelf ? (
          <Pressable
            onPress={() => {
              queryClient.invalidateQueries({ queryKey: ["connections"] });
              onClose();
              router.push("/(app)/network");
            }}
            style={{
              minHeight: 50,
              borderRadius: 999,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: c.cta,
            }}
          >
            <Feather name="share-2" size={17} color={c.onCta} />
            <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: c.onCta }}>
              View in Network
            </Text>
          </Pressable>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => {
              if (person.siteUrl) Linking.openURL(person.siteUrl).catch(() => {});
              onClose();
            }}
            disabled={!person.siteUrl}
            style={{
              flex: 1,
              minHeight: 50,
              borderRadius: 999,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: isConnected ? c.panel : c.cta,
              borderWidth: isConnected ? 1 : 0,
              borderColor: c.borderStrong,
            }}
          >
            <Feather
              name="external-link"
              size={17}
              color={isConnected ? c.ink : person.siteUrl ? c.onCta : c.faint}
            />
            <Text
              style={{
                fontFamily: fonts.sans700,
                fontSize: 15,
                color: isConnected ? c.ink : person.siteUrl ? c.onCta : c.faint,
              }}
            >
              Open portfolio
            </Text>
          </Pressable>

          <Pressable
            onPress={onClose}
            style={{
              minHeight: 50,
              paddingHorizontal: 20,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: c.panel,
              borderWidth: 1,
              borderColor: c.borderStrong,
            }}
          >
            <Text style={{ fontFamily: fonts.sans700, fontSize: 14, color: c.ink }}>Dismiss</Text>
          </Pressable>
        </View>
      </View>
    </Sheet>
  );
}

/** The laser line sweeping the viewfinder, 6% → 94% on a 2.4s loop. */
function ScanLine() {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.bezier(0.4, 0, 0.6, 1) }), -1, false);
  }, [p]);

  const style = useAnimatedStyle(() => ({
    top: interpolate(p.value, [0, 1], [16, 242]),
    opacity: interpolate(p.value, [0, 0.12, 0.88, 1], [0, 1, 1, 0]),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          height: 2,
          backgroundColor: brand.accentBright,
          shadowColor: brand.accentBright,
          shadowOpacity: 0.7,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    />
  );
}

function Corner({ top, left }: { top?: boolean; left?: boolean }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: 46,
        height: 46,
        top: top ? -2 : undefined,
        bottom: top ? undefined : -2,
        left: left ? -2 : undefined,
        right: left ? undefined : -2,
        borderTopWidth: top ? 3 : 0,
        borderBottomWidth: top ? 0 : 3,
        borderLeftWidth: left ? 3 : 0,
        borderRightWidth: left ? 0 : 3,
        borderColor: brand.accentBright,
        borderTopLeftRadius: top && left ? 20 : 0,
        borderTopRightRadius: top && !left ? 20 : 0,
        borderBottomLeftRadius: !top && left ? 20 : 0,
        borderBottomRightRadius: !top && !left ? 20 : 0,
      }}
    />
  );
}

function GlassButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { dark } = useTheme();
  const onSurface = dark ? "#fff" : "#16171B";
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 11,
        paddingHorizontal: 20,
        borderRadius: 999,
        backgroundColor: dark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.7)",
        borderWidth: 1,
        borderColor: dark ? "rgba(255,255,255,0.18)" : "rgba(22,23,27,0.14)",
      }}
    >
      <Feather name={icon} size={15} color={onSurface} />
      <Text style={{ fontFamily: fonts.sans600, fontSize: 13, color: onSurface }}>{label}</Text>
    </Pressable>
  );
}
