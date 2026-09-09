import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";

/**
 * The back-button + Playfair title row used by every pushed sub-screen in the
 * canvas (Update, Network→person handled separately, Notifications, Search,
 * Resume parse, Achievement, Settings detail, Edit profile, Analytics, Inbox).
 */
export function SubScreenHeader({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack?: () => void;
  action?: { label: string; onPress: () => void };
}) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <Pressable
        accessibilityLabel="Go back"
        onPress={onBack ?? (() => router.back())}
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: c.panel,
          borderWidth: 1,
          borderColor: c.border,
        }}
      >
        <Feather name="arrow-left" size={18} color={c.muted} />
      </Pressable>
      <Text
        style={{
          flex: 1,
          fontFamily: fonts.serif600,
          fontSize: 24,
          letterSpacing: -0.4,
          color: c.ink,
        }}
      >
        {title}
      </Text>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: c.accentSoft }}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
