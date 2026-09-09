import { useEffect } from "react";
import { Image, Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { fonts } from "@/lib/fonts";
import { findFont, findSkin, type CardSkin } from "@/lib/card-design";
import Svg, { ClipPath, Defs, Image as SvgImage, Polygon } from "react-native-svg";
import {
  BACK_HEADLINES,
  CARD_ACCENTS,
  DEFAULT_CARD_FIELDS,
  HOME_DIMS,
  photoRadii,
  type CardDims,
  type CardFields,
  type CardPhotoShape,
} from "@/lib/design-data";
import { QrCode } from "@/components/ui/QrCode";

const LOGO = require("../../assets/brand/bexo-logo.png");

/**
 * The BEXO business card — the single most re-used composite in the product.
 * It appears on Home, Celebrate, Card Studio and Card Share, so it is built
 * once, fully parametrised by finish/typeface/accent/field toggles and by a
 * geometry table (`HOME_DIMS` / `STUDIO_DIMS`), exactly like `buildCardVisual`
 * in the design canvas.
 */

export interface CardIdentity {
  name: string;
  role: string;
  company: string;
  city: string;
  site: string;
  email: string;
  phone: string;
  photoInitial: string;
  /** What the QR encodes — the server-minted card URL, unique per person. */
  cardUrl: string;
  /** Profile photo, used when the card design has no picture of its own. */
  photoUrl?: string | null;
}

/**
 * Fills in a card from whatever real data is available. Nothing here invents
 * a specific person — an unset field renders as blank or is simply omitted
 * (see the `fields` toggles in `CardFront`/`CardBack`), never as somebody
 * else's name, role or contact details.
 */
export function identityFrom(partial: Partial<CardIdentity>): CardIdentity {
  const name = partial.name?.trim() || "Your name";
  return {
    name,
    role: partial.role ?? "",
    company: partial.company ?? "",
    city: partial.city ?? "",
    site: partial.site ?? "",
    email: partial.email ?? "",
    phone: partial.phone ?? "",
    photoInitial: (partial.photoInitial || name[0] || "?").toUpperCase(),
    cardUrl: partial.cardUrl || (partial.site ? `https://${partial.site}` : ""),
    photoUrl: partial.photoUrl ?? null,
  };
}

export interface CardDesign {
  skinId?: string;
  fontId?: string;
  accentId?: string;
  headlineId?: string;
  fields?: CardFields;
  /** How the picture is cut — circle, squircle, arch, hexagon… */
  photoShape?: CardPhotoShape;
  /** A picture or logo chosen for the card specifically. */
  photoUrl?: string | null;
}

function resolve(design: CardDesign) {
  const skin = findSkin(design.skinId);
  const font = findFont(design.fontId);
  const accentHex = CARD_ACCENTS.find((a) => a.id === (design.accentId ?? "auto"))?.hex ?? skin.rule;
  const headline = BACK_HEADLINES.find((h) => h.id === (design.headlineId ?? "network")) ?? BACK_HEADLINES[0];
  const fields = design.fields ?? DEFAULT_CARD_FIELDS;
  const photoShape = (design.photoShape ?? "circle") as CardPhotoShape;
  return { skin, font, accent: accentHex, headline, fields, photoShape };
}

function contactRows(identity: CardIdentity, fields: CardFields) {
  return [
    { key: "contactSite", icon: "globe", text: identity.site },
    { key: "contactEmail", icon: "mail", text: identity.email },
    { key: "contactPhone", icon: "phone", text: identity.phone },
    { key: "contactLocation", icon: "map-pin", text: identity.city ? `${identity.city}, IN` : "" },
  ].filter((row) => fields[row.key as keyof CardFields] && row.text.trim().length > 0) as {
    key: string;
    icon: keyof typeof Feather.glyphMap;
    text: string;
  }[];
}

function Surface({
  skin,
  d,
  children,
}: {
  skin: CardSkin;
  d: CardDims;
  children: React.ReactNode;
}) {
  return (
    <LinearGradient
      colors={skin.gradient as readonly [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: d.w,
        height: d.h,
        borderRadius: d.radius,
        padding: d.pad,
        gap: d.gap,
        justifyContent: "space-between",
        overflow: "hidden",
        borderWidth: skin.border ? 1 : 0,
        borderColor: skin.border ?? "transparent",
      }}
    >
      {children}
    </LinearGradient>
  );
}

export function CardFront({
  identity,
  design = {},
  d = HOME_DIMS,
}: {
  identity: CardIdentity;
  design?: CardDesign;
  d?: CardDims;
}) {
  const { skin, font, accent, fields, photoShape } = resolve(design);
  const contacts = contactRows(identity, fields);

  return (
    <Surface skin={skin} d={d}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: fonts.sans800, fontSize: d.wordmark, letterSpacing: 2.5, color: skin.text }}>
          BEXO
        </Text>
        <Image source={LOGO} style={{ width: d.mark, height: d.mark, opacity: 0.95 }} resizeMode="contain" />
      </View>

      {fields.rule ? (
        <View style={{ width: d.ruleW, height: 2, borderRadius: 1, backgroundColor: accent }} />
      ) : null}

      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: d.midGap }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: font.family,
              letterSpacing: font.letterSpacing,
              fontSize: d.name,
              lineHeight: d.nameLh,
              color: skin.text,
            }}
          >
            {identity.name}
          </Text>
          {fields.role && identity.role ? (
            <Text style={{ fontFamily: fonts.sans600, fontSize: d.role, color: accent, marginTop: 1 }}>
              {identity.role}
            </Text>
          ) : null}
          {fields.company && (identity.company || identity.city) ? (
            <Text style={{ fontFamily: fonts.sans400, fontSize: d.sub, color: skin.textMuted }}>
              {[identity.company, identity.city].filter(Boolean).join(" · ")}
            </Text>
          ) : null}
        </View>

        {fields.photo ? (
          <CardPhoto
            size={d.photo}
            shape={photoShape}
            accent={accent}
            textColor={skin.text}
            initial={identity.photoInitial}
            uri={design.photoUrl ?? identity.photoUrl ?? null}
          />
        ) : null}
      </View>

      {contacts.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: d.pad * 0.8, rowGap: d.contactGap }}>
          {contacts.map((row) => (
            <View key={row.key} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Feather name={row.icon} size={d.contactSize} color={accent} />
              <Text
                numberOfLines={1}
                style={{ fontFamily: fonts.sans400, fontSize: d.contactSize, color: skin.textMuted }}
              >
                {row.text}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {fields.tagline ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: d.dotGap }}>
          {["Connect", "·", "Discover", "·", "Grow"].map((word, i) => (
            <Text
              key={i}
              style={{
                fontFamily: fonts.sans700,
                fontSize: d.tagline,
                letterSpacing: 1.6,
                textTransform: "uppercase",
                color: accent,
              }}
            >
              {word}
            </Text>
          ))}
        </View>
      ) : null}
    </Surface>
  );
}

