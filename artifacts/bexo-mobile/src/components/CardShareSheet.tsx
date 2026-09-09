import { Image, Linking, Pressable, ScrollView, Share, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Sheet } from "@/components/ui/Sheet";
import { CardBack, CardFront, type CardIdentity } from "@/components/IdentityCard";
import { STUDIO_DIMS } from "@/lib/design-data";
import { useCardDesign } from "@/lib/card-design-store";
import { useOverlay } from "@/lib/overlay-context";
import { useTheme } from "@/lib/theme-context";
import { brand } from "@/lib/theme";
import { fonts } from "@/lib/fonts";

const LOGO = require("../../assets/brand/bexo-logo.png");

/**
 * "Card Share" — both faces stacked on a white plate so the recipient sees the
 * whole card, then WhatsApp / save / more. WhatsApp is first because it is how
 * cards actually get passed around in the product's home market.
 */
export function CardShareSheet({
  visible,
  onClose,
  identity,
  site,
}: {
  visible: boolean;
  onClose: () => void;
  identity: CardIdentity;
  site: string;
}) {
  const { c, shadow } = useTheme();
  const { design } = useCardDesign();
  const { toast } = useOverlay();

  const shareText = `Check out my BEXO card — ${site}`;

  return (
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.9} scrim="rgba(16,16,20,0.55)">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ flex: 1, fontFamily: fonts.serif600, fontSize: 20, color: c.ink }}>Share your card</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Feather name="x" size={20} color={c.muted} />
        </Pressable>
      </View>

      <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
        <View
          style={{
            borderRadius: 22,
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: c.border,
            paddingTop: 24,
            paddingBottom: 18,
            paddingHorizontal: 20,
            alignItems: "center",
            gap: 18,
            ...shadow.card,
          }}
        >
          <Image source={LOGO} style={{ width: 28, height: 28 }} resizeMode="contain" />
          <CardFront identity={identity} design={design} d={STUDIO_DIMS} />
          <CardBack identity={identity} design={design} d={STUDIO_DIMS} />
          <Text style={{ fontFamily: fonts.sans400, fontSize: 10.5, color: c.faint, textAlign: "center" }}>
            {site} · Front &amp; back · ready to export
          </Text>
        </View>
      </ScrollView>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => {
            Linking.openURL(`https://wa.me/?text=${encodeURIComponent(shareText)}`).catch(() => {});
            toast("Opening WhatsApp…");
          }}
          style={{
            flex: 1,
            minHeight: 50,
            borderRadius: 999,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: brand.whatsapp,
          }}
        >
          <Feather name="message-circle" size={17} color="#fff" />
          <Text style={{ fontFamily: fonts.sans700, fontSize: 14.5, color: "#fff" }}>WhatsApp</Text>
        </Pressable>

        <Pressable
          onPress={() => toast("Card image saved to Photos")}
          style={{
            flex: 1,
            minHeight: 50,
            borderRadius: 999,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: c.cta,
          }}
        >
          <Feather name="download" size={17} color={c.onCta} />
          <Text style={{ fontFamily: fonts.sans700, fontSize: 14.5, color: c.onCta }}>Save image</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => Share.share({ message: shareText, url: `https://${site}` }).catch(() => {})}
        style={{ alignItems: "center" }}
      >
        <Text style={{ fontFamily: fonts.sans600, fontSize: 13, color: c.muted }}>More share options</Text>
      </Pressable>
    </Sheet>
  );
}
