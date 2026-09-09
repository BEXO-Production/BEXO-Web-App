import { Modal, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { FadeInView } from "@/components/ui/Motion";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bxSheet } from "@/lib/motion";
import { radii } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";

/**
 * The bottom-sheet shell every overlay in the canvas shares: a tappable scrim
 * that fades in, a rounded-top panel that rises with a 6px overshoot
 * (`bxSheet`), and a centered grab handle.
 */
export function Sheet({
  visible,
  onClose,
  children,
  maxHeightRatio = 0.86,
  scrim = "rgba(16,16,20,0.48)",
  padded = true,
  style,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeightRatio?: number;
  scrim?: string;
  padded?: boolean;
  style?: ViewStyle;
}) {
  const { c, shadow } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <FadeInView duration={220}  style={StyleSheet.absoluteFill}>
          <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: scrim }} />
        </FadeInView>

        <Animated.View
          entering={bxSheet()}
          style={[
            {
              backgroundColor: c.paper,
              borderTopLeftRadius: radii.sheet,
              borderTopRightRadius: radii.sheet,
              maxHeight: `${maxHeightRatio * 100}%`,
              paddingTop: 16,
              paddingBottom: Math.max(insets.bottom, 16) + (padded ? 14 : 0),
              paddingHorizontal: padded ? 20 : 0,
              gap: 14,
            },
            shadow.float,
            style,
          ]}
        >
          <GrabHandle />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

export function GrabHandle() {
  const { c } = useTheme();
  return (
    <View
      style={{
        width: 44,
        height: 4,
        borderRadius: 2,
        backgroundColor: c.border,
        alignSelf: "center",
      }}
    />
  );
}
