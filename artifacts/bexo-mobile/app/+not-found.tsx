import { Text, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { colors } from "@/lib/theme";

/** Catches unknown routes, including bad `bexo://` deep links. */
export default function NotFound() {
  return (
    <Screen>
      <View className="flex-1 items-center justify-center">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-accentWash">
          <Feather name="compass" size={22} color={colors.accent} />
        </View>
        <Text className="mt-4 text-lg font-semibold text-ink">Page not found</Text>
        <Text className="mt-1.5 text-center text-sm text-muted">
          That link doesn't lead anywhere in the app.
        </Text>
        <View className="mt-6 w-full max-w-xs">
          <Button label="Go home" onPress={() => router.replace("/")} />
        </View>
      </View>
    </Screen>
  );
}