export function CardBack({
  identity,
  design = {},
  d = HOME_DIMS,
}: {
  identity: CardIdentity;
  design?: CardDesign;
  d?: CardDims;
}) {
  const { skin, accent, headline, fields } = resolve(design);
  const hairline = `${skin.text}22`;

  return (
    <Surface skin={skin} d={d}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: fonts.sans800, fontSize: d.wordmark, letterSpacing: 2.5, color: skin.text }}>
          BEXO
        </Text>
      </View>

      {fields.rule ? (
        <View style={{ width: d.ruleW, height: 2, borderRadius: 1, backgroundColor: accent }} />
      ) : null}

      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: fonts.serif600,
              fontSize: d.headline,
              lineHeight: d.headlineLh,
              color: skin.text,
            }}
          >
            {headline.pre}
            {"\n"}
            <Text style={{ color: accent, fontFamily: fonts.serif600 }}>{headline.accent}</Text> {headline.post}
          </Text>
          {fields.nfc ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: 10 }}>
              <Feather name="wifi" size={d.nfc} color={accent} />
              <Text style={{ fontFamily: fonts.sans600, fontSize: d.nfc, color: accent }}>
                Tap or Scan to connect
              </Text>
            </View>
          ) : null}
        </View>

        <View style={{ width: 1, alignSelf: "stretch", backgroundColor: hairline }} />

        <View style={{ width: d.qrWrap, height: d.qrWrap, alignItems: "center", justifyContent: "center" }}>
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: d.qrRadius,
              padding: d.qrPad,
              shadowColor: "#000",
              shadowOpacity: 0.22,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 8 },
            }}
          >
            <QrCode value={identity.cardUrl} size={d.qrPx} color={skin.qr} />
          </View>
          <View
            style={{
              position: "absolute",
              width: d.qrBadge,
              height: d.qrBadge,
              borderRadius: d.qrBadge * 0.28,
              backgroundColor: skin.gradient[1],
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 3,
              borderColor: "#fff",
            }}
          >
            <Image
              source={LOGO}
              style={{ width: d.qrBadge * 0.55, height: d.qrBadge * 0.55 }}
              resizeMode="contain"
            />
          </View>
        </View>
      </View>

      {fields.backCredit ? (
        <Text
          style={{
            fontFamily: fonts.sans400,
            fontSize: d.backFooter,
            letterSpacing: 0.3,
            textAlign: "center",
            color: skin.textMuted,
          }}
        >
          Built on <Text style={{ fontFamily: fonts.sans700 }}>BEXO</Text> Engine · Privacy First · You’re in
          Control
        </Text>
      ) : null}
    </Surface>
  );
}

