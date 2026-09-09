import React, { useMemo } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { Feather } from "@expo/vector-icons";
import { fonts } from "@/lib/fonts";
import { templateDesign } from "@/lib/template-design";
import type { ProfileResponse } from "@/lib/auth-api";

export const SITE_FONT_FAMILY: Record<string, string> = {
  display: fonts.serif600,
  grotesk: fonts.mono700,
  jakarta: fonts.sans800,
};

export interface OverrideProfileData {
  name?: string;
  handle?: string;
  headline?: string;
  bio?: string;
  photoUrl?: string | null;
  projects?: Array<{ title: string; desc: string; tags: string[] }>;
  skills?: string[];
}

export interface NativeWebsitePreviewProps {
  data?: ProfileResponse;
  overrideProfile?: OverrideProfileData;
  templateId: string;
  colorId?: string;
  accent: string;
  siteFont?: string;
  backgroundId: string;
  site?: string | null;
  isFullScreen?: boolean;
  onOpenFull?: () => void;
}

/**
 * Background texture generator supporting sinusoidal waves, grid, dots, and solid gradients.
 */
export function PreviewPattern({
  id,
  accent,
  dark,
}: {
  id: string;
  accent: string;
  dark: boolean;
}) {
  const line = dark ? "rgba(255,255,255,0.065)" : "rgba(20,22,27,0.065)";

  if (id === "solid") {
    return (
      <LinearGradient
        colors={[`${accent}22`, "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    );
  }

  if (id === "waves") {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          {Array.from({ length: 32 }).map((_, i) => {
            const y = i * 26 + 12;
            return (
              <Path
                key={i}
                d={`M -20 ${y} Q 30 ${y - 6}, 80 ${y} T 180 ${y} T 280 ${y} T 380 ${y} T 480 ${y} T 580 ${y} T 680 ${y} T 780 ${y}`}
                stroke={line}
                strokeWidth="1.2"
                fill="none"
              />
            );
          })}
        </Svg>
      </View>
    );
  }

  const step = id === "dots" ? 18 : 24;
  const columns = 28;
  const rows = 40;

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden" }]} pointerEvents="none">
      {Array.from({ length: rows }).map((_, r) =>
        id === "dots" ? (
          <View key={r} style={{ flexDirection: "row", height: step }}>
            {Array.from({ length: columns }).map((__, col) => (
              <View
                key={col}
                style={{ width: step, alignItems: "flex-start", justifyContent: "flex-start" }}
              >
                <View style={{ width: 1.5, height: 1.5, borderRadius: 1, backgroundColor: line }} />
              </View>
            ))}
          </View>
        ) : (
          <View
            key={r}
            style={{
              position: "absolute",
              top: r * step,
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: line,
            }}
          />
        ),
      )}
      {id === "grid"
        ? Array.from({ length: columns }).map((_, col) => (
            <View
              key={`c${col}`}
              style={{
                position: "absolute",
                left: col * step,
                top: 0,
                bottom: 0,
                width: 1,
                backgroundColor: line,
              }}
            />
          ))
        : null}
    </View>
  );
}

/**
 * NativeWebsitePreview:
 * A responsive native renderer modeling the aesthetic of each BEXO template
 * from BEXO-Premium-Templates (Nico Palmer, Cura Futuri, Sierra Montana),
 * populated with the user's authentic photo, headline, bio, projects, and skills.
 */
export function NativeWebsitePreview({
  data,
  overrideProfile,
  templateId,
  accent,
  siteFont = fonts.sans800,
  backgroundId,
  site,
  isFullScreen,
  onOpenFull,
}: NativeWebsitePreviewProps) {
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth > 580;

  const isCura = templateId === "cura-futuri";
  const isSierra = templateId === "sierra-montana";
  const isNico = templateId === "nico-palmer";

  // Palette comes from the shipping template, not from a guess. Sierra
  // Montana in particular is a cream page, not a dark one.
  const design = templateDesign(templateId);
  const isDark = design.dark;
  const textColor = design.fg;
  const textMuted = design.fgMuted;
  const textFaint = design.fgFaint;
  const cardBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(10,10,10,0.04)";
  const cardBorder = design.hairline;

  const user = data?.user;
  const profile = data?.profile;

  const rawName = overrideProfile?.name?.trim() || user?.name?.trim() || "Kavin Balaji";
  const name = rawName.length > 0 ? rawName : "Kavin Balaji";
  const nameParts = name.split(/\s+/);
  const firstName = nameParts[0] || "KAVIN";
  const lastName = nameParts.slice(1).join(" ") || "BALAJI";

  const headline =
    overrideProfile?.headline ||
    profile?.headline ||
    "Technology Entrepreneur and Full-Stack Developer";

  const bio =
    overrideProfile?.bio ||
    profile?.bio ||
    "A technology entrepreneur and full-stack developer building scalable software products, AI-powered solutions, and premium digital experiences.";

  const effectivePhoto =
    overrideProfile?.photoUrl !== undefined ? overrideProfile.photoUrl : user?.photoUrl;

  const effectiveSite =
    site ?? (overrideProfile?.handle ? `${overrideProfile.handle}.atbexo.com` : "atbexo.com");

  const openToHire = user?.openToHire ?? true;

  // Real user projects
  const projects = useMemo(() => {
    if (overrideProfile?.projects && overrideProfile.projects.length > 0) {
      return overrideProfile.projects.slice(0, 3);
    }
    if (data?.projectEntries && data.projectEntries.length > 0) {
      return data.projectEntries.slice(0, 3).map((p) => ({
        title: p.title,
        desc: p.description || "Scalable production software architecture with custom AI pipelines.",
        tags: (p.tech ? p.tech.split(/[,·|]/).map((t) => t.trim()) : ["Featured", "Full-Stack"]).filter(Boolean),
      }));
    }
    return [
      {
        title: "BEXO Digital Identity",
        desc: "Resume-to-portfolio engine with custom subdomains and instant publishing.",
        tags: ["React Native", "TypeScript", "Node"],
      },
      {
        title: "VaultBridge Cryptographic Storage",
        desc: "Privacy-first encrypted file-transfer platform using zero-knowledge architecture.",
        tags: ["PostgreSQL", "Cloud Run", "Zod"],
      },
      {
        title: "Adaptive Design Studio",
        desc: "Interactive brand generator and high-contrast SVG export pipeline.",
        tags: ["Tailwind", "Canvas", "Motion"],
      },
    ];
  }, [overrideProfile?.projects, data?.projectEntries]);

  // Skills chips
  const skills = useMemo(() => {
    if (overrideProfile?.skills && overrideProfile.skills.length > 0) {
      return overrideProfile.skills.slice(0, 8);
    }
    if (data?.skillEntries && data.skillEntries.length > 0) {
      return data.skillEntries.slice(0, 8).map((s) => s.name);
    }
    return ["React Native", "TypeScript", "Cloud Architecture", "Next.js", "Python", "AI Integration"];
  }, [overrideProfile?.skills, data?.skillEntries]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: design.canvas,
        position: "relative",
      }}
    >
      {/* Each template has a texture it was designed around; fall back to it
          only when the user has not chosen one of their own. */}
      <PreviewPattern
        id={backgroundId || design.signatureBackground}
        accent={accent}
        dark={isDark}
      />

      <ScrollView
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: isFullScreen ? 24 : 18,
          paddingTop: 16,
          paddingBottom: 40,
          gap: 22,
        }}
      >
        {/* ═══════════════════════════════════════════════════════════════════
            TOP NAVBAR
           ═══════════════════════════════════════════════════════════════════ */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          {isNico ? (
            /* Nico Palmer brand header: Last name in uppercase + hamburger menu */
            <>
              <Text
                style={{
                  fontFamily: fonts.sans800,
                  fontSize: 15,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: "#0F0F0F",
                }}
              >
                {lastName || firstName}
              </Text>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(15,15,15,0.06)",
                }}
              >
                <Feather name="menu" size={16} color="#0F0F0F" />
              </View>
            </>
          ) : isCura ? (
            /* Cura Futuri brand header */
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: accent,
                  }}
                >
                  {/* Cura's accents are bright on near-black, so a filled
                      block takes the template's dark on-accent ink. */}
                  <Text style={{ fontFamily: fonts.sans700, fontSize: 10, color: design.onAccent }}>
                    {firstName[0]}
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: fonts.sans700,
                    fontSize: 12,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: textColor,
                  }}
                >
                  {name}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {["Works", "Contact"].map((item) => (
                  <Text
                    key={item}
                    style={{
                      fontFamily: fonts.sans600,
                      fontSize: 10,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      color: textMuted,
                    }}
                  >
                    {item}
                  </Text>
                ))}
              </View>
            </>
          ) : (
            /* Sierra Montana brand header — dark type on the cream canvas */
            <>
              <Text
                style={{
                  fontFamily: fonts.serif600,
                  fontSize: 14,
                  letterSpacing: 0.5,
                  color: textColor,
                }}
              >
                {firstName} {lastName}
              </Text>
              <Text
                style={{
                  fontFamily: fonts.mono500,
                  fontSize: 10,
                  letterSpacing: 1,
                  color: textFaint,
                }}
              >
                CHAPTER [I]
              </Text>
            </>
          )}
        </View>

        {/* ═══════════════════════════════════════════════════════════════════
            HERO SECTION
           ═══════════════════════════════════════════════════════════════════ */}
        {isNico ? (
          /* ── NICO PALMER HERO (Faithful to Image 1) ── */
          <View style={{ gap: 14, paddingTop: 4 }}>
            {/* Split layout: Name & Kicker on Left, Squircle Dashed Frame on Right */}
            <View
              style={{
                flexDirection: isWide ? "row" : "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              {/* Left Column: Kicker + Giant Stacked Typography */}
              <View style={{ flex: 1, gap: 8 }}>
                <Text
                  numberOfLines={2}
                  style={{
                    fontFamily: fonts.sans700,
                    fontSize: 10,
                    letterSpacing: 1.4,
                    textTransform: "uppercase",
                    color: "rgba(15,15,15,0.55)",
                  }}
                >
                  {headline.toUpperCase()}
                </Text>

                <View style={{ gap: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: fonts.sans800,
                      fontSize: isFullScreen ? 44 : 32,
                      lineHeight: isFullScreen ? 46 : 34,
                      letterSpacing: -1.2,
                      textTransform: "uppercase",
                      color: "#0F0F0F",
                    }}
                  >
                    {firstName}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: fonts.sans800,
                      fontSize: isFullScreen ? 44 : 32,
                      lineHeight: isFullScreen ? 46 : 34,
                      letterSpacing: -1.2,
                      textTransform: "uppercase",
                      color: "#0F0F0F",
                    }}
                  >
                    {lastName}
                  </Text>
                </View>
              </View>

              {/* Right Column: Squircle Portrait Frame with Dashed Border */}
              {effectivePhoto ? (
                <View
                  style={{
                    width: isFullScreen ? 150 : 120,
                    height: isFullScreen ? 180 : 144,
                    borderRadius: 18,
                    overflow: "hidden",
                    borderWidth: 1.5,
                    borderStyle: "dashed",
                    borderColor: "#0F0F0F",
                    backgroundColor: "rgba(15,15,15,0.04)",
                  }}
                >
                  <Image
                    source={{ uri: effectivePhoto }}
                    style={{ width: "100%", height: "100%", resizeMode: "cover" }}
                  />
                </View>
              ) : null}
            </View>

            {/* Lede Bio */}
            <Text
              numberOfLines={isFullScreen ? 6 : 3}
              style={{
                fontFamily: fonts.sans500,
                fontSize: 12.5,
                lineHeight: 18,
                color: "rgba(15,15,15,0.72)",
              }}
            >
              {bio}
            </Text>

            {/* Actions: VIEW PORTFOLIO (solid dark), CONTACT (ghost), HIRE ME (ghost) */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 2 }}>
              <Pressable
                onPress={onOpenFull}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  borderRadius: 6,
                  backgroundColor: "#0F0F0F",
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.sans700,
                    fontSize: 10.5,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    color: "#FFFFFF",
                  }}
                >
                  View Portfolio
                </Text>
              </Pressable>

              <Pressable
                onPress={onOpenFull}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: "rgba(15,15,15,0.25)",
                  backgroundColor: "rgba(15,15,15,0.04)",
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.sans700,
                    fontSize: 10.5,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    color: "#0F0F0F",
                  }}
                >
                  Contact
                </Text>
              </Pressable>

              {openToHire ? (
                <Pressable
                  onPress={onOpenFull}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: "rgba(15,15,15,0.25)",
                    backgroundColor: "rgba(15,15,15,0.04)",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: fonts.sans700,
                      fontSize: 10.5,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      color: "#0F0F0F",
                    }}
                  >
                    Hire Me
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : isCura ? (
          /* ── CURA FUTURI HERO (Dark Editorial SPA) ── */
          <View style={{ gap: 14, paddingTop: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" }} />
              <Text
                style={{
                  fontFamily: fonts.sans700,
                  fontSize: 9.5,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: "#10B981",
                }}
              >
                Available for opportunities
              </Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
              <View style={{ flex: 1, gap: 6 }}>
                {/* Cura's `h1` is Rosseta, uppercase and enormous — the
                    display face carries this hero, not the weight. */}
                <Text
                  style={{
                    fontFamily: fonts.serif600,
                    fontSize: isFullScreen ? 36 : 26,
                    lineHeight: isFullScreen ? 40 : 30,
                    letterSpacing: -0.4,
                    textTransform: "uppercase",
                    color: textColor,
                  }}
                >
                  {name}
                </Text>
                <Text
                  numberOfLines={isFullScreen ? 4 : 2}
                  style={{
                    fontFamily: fonts.sans400,
                    fontSize: 12,
                    lineHeight: 17,
                    color: textMuted,
                  }}
                >
                  {headline}
                </Text>
              </View>

              {effectivePhoto ? (
                <View
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    overflow: "hidden",
                    borderWidth: 2,
                    borderColor: accent,
                  }}
                >
                  <Image source={{ uri: effectivePhoto }} style={{ width: "100%", height: "100%" }} />
                </View>
              ) : null}
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={onOpenFull}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  borderRadius: 999,
                  backgroundColor: accent,
                }}
              >
                <Text style={{ fontFamily: fonts.sans700, fontSize: 11, color: design.onAccent }}>
                  Explore Works
                </Text>
              </Pressable>
              <Pressable
                onPress={onOpenFull}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: cardBorder,
                }}
              >
                <Text style={{ fontFamily: fonts.sans600, fontSize: 11, color: textColor }}>
                  Contact
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          /* ── SIERRA MONTANA HERO ──
             Modern Template-2's `.index-hero`: a cream canvas (#e4e3db) with
             the name stacked first/last in Canopee over an Acid Grotesk
             headline, portrait to the right. Type sits *on* the cream — this
             template is not the dark one it used to be drawn as. */
          <View style={{ gap: 14, paddingTop: 4 }}>
            <Text
              style={{
                fontFamily: fonts.mono500,
                fontSize: 9.5,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                color: textFaint,
              }}
            >
              [I. OVERVIEW · 2026 EDITION]
            </Text>

            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
              <View style={{ flex: 1, gap: 6 }}>
                {/* `.index-name` stacks the two lines, tight and unindented. */}
                <Text
                  style={{
                    fontFamily: fonts.serif600,
                    fontSize: isFullScreen ? 34 : 25,
                    lineHeight: isFullScreen ? 36 : 27,
                    letterSpacing: -0.4,
                    color: textColor,
                  }}
                >
                  {firstName}
                </Text>
                <Text
                  style={{
                    fontFamily: fonts.serif600,
                    fontSize: isFullScreen ? 34 : 25,
                    lineHeight: isFullScreen ? 36 : 27,
                    letterSpacing: -0.4,
                    color: accent,
                    marginTop: -4,
                  }}
                >
                  {lastName}
                </Text>
                <Text
                  numberOfLines={isFullScreen ? 5 : 3}
                  style={{
                    fontFamily: fonts.sans400,
                    fontSize: 11.5,
                    lineHeight: 17,
                    color: textMuted,
                    marginTop: 4,
                  }}
                >
                  {headline}
                </Text>
              </View>

              {effectivePhoto ? (
                <View
                  style={{
                    width: 78,
                    height: 94,
                    borderRadius: 8,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: cardBorder,
                  }}
                >
                  <Image source={{ uri: effectivePhoto }} style={{ width: "100%", height: "100%" }} />
                </View>
              ) : null}
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={onOpenFull}
                style={{
                  paddingVertical: 7,
                  paddingHorizontal: 14,
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor: textColor,
                }}
              >
                <Text style={{ fontFamily: fonts.serif600, fontSize: 11, color: textColor }}>
                  Selected Works →
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            FEATURED PROJECTS DECK
           ═══════════════════════════════════════════════════════════════════ */}
        <View style={{ gap: 10, paddingTop: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text
              style={{
                fontFamily: fonts.sans700,
                fontSize: 10,
                letterSpacing: 1.4,
                textTransform: "uppercase",
                color: textFaint,
              }}
            >
              {isNico ? "01 / Selected Works" : isSierra ? "[II. PROJECTS]" : "Featured Projects"}
            </Text>
            <Text style={{ fontFamily: fonts.mono500, fontSize: 10, color: isNico ? "#0F0F0F" : accent }}>
              0{projects.length} Works
            </Text>
          </View>

          <View style={{ gap: 8 }}>
            {projects.map((proj, idx) => (
              <View
                key={idx}
                style={{
                  padding: 12,
                  borderRadius: isNico ? 10 : 14,
                  backgroundColor: cardBg,
                  borderWidth: 1,
                  borderColor: cardBorder,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: isNico ? fonts.sans700 : siteFont,
                      fontSize: 13.5,
                      color: textColor,
                      flex: 1,
                    }}
                  >
                    {isNico ? `0${idx + 1} — ` : ""}
                    {proj.title}
                  </Text>
                  <Feather
                    name="arrow-up-right"
                    size={13}
                    color={isNico ? "#0F0F0F" : accent}
                  />
                </View>

                <Text
                  numberOfLines={2}
                  style={{
                    fontFamily: fonts.sans400,
                    fontSize: 11,
                    lineHeight: 16,
                    color: textMuted,
                  }}
                >
                  {proj.desc}
                </Text>

                <View style={{ flexDirection: "row", gap: 5, flexWrap: "wrap", paddingTop: 2 }}>
                  {proj.tags.map((tag, tIdx) => (
                    <View
                      key={tIdx}
                      style={{
                        paddingVertical: 2,
                        paddingHorizontal: 7,
                        borderRadius: isNico ? 4 : 6,
                        backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,15,15,0.05)",
                      }}
                    >
                      <Text style={{ fontFamily: fonts.mono500, fontSize: 9, color: textMuted }}>
                        {tag}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ═══════════════════════════════════════════════════════════════════
            SKILLS & CORE TECHNOLOGIES
           ═══════════════════════════════════════════════════════════════════ */}
        <View style={{ gap: 8 }}>
          <Text
            style={{
              fontFamily: fonts.sans700,
              fontSize: 10,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: textFaint,
            }}
          >
            Core Technologies
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {skills.map((skill, sIdx) => (
              <View
                key={sIdx}
                style={{
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                  borderRadius: isNico ? 6 : 999,
                  backgroundColor: cardBg,
                  borderWidth: 1,
                  borderColor: cardBorder,
                }}
              >
                <Text style={{ fontFamily: fonts.sans600, fontSize: 10, color: textMuted }}>
                  {skill}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ═══════════════════════════════════════════════════════════════════
            FOOTER
           ═══════════════════════════════════════════════════════════════════ */}
        <View
          style={{
            paddingTop: 14,
            borderTopWidth: 1,
            borderTopColor: cardBorder,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ fontFamily: fonts.sans400, fontSize: 9.5, color: textFaint }}>
            © 2026 {firstName} · Built with BEXO
          </Text>
          <Text style={{ fontFamily: fonts.mono500, fontSize: 9.5, color: isNico ? "#0F0F0F" : accent }}>
            {effectiveSite}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
