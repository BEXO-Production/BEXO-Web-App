import { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import Svg, { Polygon } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Sheet } from "@/components/ui/Sheet";
import { SectionLabel, Switch } from "@/components/ui/Controls";
import { CardBack, CardFront, type CardIdentity } from "@/components/IdentityCard";
import { CARD_FONTS, CARD_SKINS } from "@/lib/card-design";
import {
  BACK_HEADLINES,
  CARD_ACCENTS,
  CARD_FIELD_ROWS,
  CARD_PHOTO_SHAPES,
  STUDIO_DIMS,
  photoRadii,
  type CardPhotoShape,
} from "@/lib/design-data";
import { useCardDesign } from "@/lib/card-design-store";
import { useProfile } from "@/lib/use-profile";
import { uploadFile, useUpdateProfile } from "@/lib/profile-api";
import { useOverlay } from "@/lib/overlay-context";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";

/**
 * "Card Studio" — the full customization sheet. The live card stays pinned at
 * the top while the options scroll underneath, so every change is visible as
 * it is made. Finish and typeface persist to the profile API; the accent, back
 * headline and field toggles are device-local (no server field yet).
 */
export function CardStudioSheet({
  visible,
  onClose,
  identity,
}: {
  visible: boolean;
  onClose: () => void;
  identity: CardIdentity;
}) {
  const { c, shadow } = useTheme();
  const { design, setDesign, toggleField, reset } = useCardDesign();
  const { toast } = useOverlay();
  const { data } = useProfile();
  const updateProfile = useUpdateProfile();
  const [side, setSide] = useState<"front" | "back">("front");
  const [uploading, setUploading] = useState(false);

  const skin = CARD_SKINS.find((s) => s.id === design.skinId) ?? CARD_SKINS[0];

  const save = () => {
    if (data) {
      updateProfile.mutate({
        cardDesign: {
          background: design.skinId,
          font: design.fontId,
          accent: design.accentId,
          headline: design.headlineId,
          photoShape: design.photoShape,
          photoUrl: design.photoUrl,
          fields: design.fields,
        },
      });
    }
    toast("Card saved");
    onClose();
  };

  /** Any picture: a portrait, a logo, a mark — whatever belongs on the card. */
  const pickCardImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast("Photo access is off for BEXO");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    // Show it immediately from the local file, then swap in the uploaded URL —
    // the card should never sit blank while an upload is in flight.
    setDesign({ photoUrl: asset.uri });
    setUploading(true);
    try {
      const { url } = await uploadFile({ uri: asset.uri, name: "card-image.jpg", mimeType: "image/jpeg" });
      setDesign({ photoUrl: url });
    } catch {
      toast("Saved on this device — we'll retry the upload");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.88} padded={false}>
      <View style={{ paddingHorizontal: 20, gap: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: fonts.serif600, fontSize: 21, color: c.ink }}>Card studio</Text>
            <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.muted }}>
              Scroll to browse — your card stays live above.
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <Feather name="x" size={20} color={c.muted} />
          </Pressable>
        </View>

        <View style={{ alignItems: "center", gap: 10 }}>
          <View style={shadow.float}>
            {side === "front" ? (
              <CardFront identity={identity} design={design} d={STUDIO_DIMS} />
            ) : (
              <CardBack identity={identity} design={design} d={STUDIO_DIMS} />
            )}
          </View>
          <Pressable
            onPress={() => setSide((s) => (s === "front" ? "back" : "front"))}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Feather name="refresh-ccw" size={12} color={c.accentSoft} />
            <Text style={{ fontFamily: fonts.sans700, fontSize: 11.5, color: c.accentSoft }}>
              {side === "front" ? "Preview the back" : "Preview the front"}
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ padding: 20, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 10 }}>
          <SectionLabel>Layout</SectionLabel>
          <View style={{ flexDirection: "row", gap: 9 }}>
            {[
              { withPhoto: true, label: "With photo", icon: "image" as const },
              { withPhoto: false, label: "No photo", icon: "type" as const },
            ].map((option) => {
              const active = design.fields.photo === option.withPhoto;
              return (
                <Pressable
                  key={option.label}
                  onPress={() => setDesign({ fields: { ...design.fields, photo: option.withPhoto } })}
                  style={{
                    flex: 1,
                    minHeight: 46,
                    borderRadius: 13,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    borderWidth: 1.5,
                    borderColor: active ? c.accent : c.border,
                    backgroundColor: active ? c.accentWash : c.panel,
                  }}
                >
                  <Feather name={option.icon} size={14} color={active ? c.accentSoft : c.ink} />
                  <Text style={{ fontFamily: fonts.sans700, fontSize: 13, color: active ? c.accentSoft : c.ink }}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <SectionLabel>Picture</SectionLabel>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={pickCardImage}
              style={{
                flex: 1,
                minHeight: 46,
                borderRadius: 13,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                backgroundColor: c.panel,
                borderWidth: 1,
                borderColor: c.borderStrong,
              }}
            >
              {design.photoUrl ? (
                <Image source={{ uri: design.photoUrl }} style={{ width: 22, height: 22, borderRadius: 6 }} />
              ) : (
                <Feather name="upload" size={15} color={c.ink} />
              )}
              <Text style={{ fontFamily: fonts.sans700, fontSize: 13, color: c.ink }}>
                {uploading ? "Uploading…" : design.photoUrl ? "Replace image" : "Upload photo or logo"}
              </Text>
            </Pressable>

            {design.photoUrl ? (
              <Pressable
                accessibilityLabel="Remove card image"
                onPress={() => setDesign({ photoUrl: null })}
                style={{
                  minHeight: 46,
                  paddingHorizontal: 16,
                  borderRadius: 13,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: c.panel,
                  borderWidth: 1,
                  borderColor: c.border,
                }}
              >
                <Feather name="trash-2" size={15} color={c.danger} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <SectionLabel>Frame</SectionLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {CARD_PHOTO_SHAPES.map((option) => (
              <ShapeSwatch
                key={option.id}
                shape={option.id}
                label={option.label}
                selected={design.photoShape === option.id}
                onPress={() => setDesign({ photoShape: option.id })}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <SectionLabel>Finish</SectionLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {CARD_SKINS.map((option) => (
              <Swatch
                key={option.id}
                selected={design.skinId === option.id}
                size={46}
                onPress={() => setDesign({ skinId: option.id })}
                gradient={option.gradient as readonly [string, string, ...string[]]}
                label={option.name}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <SectionLabel>Accent colour</SectionLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {CARD_ACCENTS.map((option) => (
              <Swatch
                key={option.id}
                selected={design.accentId === option.id}
                size={42}
                onPress={() => setDesign({ accentId: option.id })}
                gradient={
                  option.hex
                    ? ([option.hex, option.hex] as const)
                    : ([skin.gradient[0], skin.rule] as const)
                }
                dashed={!option.hex}
                label={option.name}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <SectionLabel>Typeface</SectionLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
            {CARD_FONTS.map((option) => {
              const active = design.fontId === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => setDesign({ fontId: option.id })}
                  style={{
                    paddingVertical: 9,
                    paddingHorizontal: 15,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? c.accentEdge : c.border,
                    backgroundColor: active ? c.accentWash : c.panel,
                  }}
                >
                  <Text style={{ fontFamily: option.family, fontSize: 12.5, color: active ? c.accentSoft : c.muted }}>
                    {option.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <SectionLabel>Back headline</SectionLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {BACK_HEADLINES.map((option) => {
              const active = design.headlineId === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => setDesign({ headlineId: option.id })}
                  style={{
                    minHeight: 40,
                    paddingHorizontal: 14,
                    justifyContent: "center",
                    borderRadius: 999,
                    borderWidth: 1.5,
                    borderColor: active ? c.accent : c.border,
                    backgroundColor: active ? c.accentWash : c.panel,
                  }}
                >
                  <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: active ? c.accentSoft : c.ink }}>
                    {option.pre} {option.accent} {option.post}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <SectionLabel>Shown on the card</SectionLabel>
          {CARD_FIELD_ROWS.map((row) => (
            <View
              key={row.key}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 14,
                backgroundColor: c.panel,
                borderWidth: 1,
                borderColor: c.border,
              }}
            >
              <Text style={{ flex: 1, fontFamily: fonts.sans400, fontSize: 13.5, color: c.ink }}>{row.label}</Text>
              <Switch value={design.fields[row.key]} onToggle={() => toggleField(row.key)} />
            </View>
          ))}
        </View>
      </ScrollView>

      <View
        style={{
          flexDirection: "row",
          gap: 10,
          paddingHorizontal: 20,
          paddingTop: 14,
          borderTopWidth: 1,
          borderTopColor: c.border,
        }}
      >
        <Pressable
          onPress={save}
          style={{
            flex: 1,
            minHeight: 50,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.cta,
          }}
        >
          <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: c.onCta }}>
            {updateProfile.isPending ? "Saving…" : "Save card"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            reset();
          }}
          style={{
            minHeight: 50,
            paddingHorizontal: 18,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.panel,
            borderWidth: 1,
            borderColor: c.borderStrong,
          }}
        >
          <Text style={{ fontFamily: fonts.sans700, fontSize: 14, color: c.ink }}>Reset</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

function Swatch({
  selected,
  size,
  gradient,
  onPress,
  dashed,
  label,
}: {
  selected: boolean;
  size: number;
  gradient: readonly [string, string, ...string[]];
  onPress: () => void;
  dashed?: boolean;
  label: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        padding: 3,
        borderWidth: 2,
        borderColor: selected ? c.accent : "transparent",
        transform: [{ scale: selected ? 1.06 : 1 }],
      }}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          flex: 1,
          borderRadius: size / 2,
          borderWidth: dashed ? 1 : 0,
          borderColor: "rgba(255,255,255,0.5)",
          borderStyle: dashed ? "dashed" : "solid",
        }}
      />
    </Pressable>
  );
}

/** A little preview of each frame, so the choice is visual rather than verbal. */
function ShapeSwatch({
  shape,
  label,
  selected,
  onPress,
}: {
  shape: CardPhotoShape;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const size = 34;
  const radii = photoRadii(shape, size);

  return (
    <Pressable
      accessibilityLabel={label}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={{
        alignItems: "center",
        gap: 6,
        padding: 8,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: selected ? c.accent : "transparent",
        backgroundColor: selected ? c.accentWash : "transparent",
      }}
    >
      {shape === "hexagon" ? (
        <Svg width={size} height={size}>
          <Polygon
            points={Array.from({ length: 6 }, (_, i) => {
              const r = size / 2;
              const angle = (Math.PI / 3) * i - Math.PI / 6;
              return `${(r + r * Math.cos(angle)).toFixed(2)},${(r + r * Math.sin(angle)).toFixed(2)}`;
            }).join(" ")}
            fill={c.accentSoft}
          />
        </Svg>
      ) : (
        <View
          style={{
            width: size,
            height: size,
            backgroundColor: c.accentSoft,
            borderTopLeftRadius: radii.topLeft,
            borderTopRightRadius: radii.topRight,
            borderBottomLeftRadius: radii.bottomLeft,
            borderBottomRightRadius: radii.bottomRight,
          }}
        />
      )}
      <Text style={{ fontFamily: fonts.sans600, fontSize: 10, color: selected ? c.accentSoft : c.faint }}>
        {label}
      </Text>
    </Pressable>
  );
}