/**
 * The Home-screen card: tap to flip on the Y axis over 680ms. Both faces are
 * mounted and back-face-hidden, so the flip is a single GPU transform.
 */
export function IdentityCard({
  identity,
  design = {},
  d = HOME_DIMS,
  scale = 1,
  flipped,
  onFlip,
}: {
  identity: CardIdentity;
  design?: CardDesign;
  d?: CardDims;
  scale?: number;
  flipped?: boolean;
  onFlip?: (next: boolean) => void;
}) {
  const spin = useSharedValue(flipped ? 1 : 0);

  useEffect(() => {
    spin.value = withTiming(flipped ? 1 : 0, {
      duration: 680,
      easing: Easing.bezier(0.18, 0.89, 0.32, 1.05),
    });
  }, [flipped, spin]);

  const front = useAnimatedStyle(() => ({
    transform: [{ perspective: 1500 }, { rotateY: `${interpolate(spin.value, [0, 1], [0, 180])}deg` }],
    backfaceVisibility: "hidden",
  }));

  const back = useAnimatedStyle(() => ({
    transform: [{ perspective: 1500 }, { rotateY: `${interpolate(spin.value, [0, 1], [180, 360])}deg` }],
    backfaceVisibility: "hidden",
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={flipped ? "Flip card to the front" : "Flip card to your QR code"}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onFlip?.(!flipped);
      }}
      style={{ width: d.w * scale, height: d.h * scale }}
    >
      <View style={{ width: d.w, height: d.h, transform: [{ scale }], transformOrigin: "top left" }}>
        <Animated.View style={[{ position: "absolute" }, front]}>
          <CardFront identity={identity} design={design} d={d} />
        </Animated.View>
        <Animated.View style={[{ position: "absolute" }, back]}>
          <CardBack identity={identity} design={design} d={d} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

/**
 * The card's picture. Not everyone puts a face here — a studio puts its mark —
 * so the frame is a choice: circle, squircle, rounded, square, arch, or a
 * hexagon (which needs a real clip path rather than corner radii).
 */
function CardPhoto({
  size,
  shape,
  accent,
  textColor,
  initial,
  uri,
}: {
  size: number;
  shape: CardPhotoShape;
  accent: string;
  textColor: string;
  initial: string;
  uri: string | null;
}) {
  if (shape === "hexagon") {
    const points = hexagonPoints(size);
    return (
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Defs>
            <ClipPath id="bexoHex">
              <Polygon points={points} />
            </ClipPath>
          </Defs>
          {uri ? (
            <SvgImage
              href={{ uri }}
              width={size}
              height={size}
              preserveAspectRatio="xMidYMid slice"
              clipPath="url(#bexoHex)"
            />
          ) : (
            <Polygon points={points} fill="rgba(255,255,255,0.14)" />
          )}
          <Polygon points={points} fill="none" stroke={`${accent}80`} strokeWidth={1.5} />
        </Svg>
        {uri ? null : (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: fonts.serif600, fontSize: size * 0.34, color: textColor }}>{initial}</Text>
          </View>
        )}
      </View>
    );
  }

  const radii = photoRadii(shape, size);
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderWidth: 1.5,
        borderColor: `${accent}80`,
        backgroundColor: "rgba(255,255,255,0.14)",
        borderTopLeftRadius: radii.topLeft,
        borderTopRightRadius: radii.topRight,
        borderBottomLeftRadius: radii.bottomLeft,
        borderBottomRightRadius: radii.bottomRight,
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      ) : (
        <Text style={{ fontFamily: fonts.serif600, fontSize: size * 0.34, color: textColor }}>{initial}</Text>
      )}
    </View>
  );
}

/** A flat-top hexagon inscribed in the photo's box. */
function hexagonPoints(size: number): string {
  const r = size / 2;
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    return `${(r + r * Math.cos(angle)).toFixed(2)},${(r + r * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
}
