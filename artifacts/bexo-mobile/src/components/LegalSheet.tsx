import { Pressable, ScrollView, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Sheet } from "@/components/ui/Sheet";
import { LEGAL_TEXT } from "@/lib/design-data";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";

/** Terms and Privacy read in place, as a sheet — never a trip out to a browser. */
export function LegalSheet({
  which,
  onClose,
}: {
  which: "terms" | "privacy" | null;
  onClose: () => void;
}) {
  const { c } = useTheme();
  if (!which) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  const content = LEGAL_TEXT[which];

  return (
    <Sheet visible onClose={onClose} maxHeightRatio={0.78}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ flex: 1, fontFamily: fonts.serif600, fontSize: 20, color: c.ink }}>{content.title}</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Feather name="x" size={20} color={c.muted} />
        </Pressable>
      </View>
      <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}>Last updated August 2026</Text>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
        {content.paras.map((para) => (
          <Text key={para} style={{ fontFamily: fonts.sans400, fontSize: 13.5, lineHeight: 21, color: c.muted }}>
            {para}
          </Text>
        ))}
      </ScrollView>
    </Sheet>
  );
}
