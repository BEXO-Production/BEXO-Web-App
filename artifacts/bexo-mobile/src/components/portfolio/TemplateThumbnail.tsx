import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { fonts } from "@/lib/fonts";

interface TemplateThumbnailProps {
  templateId: string;
  userName?: string;
  photoUrl?: string | null;
  accent?: string;
  width?: number;
  height?: number;
}

/**
 * Miniature macOS browser preview thumbnail for the Page Template selector.
 * Faithfully captures the design of Cura Futuri, Sierra Montana, and Nico Palmer
 * from BEXO-Premium-Templates, as shown in the desktop live studio experience.
 */
export function TemplateThumbnail({
  templateId,
  userName = "Kavin Balaji",
  photoUrl,
  accent = "#2563EB",
  width = 98,
  height = 70,
}: TemplateThumbnailProps) {
  const parts = userName.trim().split(/\s+/);
  const firstName = parts[0]?.toUpperCase() || "KAVIN";
  const lastName = parts[1]?.toUpperCase() || "BALAJI";

  const isCura = templateId === "cura-futuri";
  const isSierra = templateId === "sierra-montana";
  const isNico = templateId === "nico-palmer";

  return (
    <View
      style={[
        styles.container,
        {
          width,
          height,
          backgroundColor: isNico ? "#E8E8E0" : isSierra ? "#0D1117" : "#090B10",
        },
      ]}
    >
      {/* Mini macOS Chrome Header */}
      <View
        style={[
          styles.chromeBar,
          {
            backgroundColor: isNico ? "#DCDCD3" : "rgba(255,255,255,0.06)",
            borderBottomColor: isNico ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)",
          },
        ]}
      >
        <View style={styles.trafficLights}>
          <View style={[styles.dot, { backgroundColor: "#FF5F56" }]} />
          <View style={[styles.dot, { backgroundColor: "#FFBD2E" }]} />
          <View style={[styles.dot, { backgroundColor: "#27C93F" }]} />
        </View>
        <View
          style={[
            styles.urlPill,
            {
              backgroundColor: isNico ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.08)",
            },
          ]}
        />
      </View>

      {/* Mini Viewport */}
      <View style={styles.viewport}>
        {/* ── NICO PALMER MINIATURE ── */}
        {isNico ? (
          <View style={styles.nicoContainer}>
            {/* Subtle mini wave line */}
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
              <Path
                d="M 0 16 Q 20 12, 40 16 T 80 16 T 120 16"
                stroke="rgba(0,0,0,0.06)"
                strokeWidth="1"
                fill="none"
              />
              <Path
                d="M 0 32 Q 20 28, 40 32 T 80 32 T 120 32"
                stroke="rgba(0,0,0,0.06)"
                strokeWidth="1"
                fill="none"
              />
            </Svg>

            <View style={styles.miniSplit}>
              {/* Left: Tiny Kicker & Bold Stacked Name */}
              <View style={styles.miniLeft}>
                <View style={styles.miniKicker} />
                <View style={styles.miniNameStack}>
                  <Text numberOfLines={1} style={styles.miniNicoName}>
                    {firstName.slice(0, 5)}
                  </Text>
                  <Text numberOfLines={1} style={styles.miniNicoName}>
                    {lastName.slice(0, 6)}
                  </Text>
                </View>
                <View style={styles.miniPillRow}>
                  <View style={[styles.miniPill, { backgroundColor: "#0f0f0f" }]} />
                  <View style={[styles.miniPill, { backgroundColor: "rgba(0,0,0,0.15)" }]} />
                </View>
              </View>

              {/* Right: Squircle Portrait Frame with Dashed Border */}
              <View style={styles.nicoFrame}>
                {photoUrl ? (
                  <Image source={{ uri: photoUrl }} style={styles.miniPhoto} />
                ) : (
                  <View style={styles.miniPhotoFallback}>
                    <Text style={styles.miniInitials}>{firstName[0]}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        ) : null}

        {/* ── CURA FUTURI MINIATURE ── */}
        {isCura ? (
          <View style={styles.curaContainer}>
            <View style={styles.curaGlow} />
            <View style={styles.miniSplit}>
              <View style={styles.miniLeft}>
                <View style={[styles.miniStatusDot, { backgroundColor: "#10B981" }]} />
                <View style={styles.miniNameStack}>
                  <Text numberOfLines={1} style={styles.miniCuraName}>
                    {firstName.slice(0, 5)}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.miniCuraName, { fontFamily: fonts.serif600Italic, color: accent }]}
                  >
                    {lastName.slice(0, 6)}
                  </Text>
                </View>
                <View style={[styles.miniPill, { backgroundColor: accent, width: 24 }]} />
              </View>

              <View style={[styles.curaFrame, { borderColor: accent }]}>
                {photoUrl ? (
                  <Image source={{ uri: photoUrl }} style={styles.miniPhoto} />
                ) : (
                  <View style={[styles.miniPhotoFallback, { backgroundColor: "rgba(255,255,255,0.08)" }]}>
                    <Text style={[styles.miniInitials, { color: "#fff" }]}>{firstName[0]}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        ) : null}

        {/* ── SIERRA MONTANA MINIATURE ── */}
        {isSierra ? (
          <View style={styles.sierraContainer}>
            <View style={styles.miniSplit}>
              <View style={styles.miniLeft}>
                <Text style={styles.miniRoman}>I. OVERVIEW</Text>
                <View style={styles.miniNameStack}>
                  <Text numberOfLines={1} style={styles.miniSierraName}>
                    {firstName}
                  </Text>
                  <Text numberOfLines={1} style={styles.miniSierraName}>
                    {lastName}
                  </Text>
                </View>
                <View style={styles.miniSierraBar} />
              </View>

              <View style={styles.sierraFrame}>
                {photoUrl ? (
                  <Image source={{ uri: photoUrl }} style={styles.miniPhoto} />
                ) : (
                  <View style={[styles.miniPhotoFallback, { backgroundColor: "#1F2937" }]}>
                    <Text style={[styles.miniInitials, { color: "#9CA3AF" }]}>{firstName[0]}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },
  chromeBar: {
    height: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    gap: 4,
    borderBottomWidth: 1,
  },
  trafficLights: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2.5,
  },
  dot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 1.75,
  },
  urlPill: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  viewport: {
    flex: 1,
    overflow: "hidden",
  },
  miniSplit: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 5,
    paddingVertical: 3,
    gap: 4,
  },
  miniLeft: {
    flex: 1,
    gap: 2,
    justifyContent: "center",
  },
  miniPhoto: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  miniPhotoFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  miniInitials: {
    fontFamily: fonts.sans700,
    fontSize: 9,
    color: "#333",
  },
  /* Nico Palmer */
  nicoContainer: {
    flex: 1,
    backgroundColor: "#E3E3DB",
  },
  miniKicker: {
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(15,15,15,0.35)",
  },
  miniNameStack: {
    gap: 0.5,
  },
  miniNicoName: {
    fontFamily: fonts.sans800,
    fontSize: 8.5,
    lineHeight: 9.5,
    letterSpacing: -0.4,
    color: "#0f0f0f",
    textTransform: "uppercase",
  },
  miniPillRow: {
    flexDirection: "row",
    gap: 2,
    marginTop: 1,
  },
  miniPill: {
    width: 12,
    height: 4,
    borderRadius: 2,
  },
  nicoFrame: {
    width: 28,
    height: 36,
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#0f0f0f",
  },
  /* Cura Futuri */
  curaContainer: {
    flex: 1,
    backgroundColor: "#090B10",
  },
  curaGlow: {
    position: "absolute",
    right: -10,
    top: -10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(59,130,246,0.15)",
  },
  miniStatusDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  miniCuraName: {
    fontFamily: fonts.sans700,
    fontSize: 8,
    lineHeight: 9,
    color: "#ffffff",
    letterSpacing: -0.2,
  },
  curaFrame: {
    width: 28,
    height: 36,
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  /* Sierra Montana */
  sierraContainer: {
    flex: 1,
    backgroundColor: "#0D1117",
  },
  miniRoman: {
    fontFamily: fonts.mono500,
    fontSize: 5,
    letterSpacing: 0.5,
    color: "#9CA3AF",
  },
  miniSierraName: {
    fontFamily: fonts.serif600,
    fontSize: 7.5,
    lineHeight: 8.5,
    color: "#F3F4F6",
  },
  miniSierraBar: {
    width: 14,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginTop: 1,
  },
  sierraFrame: {
    width: 28,
    height: 36,
    borderRadius: 4,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
});
