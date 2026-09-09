import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import {
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_600SemiBold_Italic,
} from "@expo-google-fonts/playfair-display";
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";

/** The exact families the design canvas loads from Google Fonts. */
export const fontMap = {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_600SemiBold_Italic,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
};

/**
 * React Native has no synthetic bold/italic for custom fonts — you must name the
 * exact face. These aliases keep that detail in one place.
 */
export const fonts = {
  sans400: "PlusJakartaSans_400Regular",
  sans500: "PlusJakartaSans_500Medium",
  sans600: "PlusJakartaSans_600SemiBold",
  sans700: "PlusJakartaSans_700Bold",
  sans800: "PlusJakartaSans_800ExtraBold",
  serif600: "PlayfairDisplay_600SemiBold",
  serif600Italic: "PlayfairDisplay_600SemiBold_Italic",
  mono500: "SpaceGrotesk_500Medium",
  mono700: "SpaceGrotesk_700Bold",
} as const;
